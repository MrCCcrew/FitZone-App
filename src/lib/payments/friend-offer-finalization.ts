import "server-only";

import { Prisma } from "@prisma/client";

import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { asDbTransactionClient, db } from "@/lib/db";
import { recoverPaidMembershipActivation } from "@/lib/payments/service";
import { bindMarketingFriendOfferToMembershipTx } from "@/lib/marketing-conversion-service";

type JsonRecord = Record<string, unknown>;

type FrozenOfferTerms = {
  offerId: string;
  membershipId: string;
  title?: string | null;
  titleEn?: string | null;
  specialPrice?: number | null;
  priceSnapshotMinor?: number;
  sessionsCount?: number | null;
  durationDays?: number | null;
  priceBefore?: number | null;
  requiredMembers?: number;
};

type FrozenAttribution = {
  partnerId?: string | null;
  partnerCodeId?: string | null;
  affiliateLinkId?: string | null;
  salesAgentUserId?: string | null;
  salesAgentId?: string | null;
  staffReferralLinkId?: string | null;
  trainerReferralLinkId?: string | null;
  nutritionReferralLinkId?: string | null;
};

function parseObject(
  value: string | null | undefined,
  label: string,
): JsonRecord {
  if (!value) {
    throw new Error(`${label}_MISSING`);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label}_INVALID_JSON`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label}_INVALID_OBJECT`);
  }

  return parsed as JsonRecord;
}

function parseFrozenOfferTerms(value: string | null): FrozenOfferTerms {
  const parsed = parseObject(value, "FRIEND_OFFER_TERMS");

  const offerId =
    typeof parsed.offerId === "string" ? parsed.offerId.trim() : "";

  const membershipId =
    typeof parsed.membershipId === "string" ? parsed.membershipId.trim() : "";

  if (!offerId || !membershipId) {
    throw new Error("FRIEND_OFFER_TERMS_MISSING_IDS");
  }

  return {
    ...(parsed as FrozenOfferTerms),
    offerId,
    membershipId,
  };
}

function parseFrozenAttribution(value: string | null): FrozenAttribution {
  if (!value) return {};

  const parsed = parseObject(value, "FRIEND_PARTICIPANT_ATTRIBUTION");

  const readId = (key: keyof FrozenAttribution) => {
    const raw = parsed[key];

    if (raw == null) return null;

    if (typeof raw !== "string" || raw.trim() === "") {
      throw new Error(`FRIEND_PARTICIPANT_ATTRIBUTION_INVALID_${String(key)}`);
    }

    return raw.trim();
  };

  return {
    partnerId: readId("partnerId"),
    partnerCodeId: readId("partnerCodeId"),
    affiliateLinkId: readId("affiliateLinkId"),
    salesAgentUserId: readId("salesAgentUserId"),
    salesAgentId: readId("salesAgentId"),
    staffReferralLinkId: readId("staffReferralLinkId"),
    trainerReferralLinkId: readId("trainerReferralLinkId"),
    nutritionReferralLinkId: readId("nutritionReferralLinkId"),
  };
}

function amountToMinor(value: number) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("FRIEND_PAYMENT_INVALID_AMOUNT");
  }

  return Math.round(amount * 100);
}

function minorToAmount(value: number) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("FRIEND_PARTICIPANT_INVALID_SHARE");
  }

  return value / 100;
}

function durationDaysFromTerms(terms: FrozenOfferTerms) {
  const value = Number(terms.durationDays ?? 30);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("FRIEND_OFFER_INVALID_DURATION");
  }

  return value;
}

function sessionsFromTerms(terms: FrozenOfferTerms) {
  if (terms.sessionsCount == null) return null;

  const value = Number(terms.sessionsCount);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error("FRIEND_OFFER_INVALID_SESSIONS");
  }

  return value;
}

function addUtcCalendarDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function ensureParticipantMembership(participantId: string) {
  return db.$transaction(
    async (tx) => {
      const participant = await tx.friendOfferParticipant.findUnique({
        where: { id: participantId },
        include: {
          group: {
            include: {
              config: {
                select: {
                  requiredMembers: true,
                },
              },
            },
          },
          paymentTransaction: {
            select: {
              id: true,
              userId: true,
              status: true,
              membershipId: true,
              offerId: true,
              amount: true,
            },
          },
          userMembership: {
            select: {
              id: true,
              userId: true,
              status: true,
            },
          },
        },
      });

      if (!participant) {
        throw new Error("FRIEND_PARTICIPANT_NOT_FOUND");
      }

      if (participant.status !== "paid" && participant.status !== "activated") {
        throw new Error(`FRIEND_PARTICIPANT_NOT_PAID:${participant.id}`);
      }

      const payment = participant.paymentTransaction;

      if (!payment || payment.status !== "paid") {
        throw new Error(
          `FRIEND_PARTICIPANT_PAYMENT_NOT_PAID:${participant.id}`,
        );
      }

      if (payment.userId !== participant.userId) {
        throw new Error(
          `FRIEND_PARTICIPANT_PAYMENT_USER_MISMATCH:${participant.id}`,
        );
      }

      if (
        participant.userMembership &&
        payment.membershipId === participant.userMembership.id
      ) {
        return {
          participantId: participant.id,
          userId: participant.userId,
          paymentTransactionId: payment.id,
          userMembershipId: participant.userMembership.id,
          alreadyLinked: true,
        };
      }

      if (participant.userMembershipId || payment.membershipId) {
        throw new Error(
          `FRIEND_PARTICIPANT_PARTIAL_LINK_STATE:${participant.id}`,
        );
      }

      const terms = parseFrozenOfferTerms(participant.group.offerTermsSnapshot);

      if (
        terms.requiredMembers != null &&
        Number(terms.requiredMembers) !==
          participant.group.config.requiredMembers
      ) {
        throw new Error(
          `FRIEND_GROUP_REQUIRED_MEMBERS_SNAPSHOT_MISMATCH:${participant.id}`,
        );
      }

      if (payment.offerId && payment.offerId !== terms.offerId) {
        throw new Error(
          `FRIEND_PARTICIPANT_PAYMENT_OFFER_MISMATCH:${participant.id}`,
        );
      }

      const attribution = parseFrozenAttribution(
        participant.attributionSnapshot,
      );

      const paymentAmount = minorToAmount(participant.shareAmountMinor);

      const paymentAmountMinor = amountToMinor(payment.amount);

      if (paymentAmountMinor !== participant.shareAmountMinor) {
        throw new Error(
          `FRIEND_PARTICIPANT_PAYMENT_AMOUNT_MISMATCH:${participant.id}`,
        );
      }

      const durationDays = durationDaysFromTerms(terms);
      const totalSessions = sessionsFromTerms(terms);

      const startDate = new Date();
      const endDate = addUtcCalendarDays(startDate, durationDays);

      const commissionSnapshot = await buildMembershipCommissionSnapshotTx(
        asDbTransactionClient(tx),
        {
          partnerId: attribution.partnerId ?? null,
          partnerCodeId: attribution.partnerCodeId ?? null,
          affiliateLinkId: attribution.affiliateLinkId ?? null,
          salesAgentUserId: attribution.salesAgentUserId ?? null,
          salesAgentId: attribution.salesAgentId ?? null,
          staffReferralLinkId: attribution.staffReferralLinkId ?? null,
          trainerReferralLinkId: attribution.trainerReferralLinkId ?? null,
          nutritionReferralLinkId: attribution.nutritionReferralLinkId ?? null,

          // New employee-referral classification is frozen per participant.
          customerUserId: participant.userId,
          staffReferralAsOfDate: startDate,

          // Friend offer price is a GROUP total.
          // Each participant's economic base is her frozen share.
          partnerCommissionBase: paymentAmount,
          customerPaidAmount: paymentAmount,
        },
      );

      const offerSnapshot = JSON.stringify({
        ...terms,
        originalPrice: Number(terms.priceBefore ?? terms.specialPrice ?? 0),
        finalPrice: paymentAmount,
        durationDays,
        sessionsCount: totalSessions,
        friendOffer: true,
        participantShareAmount: paymentAmount,
      });

      const membership = await tx.userMembership.create({
        data: {
          userId: participant.userId,
          membershipId: terms.membershipId,
          startDate,
          endDate,
          status: "pending_payment",
          pendingExpiresAt: null,
          paymentAmount,
          paymentMethod: "offer",
          offerTitle: typeof terms.title === "string" ? terms.title : null,
          offerId: terms.offerId,
          totalSessions,
          eligibilitySnapshot: participant.group.eligibilitySnapshot,
          bookingPatternSnapshot: null,
          offerSnapshot,
          allowedClassTypesSnapshot: null,
          snapshotDurationDays: durationDays,
          snapshotOriginalPrice: Number(
            terms.priceBefore ?? terms.specialPrice ?? paymentAmount,
          ),
          snapshotFinalPrice: paymentAmount,
          commissionSnapshot,
          salesAgentUserId: attribution.salesAgentUserId ?? null,
          partnerId: attribution.partnerId ?? null,
          partnerCodeId: attribution.partnerCodeId ?? null,
          affiliateLinkId: attribution.affiliateLinkId ?? null,
          salesAgentId: attribution.salesAgentId ?? null,
          staffReferralLinkId: attribution.staffReferralLinkId ?? null,
          trainerReferralLinkId: attribution.trainerReferralLinkId ?? null,
          nutritionReferralLinkId: attribution.nutritionReferralLinkId ?? null,
        },
        select: {
          id: true,
        },
      });

      const participantClaim = await tx.friendOfferParticipant.updateMany({
        where: {
          id: participant.id,
          userMembershipId: null,
          status: "paid",
        },
        data: {
          userMembershipId: membership.id,
        },
      });

      if (participantClaim.count !== 1) {
        throw new Error(
          `FRIEND_PARTICIPANT_MEMBERSHIP_CLAIM_FAILED:${participant.id}`,
        );
      }

      const paymentClaim = await tx.paymentTransaction.updateMany({
        where: {
          id: payment.id,
          status: "paid",
          membershipId: null,
        },
        data: {
          membershipId: membership.id,
        },
      });

      if (paymentClaim.count !== 1) {
        throw new Error(
          `FRIEND_PARTICIPANT_PAYMENT_LINK_FAILED:${participant.id}`,
        );
      }

      /*
       * Friend Offer had no UserMembership at checkout time.
       * Bind the already-frozen marketing conversion now, inside
       * the same Serializable transaction that owns both links.
       */
      await bindMarketingFriendOfferToMembershipTx(
        asDbTransactionClient(tx),
        {
          friendOfferParticipantId: participant.id,
          userMembershipId: membership.id,
        },
      );

      return {
        participantId: participant.id,
        userId: participant.userId,
        paymentTransactionId: payment.id,
        userMembershipId: membership.id,
        alreadyLinked: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function finalizeActivatedParticipant(input: {
  participantId: string;
  userId: string;
  userMembershipId: string;
}) {
  await db.$transaction(async (tx) => {
    const membership = await tx.userMembership.findUnique({
      where: { id: input.userMembershipId },
      select: {
        id: true,
        userId: true,
        status: true,
      },
    });

    if (
      !membership ||
      membership.userId !== input.userId ||
      membership.status !== "active"
    ) {
      throw new Error(`FRIEND_MEMBERSHIP_NOT_ACTIVE:${input.participantId}`);
    }

    // Persist first real activation marker without changing any booking,
    // payment, entitlement, or class-exchange behaviour.
    await tx.userMembership.updateMany({
      where: {
        id: input.userMembershipId,
        status: "active",
        activatedAt: null,
      },
      data: {
        activatedAt: new Date(),
      },
    });

    /*
     * Expire the customer's previous active membership only AFTER
     * the already-paid Friend Offer membership has activated.
     *
     * Excluding the newly activated membership makes retries safe.
     */
    await tx.userMembership.updateMany({
      where: {
        userId: input.userId,
        status: "active",
        id: {
          not: input.userMembershipId,
        },
      },
      data: {
        status: "expired",
      },
    });

    await tx.friendOfferParticipant.updateMany({
      where: {
        id: input.participantId,
        userMembershipId: input.userMembershipId,
        status: {
          in: ["paid", "activated"],
        },
      },
      data: {
        status: "activated",
      },
    });
  });
}

export async function maybeFinalizeFriendOfferPayment(
  paymentTransactionId: string,
) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
    select: {
      id: true,
      status: true,
      metadata: true,
    },
  });

  if (!payment || payment.status !== "paid") {
    return {
      kind: "not_friend_offer" as const,
      reason: "payment_not_paid" as const,
    };
  }

  let metadata: Record<string, unknown> | null = null;

  try {
    const parsed = payment.metadata
      ? (JSON.parse(payment.metadata) as unknown)
      : null;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = null;
  }

  if (metadata?.source !== "friend-offer") {
    return {
      kind: "not_friend_offer" as const,
      reason: "different_payment_source" as const,
    };
  }

  const groupId =
    typeof metadata.friendGroupId === "string"
      ? metadata.friendGroupId.trim()
      : "";

  if (!groupId) {
    throw new Error("FRIEND_PAYMENT_GROUP_ID_MISSING");
  }

  const result = await finalizeFriendOfferGroup(groupId);

  return {
    kind: "friend_offer" as const,
    groupId,
    status: result.completed ? ("completed" as const) : ("waiting" as const),
    alreadyCompleted:
      "alreadyCompleted" in result ? result.alreadyCompleted === true : false,
  };
}

async function withTransactionConflictRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
    }
  }
}

export async function finalizeFriendOfferGroup(groupId: string) {
  const trimmedGroupId = String(groupId ?? "").trim();

  if (!trimmedGroupId) {
    throw new Error("FRIEND_GROUP_ID_REQUIRED");
  }

  /*
   * Claim / validate the group under SERIALIZABLE isolation.
   *
   * A finalizing group is intentionally retryable after process
   * crashes. completed is also an idempotent success.
   */
  const claim = await withTransactionConflictRetry(() =>
    db.$transaction(
      async (tx) => {
        const group = await tx.friendOfferGroup.findUnique({
          where: {
            id: trimmedGroupId,
          },
          include: {
            config: {
              select: {
                requiredMembers: true,
              },
            },
            participants: {
              where: {
                status: {
                  not: "cancelled",
                },
              },
              orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                status: true,
                paymentTransactionId: true,
              },
            },
          },
        });

        if (!group) {
          throw new Error("FRIEND_GROUP_NOT_FOUND");
        }

        if (group.status === "completed") {
          return {
            alreadyCompleted: true,
            participantIds: group.participants.map(
              (participant) => participant.id,
            ),
          };
        }

        if (group.status === "expired" || group.status === "cancelled") {
          throw new Error(`FRIEND_GROUP_NOT_FINALIZABLE:${group.status}`);
        }

        if (group.participants.length !== group.config.requiredMembers) {
          return {
            alreadyCompleted: false,
            notReady: true,
            participantIds: [] as string[],
          };
        }

        const economicallyComplete = group.participants.every(
          (participant) =>
            (participant.status === "paid" ||
              participant.status === "activated") &&
            Boolean(participant.paymentTransactionId),
        );

        if (!economicallyComplete) {
          return {
            alreadyCompleted: false,
            notReady: true,
            participantIds: [] as string[],
          };
        }

        if (group.status === "finalizing") {
          const staleCutoff = new Date(Date.now() - 30_000);

          if (
            group.finalizingAt &&
            group.finalizingAt.getTime() > staleCutoff.getTime()
          ) {
            return {
              alreadyCompleted: false,
              notReady: false,
              inProgress: true,
              participantIds: [] as string[],
            };
          }

          const reclaimed = await tx.friendOfferGroup.updateMany({
            where: {
              id: group.id,
              status: "finalizing",
              OR: [
                { finalizingAt: null },
                {
                  finalizingAt: {
                    lte: staleCutoff,
                  },
                },
              ],
            },
            data: {
              finalizingAt: new Date(),
            },
          });

          if (reclaimed.count !== 1) {
            return {
              alreadyCompleted: false,
              notReady: false,
              inProgress: true,
              participantIds: [] as string[],
            };
          }
        } else {
          const claimed = await tx.friendOfferGroup.updateMany({
            where: {
              id: group.id,
              status: {
                in: ["waiting", "ready"],
              },
            },
            data: {
              status: "finalizing",
              finalizingAt: new Date(),
            },
          });

          if (claimed.count !== 1) {
            throw new Error("FRIEND_GROUP_FINALIZING_CLAIM_LOST");
          }
        }

        return {
          alreadyCompleted: false,
          notReady: false,
          participantIds: group.participants.map(
            (participant) => participant.id,
          ),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    ),
  );

  if (claim.alreadyCompleted) {
    return {
      completed: true,
      alreadyCompleted: true,
    };
  }

  if ("inProgress" in claim && claim.inProgress) {
    return {
      completed: false,
      inProgress: true,
    };
  }

  if ("notReady" in claim && claim.notReady) {
    return {
      completed: false,
      reason: "group_not_fully_paid" as const,
    };
  }

  /*
   * Process participants one-by-one.
   *
   * Each participant owns an independent payment + membership.
   * A crash after one activation is recoverable by calling this
   * function again.
   */
  for (const participantId of claim.participantIds) {
    const linked = await ensureParticipantMembership(participantId);

    await recoverPaidMembershipActivation(linked.paymentTransactionId);

    await finalizeActivatedParticipant({
      participantId: linked.participantId,
      userId: linked.userId,
      userMembershipId: linked.userMembershipId,
    });
  }

  const completed = await db.$transaction(
    async (tx) => {
      const group = await tx.friendOfferGroup.findUnique({
        where: {
          id: trimmedGroupId,
        },
        include: {
          config: {
            select: {
              requiredMembers: true,
            },
          },
          participants: {
            where: {
              status: {
                not: "cancelled",
              },
            },
            select: {
              status: true,
            },
          },
        },
      });

      if (!group) {
        throw new Error("FRIEND_GROUP_NOT_FOUND");
      }

      if (group.status === "completed") {
        return true;
      }

      const allActivated =
        group.participants.length === group.config.requiredMembers &&
        group.participants.every(
          (participant) => participant.status === "activated",
        );

      if (!allActivated) {
        return false;
      }

      const updated = await tx.friendOfferGroup.updateMany({
        where: {
          id: group.id,
          status: "finalizing",
        },
        data: {
          status: "completed",
          completedAt: new Date(),
        },
      });

      return updated.count === 1;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  if (!completed) {
    throw new Error("FRIEND_GROUP_FINALIZATION_INCOMPLETE");
  }

  return {
    completed: true,
    alreadyCompleted: false,
  };
}
