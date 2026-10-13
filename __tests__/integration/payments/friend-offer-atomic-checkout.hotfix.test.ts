import {
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";

const auth = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: auth.getCurrentAppUser,
}));

const gateway = vi.hoisted(() => ({
  createCheckout: vi.fn(),
}));

vi.mock("@/lib/payments/registry", () => {
  const provider = {
    key: "paymob",
    label: "TEST ONLY",
    enabled: true,
    supportsCards: true,
    createCheckout: gateway.createCheckout,
    verifyTransaction: vi.fn(),
  };

  return {
    getPaymentProvider: () => provider,
    getDefaultPaymentProvider: () => provider,
    listPaymentProviders: () => [provider],
  };
});

import {
  createPaymentTransaction,
} from "@/lib/payments/service";
import {
  markFriendOfferParticipantPaid,
} from "@/lib/payments/friend-offer-payment";
import {
  POST as friendCheckoutPOST,
} from "@/app/api/friend-offers/checkout/route";

const db = new PrismaClient();
const suffix = `friend-cas-${Date.now()}-${process.pid}`;

let userId = "";
let offerId = "";
let configId = "";
let groupId = "";
let participantId = "";
let paymentId = "";

function assertTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");

  if (
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    decodeURIComponent(url.username) !== "fitzone_test_user" ||
    url.pathname !== "/fitzone_test"
  ) {
    throw new Error("REFUSING_NON_ISOLATED_DATABASE");
  }
}

function friendPaymentInput(overrides: Record<string, unknown> = {}) {
  return {
    userId,
    provider: "paymob",
    purpose: "membership" as const,
    businessUnit: "club" as const,
    amount: 238,
    membershipId: null,
    offerId,
    friendOfferShare: true as const,
    metadata: {
      source: "friend-offer",
      friendGroupId: groupId,
      friendParticipantId: participantId,
      friendShareAmountMinor: 23800,
    },
    ...overrides,
  };
}

beforeAll(async () => {
  assertTestDatabase();

  const identity = await db.$queryRaw<
    Array<{ databaseName: string }>
  >`SELECT DATABASE() AS databaseName`;

  expect(identity[0]?.databaseName).toBe("fitzone_test");

  const user = await db.user.create({
    data: {
      name: `Test ${suffix}`,
      email: `${suffix}@test.local`,
      emailVerified: new Date(),
    },
  });
  userId = user.id;

  const offer = await db.offer.create({
    data: {
      title: `Test Friend CAS ${suffix}`,
      type: "special",
      discount: 0,
      specialPrice: 476,
      isActive: true,
      expiresAt: new Date(Date.now() + 3600000),
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
      creatorUserId: userId,
      inviteToken: suffix,
      priceSnapshotMinor: 47600,
      status: "waiting",
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  groupId = group.id;

  const participant = await db.friendOfferParticipant.create({
    data: {
      groupId,
      userId,
      role: "creator",
      status: "joined",
      shareAmountMinor: 23800,
    },
  });
  participantId = participant.id;

  gateway.createCheckout.mockImplementation(
    async (input: { transactionId: string }) => ({
      provider: "paymob",
      status: "pending",
      checkoutUrl: "https://checkout.example.test/mock-only",
      iframeUrl: null,
      providerReference: `MOCK-${input.transactionId}`,
      externalReference: null,
      expiresAt: new Date(Date.now() + 29 * 60000),
      payload: { testOnly: true },
    }),
  );
});

afterAll(async () => {
  try {
    if (paymentId) {
      await db.paymentTransaction.deleteMany({
        where: { id: paymentId },
      });
    }
    if (participantId) {
      await db.friendOfferParticipant.deleteMany({
        where: { id: participantId },
      });
    }
    if (groupId) {
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
    if (userId) {
      await db.user.deleteMany({
        where: { id: userId },
      });
    }
  } finally {
    await db.$disconnect();
  }
});

describe("Real MySQL friend checkout and simulated gateway", () => {
  it("preserves the ordinary membership checkout protection", async () => {
    await expect(
      createPaymentTransaction({
        userId,
        provider: "paymob",
        purpose: "membership",
        amount: 238,
        membershipId: null,
        offerId,
      }),
    ).rejects.toThrow("MEMBERSHIP_CHECKOUT_MISSING_MEMBERSHIP");

    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("rejects forged friend payment identity", async () => {
    await expect(
      createPaymentTransaction(friendPaymentInput({
        metadata: {
          source: "friend-offer",
          friendGroupId: groupId,
          friendParticipantId: "wrong-participant",
        },
      })),
    ).rejects.toThrow("FRIEND_OFFER_PAYMENT_PROOF_INVALID");

    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("allows exactly one atomic claim under concurrent MySQL requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        db.friendOfferParticipant.updateMany({
          where: {
            id: participantId,
            groupId,
            userId,
            paymentTransactionId: null,
            status: {
              in: ["joined", "checkout_started"],
            },
          },
          data: { status: "checkout_claiming" },
        }),
      ),
    );

    expect(results.reduce((sum, row) => sum + row.count, 0)).toBe(1);

    const actual = await db.friendOfferParticipant.findUniqueOrThrow({
      where: { id: participantId },
    });

    expect(actual.status).toBe("checkout_claiming");
    expect(actual.paymentTransactionId).toBeNull();
  });

  it("rejects an incorrect share amount before provider contact", async () => {
    await expect(
      createPaymentTransaction(friendPaymentInput({
        amount: 237,
      })),
    ).rejects.toThrow("FRIEND_OFFER_PAYMENT_PROOF_INVALID");

    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it("creates one real DB transaction using the mocked provider", async () => {
    const result = await createPaymentTransaction(
      friendPaymentInput(),
    );

    paymentId = result.id;

    expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
    expect(result.checkoutUrl).toBe(
      "https://checkout.example.test/mock-only",
    );

    const providerInput = gateway.createCheckout.mock.calls[0][0];
    const remainingMinutes = (
      providerInput.membershipHoldExpiresAt.getTime() - Date.now()
    ) / 60000;

    expect(remainingMinutes).toBeGreaterThan(28);
    expect(remainingMinutes).toBeLessThanOrEqual(30);

    const payment = await db.paymentTransaction.findUniqueOrThrow({
      where: { id: paymentId },
    });

    expect(payment).toMatchObject({
      userId,
      offerId,
      membershipId: null,
      purpose: "membership",
      provider: "paymob",
      amount: 238,
      status: "pending",
    });

    expect(payment.metadata).not.toContain(
      "31201010112345",
    );
  });

  it("links the payment once and rejects duplicate linking", async () => {
    const where = {
      id: participantId,
      groupId,
      userId,
      paymentTransactionId: null,
      status: "checkout_claiming",
    };

    const first = await db.friendOfferParticipant.updateMany({
      where,
      data: {
        paymentTransactionId: paymentId,
        status: "checkout_started",
      },
    });

    const second = await db.friendOfferParticipant.updateMany({
      where,
      data: {
        paymentTransactionId: paymentId,
        status: "checkout_started",
      },
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(0);

    const participant = await db.friendOfferParticipant.findUniqueOrThrow({
      where: { id: participantId },
    });

    expect(participant.paymentTransactionId).toBe(paymentId);
    expect(participant.status).toBe("checkout_started");

    const anotherClaim = await db.friendOfferParticipant.updateMany({
      where: {
        id: participantId,
        paymentTransactionId: null,
        status: {
          in: ["joined", "checkout_started"],
        },
      },
      data: { status: "checkout_claiming" },
    });

    expect(anotherClaim.count).toBe(0);
    expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
  });


  // EARLY_PAID_WEBHOOK_MYSQL_REGRESSION
  it("recovers the saved checkout through the real MySQL route", async () => {
    auth.getCurrentAppUser.mockResolvedValue({
      id: userId,
      name: "Test Friend",
      email: `${suffix}@test.local`,
    });

    await db.friendOfferParticipant.update({
      where: { id: participantId },
      data: {
        paymentTransactionId: null,
        status: "checkout_claiming",
        updatedAt: new Date(Date.now() - 120_000),
      },
    });

    const response = await friendCheckoutPOST(new Request(
      "http://localhost/api/friend-offers/checkout",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: suffix }),
      },
    ));

    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      success: true,
      recovered: true,
      reused: true,
      paymentTransactionId: paymentId,
    });

    const participant =
      await db.friendOfferParticipant.findUniqueOrThrow({
        where: { id: participantId },
      });

    expect(participant.status).toBe("checkout_started");
    expect(participant.paymentTransactionId).toBe(paymentId);
    expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it("repairs a verified paid webhook before checkout linking", async () => {
    await db.friendOfferParticipant.update({
      where: { id: participantId },
      data: {
        status: "checkout_claiming",
        paymentTransactionId: null,
      },
    });

    await db.paymentTransaction.update({
      where: { id: paymentId },
      data: {
        status: "paid",
        paidAt: new Date(),
      },
    });

    const result = await markFriendOfferParticipantPaid(paymentId);

    expect(result).toMatchObject({
      handled: true,
      alreadyPaid: false,
      participantId,
      groupId,
    });

    const participant =
      await db.friendOfferParticipant.findUniqueOrThrow({
        where: { id: participantId },
      });

    expect(participant.status).toBe("paid");
    expect(participant.paymentTransactionId).toBe(paymentId);

    const repeated = await markFriendOfferParticipantPaid(paymentId);

    expect(repeated).toMatchObject({
      handled: true,
      alreadyPaid: true,
    });

    expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

});
