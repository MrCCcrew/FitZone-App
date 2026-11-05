import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>(
    "@/lib/email",
  );
  return {
    ...actual,
    sendSubscriptionEmail: vi.fn().mockResolvedValue(true),
    sendAdminSubscriptionNotification: vi.fn().mockResolvedValue(true),
  };
});

import { db } from "@/lib/db";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

describe("Three friends, 190 EGP each, real MySQL", { timeout: 90000 }, () => {
  it("waits for all three paid shares and activates exactly once", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");

    if (
      process.env.APP_ENV !== "test" ||
      process.env.NODE_ENV !== "test" ||
      url.protocol !== "mysql:" ||
      url.hostname !== "127.0.0.1" ||
      url.port !== "3306" ||
      decodeURIComponent(url.username) !== "fitzone_test_user" ||
      decodeURIComponent(url.pathname) !== "/fitzone_test"
    ) {
      throw new Error("UNSAFE_TEST_DATABASE_REFUSED");
    }

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("EXTERNAL_HTTP_FORBIDDEN_IN_TEST");
    }));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userIds: string[] = [];
    const participantIds: string[] = [];
    const paymentIds: string[] = [];

    let planId = "";
    let offerId = "";
    let configId = "";
    let groupId = "";

    try {
      for (let i = 0; i < 3; i++) {
        const user = await db.user.create({
          data: {
            email: `three-friend-${i}-${suffix}@example.test`,
            emailVerified: new Date(),
            name: `Three Friend Test ${i}`,
          },
        });
        userIds.push(user.id);
      }

      const plan = await db.membership.create({
        data: {
          name: `Three Friend Test Plan ${suffix}`,
          duration: 30,
          price: 570,
          walletBonus: 0,
          features: "[]",
        },
      });
      planId = plan.id;

      const offer = await db.offer.create({
        data: {
          title: `Three Friend Test Offer ${suffix}`,
          membershipId: planId,
          type: "special",
          discount: 0,
          specialPrice: 570,
          sessionsCount: 12,
          durationDays: 30,
          currentSubscribers: 0,
          maxSubscribers: 100,
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
          requiresBirthDate: true,
          requiresEgyptianNationalId: true,
          minAgeYears: 13,
          maxAgeYears: 25,
        },
      });
      offerId = offer.id;

      const config = await db.friendOfferConfig.create({
        data: {
          offerId,
          requiredMembers: 3,
          inviteExpiryHours: 24,
          isActive: true,
        },
      });
      configId = config.id;

      const group = await db.friendOfferGroup.create({
        data: {
          configId,
          creatorUserId: userIds[0],
          inviteToken: `THREE-${suffix}`.toUpperCase(),
          status: "waiting",
          priceSnapshotMinor: 57000,
          offerTermsSnapshot: JSON.stringify({
            offerId,
            membershipId: planId,
            title: offer.title,
            specialPrice: 570,
            priceSnapshotMinor: 57000,
            sessionsCount: 12,
            durationDays: 30,
            requiredMembers: 3,
          }),
          matchingEnabled: false,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      groupId = group.id;

      for (let i = 0; i < 3; i++) {
        const participant = await db.friendOfferParticipant.create({
          data: {
            groupId,
            userId: userIds[i],
            role: i === 0 ? "creator" : "invited",
            status: "checkout_started",
            shareAmountMinor: 19000,
            attributionSnapshot: "{}",
          },
        });
        participantIds.push(participant.id);

        const payment = await db.paymentTransaction.create({
          data: {
            userId: userIds[i],
            offerId,
            membershipId: null,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 190,
            currency: "EGP",
            status: "pending",
            paymentMethod: "paymob",
            externalReference: `three-test-${i}-${suffix}`,
            metadata: JSON.stringify({
              source: "friend-offer",
              friendGroupId: groupId,
              friendParticipantId: participant.id,
              friendInviteToken: group.inviteToken,
              friendShareAmountMinor: 19000,
            }),
          },
        });
        paymentIds.push(payment.id);

        await db.friendOfferParticipant.update({
          where: { id: participant.id },
          data: { paymentTransactionId: payment.id },
        });
      }

      expect(participantIds).toHaveLength(3);
      expect(paymentIds).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        await updatePaymentTransactionStatus(paymentIds[i], "paid", null);

        const result = await maybeFinalizeFriendOfferPayment(paymentIds[i]);

        expect(result.kind).toBe("friend_offer");

        if (i < 2) {
          expect(result.status).toBe("waiting");

          expect(await db.userMembership.count({
            where: { userId: { in: userIds }, offerId },
          })).toBe(0);
        } else {
          expect(result.status).toBe("completed");
        }
      }

      const memberships = await db.userMembership.findMany({
        where: { userId: { in: userIds }, offerId },
      });

      const participants = await db.friendOfferParticipant.findMany({
        where: { groupId },
      });

      const payments = await db.paymentTransaction.findMany({
        where: { id: { in: paymentIds } },
      });

      const completedGroup = await db.friendOfferGroup.findUniqueOrThrow({
        where: { id: groupId },
      });

      expect(completedGroup.status).toBe("completed");
      expect(memberships).toHaveLength(3);
      expect(participants).toHaveLength(3);
      expect(payments).toHaveLength(3);

      expect(new Set(memberships.map(m => m.userId)).size).toBe(3);
      expect(new Set(memberships.map(m => m.id)).size).toBe(3);

      for (const participant of participants) {
        expect(participant.status).toBe("activated");
        expect(participant.userMembershipId).toBeTruthy();

        const membership = memberships.find(
          m => m.id === participant.userMembershipId,
        );

        expect(membership?.userId).toBe(participant.userId);
        expect(membership?.status).toBe("active");
        expect(membership?.paymentAmount).toBe(190);
        expect(membership?.baseSessions).toBe(12);

        const payment = payments.find(
          p => p.id === participant.paymentTransactionId,
        );

        expect(payment?.status).toBe("paid");
        expect(payment?.amount).toBe(190);
        expect(payment?.membershipId).toBe(membership?.id);
      }

      // Repeat financial confirmations: no second entitlement.
      for (const id of paymentIds) {
        const retry = await maybeFinalizeFriendOfferPayment(id);
        expect(retry.status).toBe("completed");
      }

      expect(await db.userMembership.count({
        where: { userId: { in: userIds }, offerId },
      })).toBe(3);

      const finalOffer = await db.offer.findUniqueOrThrow({
        where: { id: offerId },
      });

      expect(finalOffer.currentSubscribers).toBe(3);

      console.info("THREE_FRIENDS_ALL_PAID=PASS");
      console.info("THREE_MEMBERSHIPS_ACTIVE=PASS");
      console.info("THREE_PAYMENTS_LINKED=PASS");
      console.info("DUPLICATE_ACTIVATION=NONE");

    } finally {
      // All cleanup is scoped to generated test identities.
      if (paymentIds.length) {
        await db.paymentTransaction.deleteMany({
          where: { id: { in: paymentIds } },
        });
      }

      if (userIds.length) {
        await db.notification.deleteMany({
          where: { userId: { in: userIds } },
        });

        await db.userMembership.deleteMany({
          where: { userId: { in: userIds } },
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

      if (planId) {
        await db.membership.deleteMany({
          where: { id: planId },
        });
      }

      if (userIds.length) {
        await db.notification.deleteMany({
          where: { userId: { in: userIds } },
        });
        await db.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }

      vi.unstubAllGlobals();
    }

    expect(await db.user.count({
      where: { id: { in: userIds } },
    })).toBe(0);

    expect(await db.paymentTransaction.count({
      where: { id: { in: paymentIds } },
    })).toBe(0);

    console.info("TEST_DATA_RESIDUE=ZERO");
  });
});
