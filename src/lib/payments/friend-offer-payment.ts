import "server-only";

import { db } from "@/lib/db";

function parseJson(value: string | null | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function markFriendOfferParticipantPaid(
  paymentTransactionId: string,
) {
  return db.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.findUnique({
      where: { id: paymentTransactionId },
      select: {
        id: true,
        userId: true,
        status: true,
        paidAt: true,
        membershipId: true,
        metadata: true,
      },
    });

    if (!payment || payment.status !== "paid") {
      return { handled: false, reason: "payment_not_paid" as const };
    }

    /*
     * Friend-offer share payments must remain unlinked from UserMembership
     * until the whole group is economically complete.
     */
    if (payment.membershipId) {
      return { handled: false, reason: "membership_already_linked" as const };
    }

    const metadata = parseJson(payment.metadata);

    if (metadata?.source !== "friend-offer") {
      return { handled: false, reason: "not_friend_offer" as const };
    }

    const participantId =
      typeof metadata.friendParticipantId === "string"
        ? metadata.friendParticipantId
        : "";

    const groupId =
      typeof metadata.friendGroupId === "string" ? metadata.friendGroupId : "";

    if (!participantId || !groupId) {
      return { handled: false, reason: "missing_friend_metadata" as const };
    }

    const participant = await tx.friendOfferParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        userId: true,
        groupId: true,
        paymentTransactionId: true,
        status: true,
      },
    });

    if (
      !participant ||
      participant.userId !== payment.userId ||
      participant.groupId !== groupId ||
      participant.paymentTransactionId !== payment.id
    ) {
      throw new Error("FRIEND_OFFER_PAYMENT_LINK_MISMATCH");
    }

    if (participant.status === "cancelled") {
      return { handled: false, reason: "participant_cancelled" as const };
    }

    if (participant.status === "paid" || participant.status === "activated") {
      return {
        handled: true,
        alreadyPaid: true,
        participantId: participant.id,
        groupId: participant.groupId,
      };
    }

    const updated = await tx.friendOfferParticipant.updateMany({
      where: {
        id: participant.id,
        paymentTransactionId: payment.id,
        status: "checkout_started",
      },
      data: {
        status: "paid",
        paidAt: payment.paidAt ?? new Date(),
      },
    });

    if (updated.count !== 1) {
      const current = await tx.friendOfferParticipant.findUnique({
        where: { id: participant.id },
        select: {
          status: true,
        },
      });

      if (current?.status === "paid" || current?.status === "activated") {
        return {
          handled: true,
          alreadyPaid: true,
          participantId: participant.id,
          groupId: participant.groupId,
        };
      }

      throw new Error("FRIEND_OFFER_PAID_CLAIM_FAILED");
    }

    return {
      handled: true,
      alreadyPaid: false,
      participantId: participant.id,
      groupId: participant.groupId,
    };
  });
}
