import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { assertIndependentFriendEntitlementProof } from "@/lib/payments/friend-offer-independent-contract";

/**
 * Produces a non-redeemable pending_settlement entitlement, never a booking or
 * active membership. Provider proof is fetched internally, not caller-supplied.
 * getPaymentProvider("paymob").verifyTransaction is the same central
 * live Order-backed verifier used in updatePaymentTransactionStatus.
 */
export async function prepareIndependentFriendEntitlement(input: {
  participantId: string;
}) {
  if (!input.participantId?.trim()) {
    throw new Error("FRIEND_INDEPENDENT_IDENTITY_REQUIRED");
  }
  const candidate = await db.friendOfferParticipant.findUnique({
    where: { id: input.participantId },
    select: {
      id: true,
      paymentTransactionId: true,
      paymentTransaction: {
        select: {
          id: true, provider: true, status: true, userId: true,
          providerReference: true, externalReference: true,
          amount: true, currency: true, metadata: true, providerPayload: true,
        },
      },
    },
  });
  const attempt = candidate?.paymentTransaction;
  if (!candidate || !attempt || !candidate.paymentTransactionId ||
      candidate.paymentTransactionId !== attempt.id ||
      attempt.provider !== "paymob" || attempt.status !== "paid") {
    throw new Error("FRIEND_INDEPENDENT_PAYMENT_NOT_VERIFIABLE");
  }
  const provider = getPaymentProvider("paymob");
  if (!provider) throw new Error("FRIEND_INDEPENDENT_PROVIDER_UNAVAILABLE");
  const verified = await provider.verifyTransaction({
    id: attempt.id,
    providerReference: attempt.providerReference,
    externalReference: attempt.externalReference,
    amount: attempt.amount,
    currency: attempt.currency,
    metadata: attempt.metadata,
    providerPayload: attempt.providerPayload,
  });
  if (verified.status !== "paid") {
    throw new Error("FRIEND_INDEPENDENT_PAYMOB_ORDER_PROOF_REQUIRED");
  }
  return db.$transaction(async (tx) => {
    const locks = await tx.$queryRaw<Array<{id: string}>>`
      SELECT g.id FROM FriendOfferGroup g
      INNER JOIN FriendOfferParticipant p ON p.groupId = g.id
      WHERE p.id = ${input.participantId} FOR UPDATE
    `;
    if (locks.length !== 1) throw new Error("FRIEND_INDEPENDENT_GROUP_LOCK_REQUIRED");
    const participant = await tx.friendOfferParticipant.findUnique({
      where: { id: input.participantId },
      include: {
        group: {
          include: {
            config: {select: {requiredMembers: true}},
            participants: {where: {status: {not: "cancelled"}},select: {id: true, status: true, paymentTransactionId: true}},
          },
        },
        paymentTransaction: {select: {id: true,userId: true,status: true,amount: true,currency: true,offerId: true,membershipId: true,paidAt: true,provider: true,providerReference: true,externalReference: true,metadata: true,providerPayload: true}},
        independentEntitlement: true,
      },
    });
    if (!participant) throw new Error("FRIEND_INDEPENDENT_PARTICIPANT_MISSING");
    if (participant.group.individualInvitesEnabled !== true) {
      throw new Error("FRIEND_INDEPENDENT_HISTORIC_GROUP_IMMUTABLE");
    }
    if (participant.group.status === "cancelled" || participant.group.status === "expired") {
      throw new Error("FRIEND_INDEPENDENT_GROUP_CLOSED");
    }
    const payment = participant.paymentTransaction;
    if (!payment || !participant.paymentTransactionId || payment.id !== attempt.id || payment.status !== "paid" ||
        payment.userId !== participant.userId || payment.membershipId !== null ||
        !(payment.paidAt instanceof Date) || !Number.isFinite(payment.paidAt.getTime())) {
      throw new Error("FRIEND_INDEPENDENT_PAYMENT_IDENTITY_MISMATCH");
    }
    // Paymob was checked before the DB transaction. Reject any payment-data
    // drift observed after locking the group, including reference/payload edits.
    // The caller must retry with a fresh Paymob Order verification.
    if (payment.provider !== attempt.provider ||
        payment.providerReference !== attempt.providerReference ||
        payment.externalReference !== attempt.externalReference ||
        payment.amount !== attempt.amount ||
        payment.currency !== attempt.currency ||
        payment.userId !== attempt.userId ||
        payment.metadata !== attempt.metadata ||
        payment.providerPayload !== attempt.providerPayload) {
      throw new Error("FRIEND_INDEPENDENT_PAYMENT_PROOF_STALE");
    }
    const members = participant.group.participants;
    const fullyPaid = members.every(p => (p.status === "paid" || p.status === "activated") && Boolean(p.paymentTransactionId));
    assertIndependentFriendEntitlementProof({
      participantId: participant.id,
      userId: participant.userId,
      groupId: participant.groupId,
      paymentTransactionId: payment.id,
      amountMinor: participant.shareAmountMinor,
      currency: payment.currency as "EGP",
      requiredMembers: participant.group.config.requiredMembers,
      groupSize: members.length,
      groupFullyPaid: fullyPaid,
      providerOrderVerified: verified.status === "paid",
      isHistoricMembershipLinked: participant.userMembershipId !== null,
    });
    if (!Number.isSafeInteger(Math.round(payment.amount*100)) ||
        Math.abs(payment.amount * 100 - participant.shareAmountMinor) > 0.000001) {
      throw new Error("FRIEND_INDEPENDENT_AMOUNT_MISMATCH");
    }
    if (participant.independentEntitlement) {
      const existing = participant.independentEntitlement;
      if (existing.userId !== participant.userId || existing.paymentTransactionId !== payment.id) {
        throw new Error("FRIEND_INDEPENDENT_REPLAY_IDENTITY_MISMATCH");
      }
      return {id: existing.id, status: existing.status, alreadyPrepared: true};
    }
    let terms: unknown;
    try {terms = JSON.parse(participant.group.offerTermsSnapshot ?? "");} catch {throw new Error("FRIEND_INDEPENDENT_TERMS_MISSING");}
    if (!terms || typeof terms !== "object" || Array.isArray(terms)) throw new Error("FRIEND_INDEPENDENT_TERMS_INVALID");
    const record = terms as Record<string, unknown>;
    const duration = Number(record.durationDays ?? 30);
    const sessions = record.sessionsCount == null ? null : Number(record.sessionsCount);
    if (!Number.isSafeInteger(duration) || duration <= 0 || (sessions !== null && (!Number.isSafeInteger(sessions) || sessions < 0))) {
      throw new Error("FRIEND_INDEPENDENT_TERMS_INVALID");
    }
    const startDate = payment.paidAt;
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + duration);
    // This record does not grant booking/attendance until a separate
    // exact-once GL+rights settlement is complete.
    const created = await tx.friendOfferEntitlement.create({data: {
      participantId: participant.id,
      userId: participant.userId,
      paymentTransactionId: payment.id,
      status: "pending_settlement",
      startDate,
      endDate,
      totalSessions: sessions,
      eligibilitySnapshot: participant.group.eligibilitySnapshot ?? "{}",
      frozenTermsSnapshot: participant.group.offerTermsSnapshot ?? "{}",
    },select: {id:true,status:true}});
    return {id:created.id,status:created.status,alreadyPrepared:false};
  }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
}
