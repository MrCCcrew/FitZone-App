import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
}));

vi.mock("@/lib/payments/registry", () => {
  const provider = {
    key: "paymob",
    label: "Mock Paymob",
    enabled: true,
    supportsCards: true,
    createCheckout: mocks.checkout,
    verifyTransaction: vi.fn(),
  };

  return {
    getPaymentProvider: (key: string) =>
      key === "paymob" ? provider : null,
    getDefaultPaymentProvider: () => provider,
    listPaymentProviders: () => [provider],
  };
});

import { db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";

describe("Friend checkout service MySQL bridge", { timeout: 60000 }, () => {
  it("creates three valid independent payment sessions without prior memberships", async () => {
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
      throw new Error("UNSAFE_DATABASE_REFUSED");
    }

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("EXTERNAL_HTTP_FORBIDDEN");
    }));

    mocks.checkout.mockImplementation(async (input) => ({
      provider: "paymob",
      status: "requires_action",
      checkoutUrl:
        `https://checkout.test/friend/${input.transactionId}`,
      expiresAt: new Date(Date.now() + 600000),
      providerReference: `mock-${input.transactionId}`,
    }));

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const users: string[] = [];
    const participants: string[] = [];
    const payments: string[] = [];

    let planId = "";
    let offerId = "";
    let configId = "";
    let groupId = "";

    const makeInput = (index: number, amount = 190, userId = users[index]) => ({
      userId,
      provider: "paymob",
      purpose: "membership" as const,
      businessUnit: "club" as const,
      amount,
      paymentMethod: "paymob",
      membershipId: null,
      friendOfferShare: true as const,
      offerId,
      metadata: {
        source: "friend-offer",
        friendGroupId: groupId,
        friendParticipantId: participants[index],
        friendShareAmountMinor: 19000,
      },
    });

    try {
      for (let i = 0; i < 3; i++) {
        const user = await db.user.create({
          data: {
            email: `bridge-${i}-${suffix}@example.test`,
            name: `Bridge Customer ${i}`,
            emailVerified: new Date(),
          },
        });
        users.push(user.id);
      }

      const plan = await db.membership.create({
        data: {
          name: `Bridge Plan ${suffix}`,
          duration: 30,
          price: 570,
          walletBonus: 0,
          features: "[]",
        },
      });
      planId = plan.id;

      const offer = await db.offer.create({
        data: {
          title: `Bridge Offer ${suffix}`,
          membershipId: planId,
          type: "special",
          discount: 0,
          specialPrice: 570,
          sessionsCount: 12,
          durationDays: 30,
          isActive: true,
          expiresAt: new Date(Date.now() + 86400000),
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
          creatorUserId: users[0],
          inviteToken: `BRIDGE-${suffix}`.toUpperCase(),
          status: "waiting",
          priceSnapshotMinor: 57000,
          offerTermsSnapshot: JSON.stringify({
            offerId,
            membershipId: planId,
            specialPrice: 570,
            priceSnapshotMinor: 57000,
            requiredMembers: 3,
            durationDays: 30,
            sessionsCount: 12,
          }),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      groupId = group.id;

      for (let i = 0; i < 3; i++) {
        const participant = await db.friendOfferParticipant.create({
          data: {
            groupId,
            userId: users[i],
            role: i === 0 ? "creator" : "invited",
            status: "checkout_claiming",
            shareAmountMinor: 19000,
            attributionSnapshot: "{}",
          },
        });
        participants.push(participant.id);
      }

      await expect(
        createPaymentTransaction(makeInput(0, 190, users[1])),
      ).rejects.toThrow("FRIEND_OFFER_PAYMENT_PROOF_INVALID");

      await expect(
        createPaymentTransaction(makeInput(0, 191)),
      ).rejects.toThrow("FRIEND_OFFER_PAYMENT_PROOF_INVALID");

      expect(mocks.checkout).not.toHaveBeenCalled();

      for (let i = 0; i < 3; i++) {
        const input = makeInput(i);
        const result = await createPaymentTransaction(input);

        payments.push(result.id);

        expect(result.amount).toBe(190);
        expect(result.checkoutUrl).toContain("checkout.test");
        expect(result.status).toBe("requires_action");

        const saved = await db.paymentTransaction.findUniqueOrThrow({
          where: { id: result.id },
        });

        expect(saved.userId).toBe(users[i]);
        expect(saved.membershipId).toBeNull();
        expect(saved.offerId).toBe(offerId);
        expect(saved.amount).toBe(190);

        const metadata = JSON.parse(saved.metadata ?? "{}");
        expect(metadata.friendParticipantId).toBe(participants[i]);
        expect(metadata.friendGroupId).toBe(groupId);

        expect(await db.friendOfferParticipant.updateMany({
          where: {
            id: participants[i],
            userId: users[i],
            status: "checkout_claiming",
            paymentTransactionId: null,
          },
          data: {
            status: "checkout_started",
            paymentTransactionId: result.id,
          },
        })).toEqual({ count: 1 });

        await expect(
          createPaymentTransaction(input),
        ).rejects.toThrow("FRIEND_OFFER_PAYMENT_PROOF_INVALID");
      }

      expect(mocks.checkout).toHaveBeenCalledTimes(3);

      expect(new Set(payments).size).toBe(3);

      expect(await db.userMembership.count({
        where: { userId: { in: users }, offerId },
      })).toBe(0);

      console.info("FRIEND_SERVICE_PAYMENT_CREATION=PASS");
      console.info("CUSTOMER_ISOLATION=PASS");
      console.info("SHARE_AMOUNT_INTEGRITY=PASS");
      console.info("PROVIDER_CHECKOUT_MOCKED=PASS");

    } finally {
      if (payments.length) {
        await db.paymentTransaction.deleteMany({
          where: { id: { in: payments } },
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

      if (users.length) {
        await db.user.deleteMany({
          where: { id: { in: users } },
        });
      }

      vi.unstubAllGlobals();
    }

    expect(await db.paymentTransaction.count({
      where: { id: { in: payments } },
    })).toBe(0);

    expect(await db.user.count({
      where: { id: { in: users } },
    })).toBe(0);

    console.info("TEST_CUSTOMER_PAYMENT_RESIDUE=ZERO");
  });
});
