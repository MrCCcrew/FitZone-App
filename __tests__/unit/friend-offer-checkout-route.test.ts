import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  createPaymentTransaction: vi.fn(),
  previewFriendOfferCarryoverForCustomer: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),

  userFindUnique: vi.fn(),

  groupFindUnique: vi.fn(),

  participantUpdateMany: vi.fn(),
  participantFindUnique: vi.fn(),

  paymentFindUnique: vi.fn(),
  paymentUpdateMany: vi.fn(),

  partnerAffiliateFindUnique: vi.fn(),
  salesAgentFindUnique: vi.fn(),
  staffReferralFindUnique: vi.fn(),
  trainerReferralFindUnique: vi.fn(),
  nutritionReferralFindUnique: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/payments/service", () => ({
  createPaymentTransaction: mocks.createPaymentTransaction,
}));

vi.mock("@/lib/payments/friend-offer-carryover-preview", () => ({
  FriendOfferCarryoverPreviewError: class FriendOfferCarryoverPreviewError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  previewFriendOfferCarryoverForCustomer:
    mocks.previewFriendOfferCarryoverForCustomer,
}));

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    $transaction: mocks.transaction,
    user: {
      findUnique: mocks.userFindUnique,
    },
    friendOfferGroup: {
      findUnique: mocks.groupFindUnique,
    },
    friendOfferParticipant: {
      updateMany: mocks.participantUpdateMany,
      findUnique: mocks.participantFindUnique,
    },
    paymentTransaction: {
      findUnique: mocks.paymentFindUnique,
      updateMany: mocks.paymentUpdateMany,
    },
    partnerAffiliateLink: {
      findUnique: mocks.partnerAffiliateFindUnique,
    },
    salesAgent: {
      findUnique: mocks.salesAgentFindUnique,
    },
    staffReferralLink: {
      findUnique: mocks.staffReferralFindUnique,
    },
    trainerReferralLink: {
      findUnique: mocks.trainerReferralFindUnique,
    },
    nutritionReferralLink: {
      findUnique: mocks.nutritionReferralFindUnique,
    },
  },
}));

import { GET, POST } from "@/app/api/friend-offers/checkout/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/friend-offers/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function baseGroup(overrides?: Partial<any>) {
  const now = Date.now();

  return {
    id: "group-1",
    inviteToken: "FRIENDTOKEN",
    status: "waiting",
    expiresAt: new Date(now + 60_000),
    config: {
      isActive: true,
      offer: {
        id: "offer-1",
        title: "عرض الصحاب",
        isActive: true,
        expiresAt: new Date(now + 60_000),
      },
    },
    participants: [
      {
        id: "p1",
        userId: "user-1",
        status: "joined",
        shareAmountMinor: 28000,
        paymentTransactionId: null,
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
      {
        id: "p2",
        userId: "user-2",
        status: "paid",
        shareAmountMinor: 28000,
        paymentTransactionId: "paid-payment",
        attributionSnapshot: null,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getCurrentAppUser.mockResolvedValue({
    id: "user-1",
    name: "Friend One",
    email: "friend1@test.local",
  });

  mocks.userFindUnique.mockResolvedValue({
    emailVerified: new Date(),
    pendingPartnerRef: null,
    pendingAgentRef: null,
    pendingStaffRef: null,
    pendingTrainerRef: null,
    pendingNutritionRef: null,
  });

  mocks.groupFindUnique.mockResolvedValue(baseGroup());

  mocks.participantUpdateMany.mockResolvedValue({
    count: 1,
  });

  mocks.participantFindUnique.mockResolvedValue({
    id: "p1",
    userId: "user-1",
    status: "joined",
  });

  mocks.queryRaw.mockResolvedValue([]);

  mocks.transaction.mockImplementation(
    async (
      callback: (tx: {
        friendOfferParticipant: {
          updateMany:
            typeof mocks.participantUpdateMany;
          findUnique:
            typeof mocks.participantFindUnique;
        };
        $queryRaw: typeof mocks.queryRaw;
      }) => unknown,
    ) =>
      callback({
        friendOfferParticipant: {
          updateMany: mocks.participantUpdateMany,
          findUnique: mocks.participantFindUnique,
        },
        $queryRaw: mocks.queryRaw,
      }),
  );

  mocks.previewFriendOfferCarryoverForCustomer.mockResolvedValue({
    eligible: true,
    reason: "eligible",
    baseSessions: 12,
    freeCarryoverSessions: 4,
    transferredReservedUnits: 0,
    carryoverSessions: 4,
    expectedTotalSessions: 16,
    blocking: false,
    targetMembershipId: "membership-1",
    targetOfferId: "offer-1",
    previewedAt: "2026-09-22T12:00:00.000Z",
  });

  mocks.createPaymentTransaction.mockResolvedValue({
    id: "new-payment",
    status: "pending",
    checkoutUrl: "https://checkout.test/new",
    amount: 280,
  });

  mocks.paymentFindUnique.mockResolvedValue(null);
  mocks.paymentUpdateMany.mockResolvedValue({
    count: 1,
  });
});

describe("Friend Offer checkout route", () => {
  it("returns the authoritative frozen-contract carryover preview", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/friend-offers/checkout?token=FRIENDTOKEN",
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.carryover).toEqual(
      expect.objectContaining({
        carryoverSessions: 4,
        expectedTotalSessions: 16,
        blocking: false,
      }),
    );

    expect(
      mocks.previewFriendOfferCarryoverForCustomer,
    ).toHaveBeenCalledWith(
      "user-1",
      "FRIENDTOKEN",
    );

    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("blocks a fresh payment when the authoritative carryover preview is blocking", async () => {
    mocks.previewFriendOfferCarryoverForCustomer.mockResolvedValueOnce({
      eligible: false,
      reason: "pending_exchange_request",
      baseSessions: 12,
      freeCarryoverSessions: 0,
      transferredReservedUnits: 0,
      carryoverSessions: 0,
      expectedTotalSessions: 12,
      blocking: true,
      targetMembershipId: "membership-1",
      targetOfferId: "offer-1",
      previewedAt: "2026-09-22T12:00:00.000Z",
    });

    const response = await POST(
      request({ token: "FRIENDTOKEN" }),
    );

    expect(response.status).toBe(409);

    const body = await response.json();

    expect(body.carryover).toEqual(
      expect.objectContaining({
        blocking: true,
        reason: "pending_exchange_request",
      }),
    );

    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
  });
  it("reuses an already-started payment without applying a new-payment carryover blocker", async () => {
    mocks.groupFindUnique.mockResolvedValue(
      baseGroup({
        participants: [
          {
            id: "p1",
            userId: "user-1",
            status: "checkout_started",
            shareAmountMinor: 28000,
            paymentTransactionId: "existing-payment",
            attributionSnapshot: null,
          },
        ],
      }),
    );

    mocks.paymentFindUnique.mockResolvedValueOnce({
      id: "existing-payment",
      status: "pending",
      checkoutUrl: "https://checkout.test/existing",
      amount: 280,
    });

    const response = await POST(
      request({ token: "FRIENDTOKEN" }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.reused).toBe(true);
    expect(body.paymentTransactionId).toBe("existing-payment");
    expect(
      mocks.previewFriendOfferCarryoverForCustomer,
    ).not.toHaveBeenCalled();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("blocks unverified user", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({
      emailVerified: null,
    });

    const response = await POST(
      request({
        token: "FRIENDTOKEN",
      }),
    );

    expect(response.status).toBe(403);

    const body = await response.json();

    expect(body.needsVerification).toBe(true);

    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("releases terminal payment and creates a fresh checkout", async () => {
    mocks.groupFindUnique.mockResolvedValue(
      baseGroup({
        participants: [
          {
            id: "p1",
            userId: "user-1",
            status: "checkout_started",
            shareAmountMinor: 28000,
            paymentTransactionId: "old-failed-payment",
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
        ],
      }),
    );

    mocks.paymentFindUnique.mockResolvedValueOnce({
      id: "old-failed-payment",
      status: "failed",
      checkoutUrl: null,
      amount: 280,
    });

    const response = await POST(
      request({
        token: "FRIENDTOKEN",
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.reused).toBe(false);
    expect(body.paymentTransactionId).toBe("new-payment");

    expect(mocks.participantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentTransactionId: "old-failed-payment",
        }),
        data: {
          paymentTransactionId: null,
          status: "joined",
        },
      }),
    );

    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
  });

  it("allows remaining friend to pay after live offer expiry/inactivation when group already has a paid participant", async () => {
    const now = Date.now();

    mocks.groupFindUnique.mockResolvedValue(
      baseGroup({
        expiresAt: new Date(now - 60_000),
        config: {
          isActive: false,
          offer: {
            id: "offer-1",
            title: "عرض الصحاب",
            isActive: false,
            expiresAt: new Date(now - 60_000),
          },
        },
        participants: [
          {
            id: "p1",
            userId: "user-1",
            status: "joined",
            shareAmountMinor: 28000,
            paymentTransactionId: null,
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
          {
            id: "p2",
            userId: "user-2",
            status: "paid",
            shareAmountMinor: 28000,
            paymentTransactionId: "already-paid",
            attributionSnapshot: null,
          },
        ],
      }),
    );

    const response = await POST(
      request({
        token: "FRIENDTOKEN",
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.reused).toBe(false);

    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
  });
});
