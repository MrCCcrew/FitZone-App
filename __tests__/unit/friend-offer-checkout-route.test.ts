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
  paymentFindMany: vi.fn(),
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
      findMany: mocks.paymentFindMany,
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
        requiresBirthDate: false,
        requiresEgyptianNationalId: false,
        minAgeYears: null as number | null,
        maxAgeYears: null as number | null,
      },
    },
    participants: [
      {
        id: "p1",
        userId: "user-1",
        status: "joined",
        shareAmountMinor: 28000,
        updatedAt: new Date(now),
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
        updatedAt: new Date(now),
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
  mocks.paymentFindMany.mockResolvedValue([]);
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


// STUDENT_HOTFIX_ROUTE_REGRESSION
describe("Friend student checkout authorization regression", () => {
  const eligibleId = "31201010112345";
  const underageId = "31401010112345";

  function studentGroup() {
    const group = baseGroup();
    group.config.offer.requiresBirthDate = true;
    group.config.offer.requiresEgyptianNationalId = true;
    group.config.offer.minAgeYears = 13;
    group.config.offer.maxAgeYears = 25;
    return group;
  }

  it("rejects missing ID before creating any payment", async () => {
    mocks.groupFindUnique.mockResolvedValue(studentGroup());

    const response = await POST(request({ token: "FRIENDTOKEN" }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe(
      "EGYPTIAN_NATIONAL_ID_REQUIRED",
    );
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("rejects an underage participant before payment", async () => {
    mocks.groupFindUnique.mockResolvedValue(studentGroup());

    const response = await POST(request({
      token: "FRIENDTOKEN",
      egyptianNationalId: underageId,
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("AGE_NOT_ELIGIBLE");
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("permits an eligible participant with the dedicated friend payment contract", async () => {
    mocks.groupFindUnique.mockResolvedValue(studentGroup());

    const response = await POST(request({
      token: "FRIENDTOKEN",
      egyptianNationalId: eligibleId,
    }));

    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.success).toBe(true);
    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);

    const paymentInput = mocks.createPaymentTransaction.mock.calls[0][0];

    expect(paymentInput).toMatchObject({
      purpose: "membership",
      friendOfferShare: true,
      membershipId: null,
      offerId: "offer-1",
      amount: 280,
      metadata: {
        source: "friend-offer",
        friendGroupId: "group-1",
        friendParticipantId: "p1",
      },
    });

    expect(JSON.stringify(paymentInput)).not.toContain(eligibleId);
  });

  it("does not reuse an existing student payment without eligibility", async () => {
    const group = studentGroup();
    group.participants[0].status = "checkout_started";
    group.participants[0].paymentTransactionId = "existing-payment";

    mocks.groupFindUnique.mockResolvedValue(group);

    mocks.paymentFindUnique.mockResolvedValue({
      id: "existing-payment",
      status: "pending",
      checkoutUrl: "https://checkout.test/existing",
      amount: 280,
    });

    const response = await POST(request({ token: "FRIENDTOKEN" }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe(
      "EGYPTIAN_NATIONAL_ID_REQUIRED",
    );
    expect(mocks.paymentFindUnique).not.toHaveBeenCalled();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });
});


// FRIEND_ATOMIC_CHECKOUT_RACE_REGRESSION
describe("Friend Offer atomic checkout claim", () => {
  it("allows only one provider intention for concurrent requests", async () => {
    let claimed = false;
    let claimCalls = 0;

    mocks.participantUpdateMany.mockImplementation(
      async (input: any) => {
        if (input.data?.status === "checkout_claiming") {
          claimCalls += 1;

          expect(input.where).toMatchObject({
            paymentTransactionId: null,
            groupId: "group-1",
            userId: "user-1",
          });

          expect(input.where.status.in).toEqual(
            expect.arrayContaining(["joined", "checkout_started"]),
          );

          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }

        return { count: 1 };
      },
    );

    mocks.createPaymentTransaction.mockImplementation(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          id: "single-provider-intention",
          status: "pending",
          checkoutUrl: "https://checkout.test/single",
          amount: 280,
        };
      },
    );

    const responses = await Promise.all([
      POST(request({ token: "FRIENDTOKEN" })),
      POST(request({ token: "FRIENDTOKEN" })),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual(
      [200, 409],
    );

    expect(claimCalls).toBe(2);
    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not auto-release an ambiguous failed provider attempt", async () => {
    let claimed = false;

    mocks.participantUpdateMany.mockImplementation(
      async (input: any) => {
        if (input.data?.status === "checkout_claiming") {
          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }

        return { count: 1 };
      },
    );

    mocks.createPaymentTransaction.mockRejectedValue(
      new Error("SIMULATED_PROVIDER_FAILURE"),
    );

    const first = await POST(request({
      token: "FRIENDTOKEN",
    }));

    expect(first.status).toBe(503);
    expect((await first.json()).code).toBe(
      "FRIEND_OFFER_CHECKOUT_RECONCILIATION_REQUIRED",
    );

    const second = await POST(request({
      token: "FRIENDTOKEN",
    }));

    expect(second.status).toBe(409);
    expect(mocks.createPaymentTransaction).toHaveBeenCalledTimes(1);
  });
});


// FRIEND_CHECKOUT_STORED_RECOVERY_REGRESSION
describe("Friend checkout stored-session recovery", () => {
  function claimingGroup() {
    const group = baseGroup();
    Object.assign(group.participants[0], {
      status: "checkout_claiming",
      paymentTransactionId: null,
      updatedAt: new Date(Date.now() - 120_000),
    });
    return group;
  }

  function matchingPayment() {
    return {
      id: "original-payment",
      userId: "user-1",
      offerId: "offer-1",
      membershipId: null,
      status: "pending",
      amount: 280,
      currency: "EGP",
      checkoutUrl: "https://checkout.test/original",
      expiresAt: new Date(Date.now() + 20 * 60_000),
      metadata: JSON.stringify({
        source: "friend-offer",
        friendGroupId: "group-1",
        friendParticipantId: "p1",
        friendShareAmountMinor: 28000,
      }),
    };
  }

  it("recovers exactly one saved unexpired checkout", async () => {
    mocks.groupFindUnique.mockResolvedValue(claimingGroup());
    mocks.paymentFindMany.mockResolvedValue([matchingPayment()]);

    const response = await POST(request({ token: "FRIENDTOKEN" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      reused: true,
      recovered: true,
      paymentTransactionId: "original-payment",
      checkoutUrl: "https://checkout.test/original",
    });
    expect(mocks.participantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "checkout_claiming",
          paymentTransactionId: null,
        }),
        data: {
          status: "checkout_started",
          paymentTransactionId: "original-payment",
        },
      }),
    );
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("does not unlock a claim with no matching payment", async () => {
    mocks.groupFindUnique.mockResolvedValue(claimingGroup());

    const response = await POST(request({ token: "FRIENDTOKEN" }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(
      "FRIEND_CHECKOUT_REMOTE_RECONCILIATION_REQUIRED",
    );
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("rejects multiple payment candidates", async () => {
    mocks.groupFindUnique.mockResolvedValue(claimingGroup());
    mocks.paymentFindMany.mockResolvedValue([
      matchingPayment(),
      { ...matchingPayment(), id: "another-payment" },
    ]);

    const response = await POST(request({ token: "FRIENDTOKEN" }));
    expect(response.status).toBe(409);
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
    expect(mocks.createPaymentTransaction).not.toHaveBeenCalled();
  });

  it("does not recover an expired checkout", async () => {
    mocks.groupFindUnique.mockResolvedValue(claimingGroup());
    mocks.paymentFindMany.mockResolvedValue([{
      ...matchingPayment(),
      expiresAt: new Date(Date.now() - 60_000),
    }]);

    const response = await POST(request({ token: "FRIENDTOKEN" }));
    expect(response.status).toBe(409);
    expect(mocks.participantUpdateMany).not.toHaveBeenCalled();
  });
});
