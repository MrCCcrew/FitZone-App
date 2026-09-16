import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asDbTransactionClient, db } from "@/lib/db";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { lockMarketingConversionForFriendOfferTx } from "@/lib/marketing-conversion-service";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createdUserIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdUserMembershipIds: string[] = [];

let membershipPlanId = "";
let offerId = "";
let configId = "";
let groupId = "";
let participant1Id = "";
let participant2Id = "";
let payment1Id = "";
let payment2Id = "";
let user1Id = "";
let user2Id = "";
let marketingStaffId = "";
let marketingConversion1Id = "";
let marketingConversion2Id = "";

function testDbGuard() {
  const url = new URL(process.env.DATABASE_URL ?? "");

  if (
    process.env.APP_ENV !== "test" ||
    url.hostname !== "127.0.0.1" ||
    url.pathname.replace(/^\//, "") !== "fitzone_test"
  ) {
    throw new Error(
      `REFUSING: friend-offer integration requires fitzone_test on 127.0.0.1, got ${url.hostname}${url.pathname}`,
    );
  }
}

async function state() {
  const group = await db.friendOfferGroup.findUnique({
    where: { id: groupId },
    include: {
      participants: {
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    select: {
      currentSubscribers: true,
    },
  });

  const memberships = await db.userMembership.findMany({
    where: {
      userId: {
        in: [user1Id, user2Id],
      },
      offerId,
    },
  });

  const payments = await db.paymentTransaction.findMany({
    where: {
      id: {
        in: [payment1Id, payment2Id],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return {
    group,
    offer,
    memberships,
    payments,
  };
}

beforeAll(async () => {
  testDbGuard();

  const user1 = await db.user.create({
    data: {
      email: `friend-a-${suffix}@example.test`,
      emailVerified: new Date(),
      name: "Friend A",
    },
  });

  const user2 = await db.user.create({
    data: {
      email: `friend-b-${suffix}@example.test`,
      emailVerified: new Date(),
      name: "Friend B",
    },
  });

  user1Id = user1.id;
  user2Id = user2.id;
  createdUserIds.push(user1.id, user2.id);

  const marketingStaff = await db.user.create({
    data: {
      email: `friend-marketing-staff-${suffix}@example.test`,
      emailVerified: new Date(),
      name: "Friend Marketing Staff",
      role: "staff",
      isActive: true,
      marketingCommissionRate: 10,
      marketingCommissionType: "percentage",
    },
  });

  marketingStaffId = marketingStaff.id;
  createdUserIds.push(marketingStaff.id);

  const membershipPlan = await db.membership.create({
    data: {
      name: `Friend Test Plan ${suffix}`,
      nameEn: `Friend Test Plan ${suffix}`,
      duration: 30,
      price: 560,
      walletBonus: 0,
      features: JSON.stringify([]),
    },
  });

  membershipPlanId = membershipPlan.id;

  const offer = await db.offer.create({
    data: {
      title: `عرض الصحاب اختبار ${suffix}`,
      titleEn: `Friend Offer ${suffix}`,
      membershipId: membershipPlanId,
      type: "special",
      discount: 0,
      specialPrice: 560,
      sessionsCount: 12,
      durationDays: 30,
      currentSubscribers: 0,
      maxSubscribers: 100,
      isActive: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  offerId = offer.id;

  const config = await db.friendOfferConfig.create({
    data: {
      offerId,
      requiredMembers: 2,
      inviteExpiryHours: 24,
      isActive: true,
    },
  });

  configId = config.id;

  const group = await db.friendOfferGroup.create({
    data: {
      configId,
      creatorUserId: user1Id,
      inviteToken: `TEST-${suffix}`.toUpperCase(),
      status: "waiting",
      priceSnapshotMinor: 56000,
      offerTermsSnapshot: JSON.stringify({
        offerId,
        membershipId: membershipPlanId,
        title: offer.title,
        titleEn: offer.titleEn,
        specialPrice: 560,
        priceSnapshotMinor: 56000,
        sessionsCount: 12,
        durationDays: 30,
        requiredMembers: 2,
        capturedAt: new Date().toISOString(),
      }),
      eligibilitySnapshot: null,
      matchingEnabled: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  groupId = group.id;

  const p1 = await db.friendOfferParticipant.create({
    data: {
      groupId,
      userId: user1Id,
      role: "creator",
      status: "checkout_started",
      shareAmountMinor: 28000,
      attributionSnapshot: JSON.stringify({
        partnerId: null,
        partnerCodeId: null,
        affiliateLinkId: null,
        salesAgentUserId: null,
        salesAgentId: null,
        staffReferralLinkId: null,
        trainerReferralLinkId: null,
        nutritionReferralLinkId: null,
      }),
    },
  });

  const p2 = await db.friendOfferParticipant.create({
    data: {
      groupId,
      userId: user2Id,
      role: "invited",
      status: "checkout_started",
      shareAmountMinor: 28000,
      attributionSnapshot: JSON.stringify({
        partnerId: null,
        partnerCodeId: null,
        affiliateLinkId: null,
        salesAgentUserId: null,
        salesAgentId: null,
        staffReferralLinkId: null,
        trainerReferralLinkId: null,
        nutritionReferralLinkId: null,
      }),
    },
  });

  participant1Id = p1.id;
  participant2Id = p2.id;

  const payment1 = await db.paymentTransaction.create({
    data: {
      userId: user1Id,
      offerId,
      membershipId: null,
      purpose: "membership",
      businessUnit: "club",
      provider: "paymob",
      amount: 280,
      currency: "EGP",
      status: "pending",
      paymentMethod: "paymob",
      externalReference: `friend-pay-1-${suffix}`,
      metadata: JSON.stringify({
        source: "friend-offer",
        friendGroupId: groupId,
        friendParticipantId: participant1Id,
        friendInviteToken: group.inviteToken,
        friendShareAmountMinor: 28000,
      }),
    },
  });

  const payment2 = await db.paymentTransaction.create({
    data: {
      userId: user2Id,
      offerId,
      membershipId: null,
      purpose: "membership",
      businessUnit: "club",
      provider: "paymob",
      amount: 280,
      currency: "EGP",
      status: "pending",
      paymentMethod: "paymob",
      externalReference: `friend-pay-2-${suffix}`,
      metadata: JSON.stringify({
        source: "friend-offer",
        friendGroupId: groupId,
        friendParticipantId: participant2Id,
        friendInviteToken: group.inviteToken,
        friendShareAmountMinor: 28000,
      }),
    },
  });

  payment1Id = payment1.id;
  payment2Id = payment2.id;

  createdPaymentIds.push(payment1.id, payment2.id);

  await db.friendOfferParticipant.update({
    where: { id: participant1Id },
    data: {
      paymentTransactionId: payment1Id,
    },
  });

  await db.friendOfferParticipant.update({
    where: { id: participant2Id },
    data: {
      paymentTransactionId: payment2Id,
    },
  });

  /*
   * FRIEND_OFFER_MARKETING_INTEGRATION_TEST
   *
   * Simulate the successful checkout claim that now happens in the
   * real Friend Offer route: each customer's active marketing
   * conversion is frozen against that participant before payment.
   */
  const conversion1 = await db.marketingConversion.create({
    data: {
      customerId: user1Id,
      assignedStaffUserId: marketingStaffId,
      createdByUserId: marketingStaffId,
      status: "open",
      activeKey: user1Id,
    },
  });

  const conversion2 = await db.marketingConversion.create({
    data: {
      customerId: user2Id,
      assignedStaffUserId: marketingStaffId,
      createdByUserId: marketingStaffId,
      status: "open",
      activeKey: user2Id,
    },
  });

  marketingConversion1Id = conversion1.id;
  marketingConversion2Id = conversion2.id;

  await db.$transaction(async (tx) => {
    await lockMarketingConversionForFriendOfferTx(
      asDbTransactionClient(tx),
      {
        customerId: user1Id,
        friendOfferParticipantId: participant1Id,
        commissionBase: 280,
      },
    );

    await lockMarketingConversionForFriendOfferTx(
      asDbTransactionClient(tx),
      {
        customerId: user2Id,
        friendOfferParticipantId: participant2Id,
        commissionBase: 280,
      },
    );
  });
});

afterAll(async () => {
  if (marketingStaffId) {
    await db.marketingCommission.deleteMany({
      where: {
        staffUserId: marketingStaffId,
      },
    });
  }

  if (marketingConversion1Id || marketingConversion2Id) {
    await db.marketingConversion.deleteMany({
      where: {
        id: {
          in: [
            marketingConversion1Id,
            marketingConversion2Id,
          ].filter(Boolean),
        },
      },
    });
  }

  if (createdPaymentIds.length) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: {
          in: createdPaymentIds,
        },
      },
    });
  }

  const memberships = await db.userMembership.findMany({
    where: {
      userId: {
        in: createdUserIds,
      },
      offerId,
    },
    select: {
      id: true,
    },
  });

  createdUserMembershipIds.push(...memberships.map((row) => row.id));

  if (createdUserMembershipIds.length) {
    await db.notification.deleteMany({
      where: {
        userId: {
          in: createdUserIds,
        },
      },
    });

    await db.userMembership.deleteMany({
      where: {
        id: {
          in: createdUserMembershipIds,
        },
      },
    });
  }

  if (groupId) {
    await db.friendOfferParticipant.deleteMany({
      where: { groupId },
    });

    await db.friendOfferGroup.deleteMany({
      where: { id: groupId },
    });
  }

  if (configId) {
    await db.friendOfferConfig.deleteMany({
      where: { id: configId },
    });
  }

  if (offerId) {
    await db.offer.deleteMany({
      where: { id: offerId },
    });
  }

  if (membershipPlanId) {
    await db.membership.deleteMany({
      where: { id: membershipPlanId },
    });
  }

  if (createdUserIds.length) {
    await db.notification.deleteMany({
      where: {
        userId: {
          in: createdUserIds,
        },
      },
    });

    await db.user.deleteMany({
      where: {
        id: {
          in: createdUserIds,
        },
      },
    });
  }
});

describe(
  "Friend Offer — split payment + deferred activation",
  { timeout: 90000 },
  () => {
    it("first paid share does not activate anything", async () => {
      await updatePaymentTransactionStatus(payment1Id, "paid", null);

      const result = await maybeFinalizeFriendOfferPayment(payment1Id);

      expect(result.kind).toBe("friend_offer");

      if (result.kind === "friend_offer") {
        expect(result.status).toBe("waiting");
      }

      const current = await state();

      expect(current.group?.status).not.toBe("completed");

      expect(
        current.group?.participants.find((row) => row.id === participant1Id)
          ?.status,
      ).toBe("paid");

      expect(
        current.group?.participants.find((row) => row.id === participant2Id)
          ?.status,
      ).toBe("checkout_started");

      expect(current.memberships).toHaveLength(0);
      expect(current.offer?.currentSubscribers).toBe(0);

      const firstPayment = current.payments.find(
        (row) => row.id === payment1Id,
      );

      expect(firstPayment?.status).toBe("paid");
      expect(firstPayment?.membershipId).toBeNull();

      const marketingAfterFirstShare =
        await db.marketingCommission.findMany({
          where: {
            staffUserId: marketingStaffId,
          },
        });

      expect(marketingAfterFirstShare).toHaveLength(0);

      const conversionAfterFirstShare =
        await db.marketingConversion.findUniqueOrThrow({
          where: {
            id: marketingConversion1Id,
          },
        });

      expect(conversionAfterFirstShare.status).toBe("checkout_locked");
      expect(conversionAfterFirstShare.userMembershipId).toBeNull();
      expect(conversionAfterFirstShare.commissionRateSnapshot).toBe(10);
      expect(conversionAfterFirstShare.commissionBaseSnapshot).toBe(280);
    });

    it("last paid share finalizes both memberships exactly once", async () => {
      await updatePaymentTransactionStatus(payment2Id, "paid", null);

      const concurrentResults = await Promise.allSettled([
        maybeFinalizeFriendOfferPayment(payment2Id),
        maybeFinalizeFriendOfferPayment(payment2Id),
      ]);

      expect(
        concurrentResults.every((entry) => entry.status === "fulfilled"),
      ).toBe(true);

      const fulfilled = concurrentResults
        .filter(
          (
            entry,
          ): entry is PromiseFulfilledResult<
            Awaited<ReturnType<typeof maybeFinalizeFriendOfferPayment>>
          > => entry.status === "fulfilled",
        )
        .map((entry) => entry.value);

      expect(fulfilled).toHaveLength(2);

      expect(fulfilled.every((entry) => entry.kind === "friend_offer")).toBe(
        true,
      );

      expect(
        fulfilled.some(
          (entry) =>
            entry.kind === "friend_offer" && entry.status === "completed",
        ),
      ).toBe(true);

      const afterFinalization = await state();

      expect(afterFinalization.group?.status).toBe("completed");

      expect(
        afterFinalization.group?.participants.every(
          (row) => row.status === "activated",
        ),
      ).toBe(true);

      expect(afterFinalization.memberships).toHaveLength(2);

      expect(
        afterFinalization.memberships.every((row) => row.status === "active"),
      ).toBe(true);

      expect(
        new Set(afterFinalization.memberships.map((row) => row.userId)).size,
      ).toBe(2);

      expect(
        new Set(afterFinalization.memberships.map((row) => row.id)).size,
      ).toBe(2);

      for (const payment of afterFinalization.payments) {
        expect(payment.status).toBe("paid");
        expect(payment.membershipId).toBeTruthy();

        const membership = afterFinalization.memberships.find(
          (row) => row.id === payment.membershipId,
        );

        expect(membership).toBeTruthy();
        expect(membership?.userId).toBe(payment.userId);
      }

      expect(afterFinalization.offer?.currentSubscribers).toBe(2);

      const marketingConversions =
        await db.marketingConversion.findMany({
          where: {
            id: {
              in: [
                marketingConversion1Id,
                marketingConversion2Id,
              ],
            },
          },
          orderBy: {
            customerId: "asc",
          },
        });

      expect(marketingConversions).toHaveLength(2);

      expect(
        marketingConversions.every(
          (row) =>
            row.status === "converted" &&
            row.activeKey === null &&
            Boolean(row.userMembershipId) &&
            row.commissionTypeSnapshot === "percentage" &&
            row.commissionRateSnapshot === 10 &&
            row.commissionBaseSnapshot === 280,
        ),
      ).toBe(true);

      for (const conversion of marketingConversions) {
        const participant =
          afterFinalization.group?.participants.find(
            (row) =>
              row.id === conversion.friendOfferParticipantId,
          );

        expect(participant).toBeTruthy();
        expect(participant?.userMembershipId).toBe(
          conversion.userMembershipId,
        );
      }

      const marketingCommissions =
        await db.marketingCommission.findMany({
          where: {
            staffUserId: marketingStaffId,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

      expect(marketingCommissions).toHaveLength(2);

      expect(
        marketingCommissions.every(
          (row) =>
            row.amount === 28 &&
            row.status === "earned" &&
            row.commissionTypeSnapshot === "percentage" &&
            row.commissionRateSnapshot === 10 &&
            row.commissionBaseSnapshot === 280,
        ),
      ).toBe(true);

      expect(
        marketingCommissions.reduce(
          (sum, row) => sum + row.amount,
          0,
        ),
      ).toBe(56);

      expect(
        new Set(
          marketingCommissions.map(
            (row) => row.userMembershipId,
          ),
        ).size,
      ).toBe(2);

      const membershipIdsBeforeRetry = afterFinalization.memberships
        .map((row) => row.id)
        .sort();

      const retry1 = await maybeFinalizeFriendOfferPayment(payment1Id);

      const retry2 = await maybeFinalizeFriendOfferPayment(payment2Id);

      expect(retry1.kind).toBe("friend_offer");
      expect(retry2.kind).toBe("friend_offer");

      const afterRetry = await state();

      expect(afterRetry.memberships).toHaveLength(2);

      expect(afterRetry.memberships.map((row) => row.id).sort()).toEqual(
        membershipIdsBeforeRetry,
      );

      expect(afterRetry.offer?.currentSubscribers).toBe(2);

      expect(afterRetry.group?.status).toBe("completed");

      const commissionsAfterRetry =
        await db.marketingCommission.findMany({
          where: {
            staffUserId: marketingStaffId,
          },
        });

      expect(commissionsAfterRetry).toHaveLength(2);

      expect(
        commissionsAfterRetry.reduce(
          (sum, row) => sum + row.amount,
          0,
        ),
      ).toBe(56);
    });

    it("terminal Friend Offer payment failure automatically releases the marketing checkout lock", async () => {
      const failureSuffix =
        `${suffix}-marketing-failure-${Math.random()
          .toString(36)
          .slice(2, 7)}`;

      let failureUserId = "";
      let failureGroupId = "";
      let failureParticipantId = "";
      let failurePaymentId = "";
      let failureConversionId = "";

      try {
        const failureUser = await db.user.create({
          data: {
            email: `friend-marketing-failure-${failureSuffix}@example.test`,
            emailVerified: new Date(),
            name: "Friend Marketing Failure User",
          },
        });

        failureUserId = failureUser.id;

        const failureGroup = await db.friendOfferGroup.create({
          data: {
            configId,
            creatorUserId: failureUser.id,
            inviteToken: `FAIL-${failureSuffix}`.toUpperCase(),
            status: "waiting",
            priceSnapshotMinor: 56000,
            offerTermsSnapshot: JSON.stringify({
              offerId,
              membershipId: membershipPlanId,
              specialPrice: 560,
              priceSnapshotMinor: 56000,
              durationDays: 30,
              requiredMembers: 2,
            }),
            expiresAt: new Date(
              Date.now() + 24 * 60 * 60 * 1000,
            ),
          },
        });

        failureGroupId = failureGroup.id;

        const failureParticipant =
          await db.friendOfferParticipant.create({
            data: {
              groupId: failureGroup.id,
              userId: failureUser.id,
              role: "creator",
              status: "checkout_started",
              shareAmountMinor: 28000,
            },
          });

        failureParticipantId = failureParticipant.id;

        const failurePayment =
          await db.paymentTransaction.create({
            data: {
              userId: failureUser.id,
              offerId,
              membershipId: null,
              purpose: "membership",
              businessUnit: "club",
              provider: "paymob",
              amount: 280,
              currency: "EGP",
              status: "pending",
              paymentMethod: "paymob",
              externalReference:
                `friend-marketing-failure-${failureSuffix}`,
              metadata: JSON.stringify({
                source: "friend-offer",
                friendGroupId: failureGroup.id,
                friendParticipantId:
                  failureParticipant.id,
                friendShareAmountMinor: 28000,
              }),
            },
          });

        failurePaymentId = failurePayment.id;

        await db.friendOfferParticipant.update({
          where: {
            id: failureParticipant.id,
          },
          data: {
            paymentTransactionId: failurePayment.id,
          },
        });

        const failureConversion =
          await db.marketingConversion.create({
            data: {
              customerId: failureUser.id,
              assignedStaffUserId: marketingStaffId,
              createdByUserId: marketingStaffId,
              status: "open",
              activeKey: failureUser.id,
            },
          });

        failureConversionId = failureConversion.id;

        await db.$transaction(async (tx) => {
          await lockMarketingConversionForFriendOfferTx(
            asDbTransactionClient(tx),
            {
              customerId: failureUser.id,
              friendOfferParticipantId:
                failureParticipant.id,
              commissionBase: 280,
            },
          );
        });

        const locked =
          await db.marketingConversion.findUniqueOrThrow({
            where: {
              id: failureConversion.id,
            },
          });

        expect(locked.status).toBe("checkout_locked");
        expect(locked.friendOfferParticipantId).toBe(
          failureParticipant.id,
        );
        expect(locked.commissionBaseSnapshot).toBe(280);

        await updatePaymentTransactionStatus(
          failurePayment.id,
          "failed",
          null,
        );

        const failedPayment =
          await db.paymentTransaction.findUniqueOrThrow({
            where: {
              id: failurePayment.id,
            },
          });

        expect(failedPayment.status).toBe("failed");

        const released =
          await db.marketingConversion.findUniqueOrThrow({
            where: {
              id: failureConversion.id,
            },
          });

        expect(released.status).toBe("open");
        expect(released.activeKey).toBe(failureUser.id);
        expect(released.friendOfferParticipantId).toBeNull();
        expect(released.userMembershipId).toBeNull();
        expect(released.checkoutLockedAt).toBeNull();
        expect(released.commissionTypeSnapshot).toBeNull();
        expect(released.commissionRateSnapshot).toBeNull();
        expect(released.commissionBaseSnapshot).toBeNull();

        const failureCommissionCount =
          await db.marketingCommission.count({
            where: {
              marketingConversionId:
                failureConversion.id,
            },
          });

        expect(failureCommissionCount).toBe(0);

        /*
         * Terminal status retry must remain idempotent and must
         * not change the already-released conversion.
         */
        await updatePaymentTransactionStatus(
          failurePayment.id,
          "failed",
          null,
        );

        const afterFailureRetry =
          await db.marketingConversion.findUniqueOrThrow({
            where: {
              id: failureConversion.id,
            },
          });

        expect(afterFailureRetry.status).toBe("open");
        expect(
          afterFailureRetry.friendOfferParticipantId,
        ).toBeNull();
      } finally {
        if (failureConversionId) {
          await db.marketingCommission.deleteMany({
            where: {
              marketingConversionId:
                failureConversionId,
            },
          });

          await db.marketingConversion.deleteMany({
            where: {
              id: failureConversionId,
            },
          });
        }

        if (failureParticipantId) {
          await db.friendOfferParticipant.deleteMany({
            where: {
              id: failureParticipantId,
            },
          });
        }

        if (failurePaymentId) {
          await db.paymentTransaction.deleteMany({
            where: {
              id: failurePaymentId,
            },
          });
        }

        if (failureGroupId) {
          await db.friendOfferGroup.deleteMany({
            where: {
              id: failureGroupId,
            },
          });
        }

        if (failureUserId) {
          await db.notification.deleteMany({
            where: {
              userId: failureUserId,
            },
          });

          await db.user.deleteMany({
            where: {
              id: failureUserId,
            },
          });
        }
      }
    });

    it("recovers a stale partial finalization without duplicates", async () => {
      const current = await state();

      if (!current.group || current.group.status !== "completed") {
        throw new Error("TEST_PRECONDITION_GROUP_NOT_COMPLETED");
      }

      const participant1 = current.group.participants.find(
        (row) => row.id === participant1Id,
      );

      const participant2 = current.group.participants.find(
        (row) => row.id === participant2Id,
      );

      if (!participant1?.userMembershipId || !participant2?.userMembershipId) {
        throw new Error("TEST_PRECONDITION_MEMBERSHIP_LINKS_MISSING");
      }

      const membershipIdsBefore = current.memberships
        .map((row) => row.id)
        .sort();

      /*
       * Simulate a crash after participant 1 completed,
       * while participant 2 is still paid and linked.
       */
      await db.friendOfferGroup.update({
        where: { id: groupId },
        data: {
          status: "finalizing",
          completedAt: null,
          finalizingAt: new Date(Date.now() - 60_000),
        },
      });

      await db.friendOfferParticipant.update({
        where: { id: participant2Id },
        data: {
          status: "paid",
        },
      });

      await db.userMembership.update({
        where: {
          id: participant2.userMembershipId,
        },
        data: {
          status: "pending_payment",
        },
      });

      const result = await maybeFinalizeFriendOfferPayment(payment2Id);

      expect(result.kind).toBe("friend_offer");

      if (result.kind === "friend_offer") {
        expect(result.status).toBe("completed");
      }

      const recovered = await state();

      expect(recovered.group?.status).toBe("completed");

      expect(
        recovered.group?.participants.every(
          (row) => row.status === "activated",
        ),
      ).toBe(true);

      expect(recovered.memberships).toHaveLength(2);

      expect(recovered.memberships.map((row) => row.id).sort()).toEqual(
        membershipIdsBefore,
      );

      expect(
        recovered.memberships.every((row) => row.status === "active"),
      ).toBe(true);

      expect(recovered.offer?.currentSubscribers).toBe(2);
    });
  },
);
