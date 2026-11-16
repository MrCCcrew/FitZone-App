import "server-only";

import { Prisma } from "@prisma/client";
import { db, asDbTransactionClient } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { prepareIndependentFriendEntitlement } from "@/lib/payments/friend-offer-independent-preparation";
import { postIndependentFriendOfferJournal } from "@/lib/accounting-service";
import { accrueIndependentFriendCommissionsTx } from "@/lib/commissions/friend-offer-independent-commission";
import { accrueIndependentFriendMarketingConversionTx } from "@/lib/marketing-conversion-service";

/**
 * One economic close for ALL group members. Paid participants never become
 * active until both the GL and frozen commission ledgers are committed.
 * Historical membership-linked groups do not use this flow.
 */
export async function settleIndependentFriendOfferGroup(groupId: string) {
  if (!groupId?.trim()) throw new Error("FRIEND_INDEPENDENT_GROUP_REQUIRED");
  const group = await db.friendOfferGroup.findUnique({
    where: {id: groupId},
    include: {
      config: {select: {requiredMembers: true}},
      participants: {where: {status: {not: "cancelled"}},
        select: {id: true, status: true, paymentTransactionId: true}},
    },
  });
  if (!group || group.individualInvitesEnabled !== true)
    throw new Error("FRIEND_INDEPENDENT_GROUP_NOT_ELIGIBLE");
  if (["cancelled", "expired"].includes(group.status))
    throw new Error("FRIEND_INDEPENDENT_GROUP_CLOSED");
  if (group.participants.length !== group.config.requiredMembers ||
      !group.participants.every(p => ["paid", "activated"].includes(p.status) && Boolean(p.paymentTransactionId)))
    return {completed: false, reason: "group_not_fully_paid" as const};

  // Verify every Paymob Order/transaction independently BEFORE taking SQL locks.
  // Every active settlement carries a snapshot to reject DB identity drift.
  const provider = getPaymentProvider("paymob");
  if (!provider) throw new Error("FRIEND_INDEPENDENT_PROVIDER_UNAVAILABLE");
  const evidence = new Map<string, {
    id: string; userId: string; provider: string; status: string;
    providerReference: string | null; externalReference: string | null;
    amount: number; currency: string; metadata: string | null; providerPayload: string | null;
  }>();
  for (const p of [...group.participants].sort((a,b) => a.id.localeCompare(b.id))) {
    const payment = await db.paymentTransaction.findUnique({
      where: {id: p.paymentTransactionId!},
      select: {id: true, userId: true, provider: true, status: true,
        providerReference: true, externalReference: true, amount: true,
        currency: true, metadata: true, providerPayload: true},
    });
    if (!payment || payment.provider !== "paymob" || payment.status !== "paid")
      throw new Error("FRIEND_INDEPENDENT_PAYMENT_NOT_VERIFIABLE");
    const verified = await provider.verifyTransaction({
      id: payment.id, providerReference: payment.providerReference,
      externalReference: payment.externalReference, amount: payment.amount,
      currency: payment.currency, metadata: payment.metadata,
      providerPayload: payment.providerPayload,
    });
    if (verified.status !== "paid") throw new Error("FRIEND_INDEPENDENT_PROVIDER_ORDER_NOT_PAID");
    if (!payment.userId) {
      throw new Error("FRIEND_INDEPENDENT_PAYMENT_OWNER_MISSING");
    }
    evidence.set(p.id, { ...payment, userId: payment.userId });
  }

  // Preparation will independently re-verify the provider and create only
  // pending_settlement rights. A failure cannot activate anything.
  for (const p of [...group.participants].sort((a,b) => a.id.localeCompare(b.id))) {
    await prepareIndependentFriendEntitlement({participantId: p.id});
  }

  return db.$transaction(async tx => {
    const locked = await tx.$queryRaw<Array<{id: string}>>`
      SELECT id FROM FriendOfferGroup WHERE id = ${groupId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("FRIEND_INDEPENDENT_GROUP_LOCK_REQUIRED");
    const current = await tx.friendOfferGroup.findUnique({
      where: {id: groupId},
      include: {config: {select: {requiredMembers: true}},
        participants: {where: {status: {not: "cancelled"}},
          include: {paymentTransaction: true, independentEntitlement: true}}},
    });
    if (!current || current.individualInvitesEnabled !== true ||
        ["cancelled", "expired"].includes(current.status) ||
        current.participants.length !== current.config.requiredMembers)
      throw new Error("FRIEND_INDEPENDENT_GROUP_CHANGED");
    const participants = [...current.participants].sort((a,b) => a.id.localeCompare(b.id));
    for (const p of participants) {
      if (!p.paymentTransactionId) throw new Error("FRIEND_INDEPENDENT_PAYMENT_LINK_MISSING");
      await tx.$queryRaw`SELECT id FROM PaymentTransaction WHERE id = ${p.paymentTransactionId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM FriendOfferEntitlement WHERE participantId = ${p.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${p.userId} FOR UPDATE`;
      const payment = await tx.paymentTransaction.findUnique({where: {id: p.paymentTransactionId}});
      const original = evidence.get(p.id);
      const right = await tx.friendOfferEntitlement.findUnique({where: {participantId: p.id}});
      if (!payment || !original || !right ||
          right.participantId !== p.id || right.userId !== p.userId ||
          right.paymentTransactionId !== payment.id ||
          p.userMembershipId !== null || payment.membershipId !== null ||
          payment.userId !== p.userId || payment.provider !== "paymob" || payment.status !== "paid" ||
          !["paid", "activated"].includes(p.status) ||
          payment.id !== original.id || payment.userId !== original.userId ||
          payment.providerReference !== original.providerReference ||
          payment.externalReference !== original.externalReference ||
          payment.amount !== original.amount || payment.currency !== original.currency ||
          payment.metadata !== original.metadata || payment.providerPayload !== original.providerPayload ||
          !payment.paidAt || p.shareAmountMinor !== Math.round(payment.amount * 100) ||
          payment.currency !== "EGP")
        throw new Error("FRIEND_INDEPENDENT_PAYMENT_PROOF_STALE");
      let metadata: Record<string, unknown>;
      try {const parsed: unknown = JSON.parse(payment.metadata ?? "");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
        metadata = parsed as Record<string, unknown>;
      } catch {throw new Error("FRIEND_INDEPENDENT_PAYMENT_METADATA_INVALID");}
      if (metadata.source !== "friend-offer" || metadata.friendGroupId !== groupId ||
          metadata.friendParticipantId !== p.id || metadata.friendShareAmountMinor !== p.shareAmountMinor)
        throw new Error("FRIEND_INDEPENDENT_PAYMENT_METADATA_MISMATCH");
      if (!p.independentCommissionSnapshot)
        throw new Error("FRIEND_INDEPENDENT_COMMISSION_SNAPSHOT_MISSING_MANUAL_REVIEW");
      if (right.status === "active") {
        const journal = await tx.journal.findUnique({
          where: {referenceType_referenceId: {referenceType: "FriendOfferPayment", referenceId: payment.id}},
          include: {entries: {include: {account: {select: {code: true}}}}},
        });
        if (!journal || journal.status !== "posted" || journal.entries.length !== 2 ||
            !journal.entries.some(e => e.account.code === "1030" && Math.round(Number(e.debit) * 100) === p.shareAmountMinor && Number(e.credit) === 0) ||
            !journal.entries.some(e => e.account.code === "4020" && Math.round(Number(e.credit) * 100) === p.shareAmountMinor && Number(e.debit) === 0))
          throw new Error("FRIEND_INDEPENDENT_EXISTING_GL_MISMATCH");
        await accrueIndependentFriendCommissionsTx(asDbTransactionClient(tx), p.id, p.independentCommissionSnapshot);
        await accrueIndependentFriendMarketingConversionTx(asDbTransactionClient(tx), p.id, p.userId, p.shareAmountMinor);
        continue;
      }
      if (right.status !== "pending_settlement") throw new Error("FRIEND_INDEPENDENT_RIGHT_NOT_PENDING");
      // An orphaned journal without a committed active right must never double-post.
      const journal = await postIndependentFriendOfferJournal(
        tx, payment.id, p.shareAmountMinor);
      if (!journal) throw new Error("FRIEND_INDEPENDENT_UNMARKED_JOURNAL_MANUAL_REVIEW");
      await accrueIndependentFriendCommissionsTx(asDbTransactionClient(tx), p.id, p.independentCommissionSnapshot);
      await accrueIndependentFriendMarketingConversionTx(asDbTransactionClient(tx), p.id, p.userId, p.shareAmountMinor);
      const claim = await tx.friendOfferEntitlement.updateMany({
        where: {id: right.id, status: "pending_settlement", userId: p.userId, paymentTransactionId: payment.id},
        data: {status: "active"},
      });
      if (claim.count !== 1) throw new Error("FRIEND_INDEPENDENT_RIGHT_ACTIVATION_CONFLICT");
      await tx.friendOfferParticipant.updateMany({
        where: {id: p.id, userMembershipId: null, status: {in: ["paid", "activated"]}},
        data: {status: "activated"},
      });
    }
    if (current.status !== "completed") {
      const result = await tx.friendOfferGroup.updateMany({
        where: {id: groupId, status: {in: ["waiting", "ready", "finalizing"]}},
        data: {status: "completed", completedAt: new Date()},
      });
      if (result.count !== 1) throw new Error("FRIEND_INDEPENDENT_GROUP_COMPLETION_CONFLICT");
    }
    return {completed: true as const, alreadyCompleted: current.status === "completed"};
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
}
