import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  getCurrentAppUser: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  groupFindUnique: vi.fn(),
  groupUpdate: vi.fn(),
  groupUpdateMany: vi.fn(),
  participantFindFirst: vi.fn(),
  participantUpdateMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/booking/booking-policy", () => ({
  resolveBookingPolicy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    friendOfferGroup: {
      findUnique: mocks.groupFindUnique,
      update: mocks.groupUpdate,
      updateMany: mocks.groupUpdateMany,
    },
    friendOfferParticipant: {
      findFirst: mocks.participantFindFirst,
      updateMany: mocks.participantUpdateMany,
    },
  },
}));

import { DELETE as adminDelete } from
  "@/app/api/admin/friend-offers/matching/route";

import { DELETE as customerDelete } from
  "@/app/api/me/friend-offers/route";

import { assessFriendOfferGroupReadiness } from
  "@/lib/friend-offer-group-readiness";

function adminGroup(
  ownerStatus: string,
  ownerPaymentId: string | null = null,
) {
  return {
    id: "group-1",
    status: "ready",
    matchingEnabled: true,
    config: { requiredMembers: 2 },
    participants: [
      {
        id: "p1",
        userId: "owner",
        role: "creator",
        status: ownerStatus,
        paymentTransactionId: ownerPaymentId,
        userMembershipId: null,
        paymentTransaction: ownerPaymentId
          ? {
              status:
                ownerStatus === "paid" ? "paid" : "pending",
            }
          : null,
      },
      {
        id: "p2",
        userId: "invitee",
        role: "invited",
        status: "joined",
        paymentTransactionId: null,
        userMembershipId: null,
        paymentTransaction: null,
      },
    ],
  };
}

function customerGroup(
  otherStatus: string,
  otherPaymentId: string | null = null,
  otherMembershipId: string | null = null,
) {
  return {
    id: "group-1",
    status: "ready",
    creatorUserId: "owner",
    expiresAt: new Date(Date.now() + 3600000),
    participants: [
      {
        status: "joined",
        paymentTransactionId: null,
        userMembershipId: null,
        paymentTransaction: null,
      },
      {
        status: otherStatus,
        paymentTransactionId: otherPaymentId,
        userMembershipId: otherMembershipId,
        paymentTransaction: otherPaymentId
          ? { status: "pending" }
          : null,
      },
    ],
  };
}

function request(path: string, body: object) {
  return new Request("http://localhost" + path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminRequest() {
  return request("/api/admin/friend-offers/matching", {
    groupId: "group-1",
    participantId: "p2",
  });
}

async function requiredAdminDeleteResponse() {
  const response = await adminDelete(adminRequest());

  if (!response) {
    throw new Error("ADMIN_DELETE_UNDEFINED_RESPONSE");
  }

  return response;
}

function customerRequest() {
  return request("/api/me/friend-offers", {
    participantId: "p1",
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.requireAdminFeature.mockResolvedValue({
    user: { id: "admin" },
  });

  mocks.getCurrentAppUser.mockResolvedValue({
    id: "owner",
  });

  mocks.queryRaw.mockResolvedValue([
    { id: "group-1" },
  ]);

  mocks.groupFindUnique.mockResolvedValue(
    adminGroup("joined"),
  );

  mocks.participantFindFirst.mockResolvedValue({
    id: "p1",
    userId: "owner",
    role: "creator",
    group: customerGroup("joined"),
  });

  mocks.groupUpdate.mockResolvedValue({});
  mocks.groupUpdateMany.mockResolvedValue({
    count: 1,
  });
  mocks.participantUpdateMany.mockResolvedValue({
    count: 1,
  });

  mocks.transaction.mockImplementation(
    async (callback: Function) =>
      callback({
        $queryRaw: mocks.queryRaw,
        friendOfferGroup: {
          findUnique: mocks.groupFindUnique,
          update: mocks.groupUpdate,
          updateMany: mocks.groupUpdateMany,
        },
        friendOfferParticipant: {
          findFirst: mocks.participantFindFirst,
          updateMany: mocks.participantUpdateMany,
        },
      }),
  );
});

describe("Friend group economic commitment protection", () => {
  it.each([
    ["paid", "paid-payment"],
    ["checkout_started", "pending-payment"],
    ["checkout_claiming", null],
  ])(
    "admin cannot remove an unpaid member after %s",
    async (status, paymentId) => {
      mocks.groupFindUnique.mockResolvedValue(
        adminGroup(status!, paymentId),
      );

      const response = await requiredAdminDeleteResponse();

      expect(response.status).toBe(409);
      expect(mocks.participantUpdateMany)
        .not.toHaveBeenCalled();
      expect(mocks.groupUpdate)
        .not.toHaveBeenCalled();
    },
  );

  it("admin can remove member before any payment", async () => {
    const response = await requiredAdminDeleteResponse();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      nextStatus: "waiting",
    });

    expect(mocks.participantUpdateMany)
      .toHaveBeenCalledTimes(1);

    expect(mocks.groupUpdate).toHaveBeenCalledWith({
      where: { id: "group-1" },
      data: { status: "waiting" },
    });
  });

  it("admin cannot mutate group without row lock", async () => {
    mocks.queryRaw.mockResolvedValueOnce([]);

    const response = await requiredAdminDeleteResponse();

    expect(response.status).toBe(404);
    expect(mocks.groupFindUnique)
      .not.toHaveBeenCalled();
    expect(mocks.participantUpdateMany)
      .not.toHaveBeenCalled();
  });

  it.each([
    ["paid", "paid-payment", null],
    ["checkout_claiming", null, null],
    ["joined", "pending-payment", null],
    ["joined", null, "existing-membership"],
  ])(
    "customer cannot cancel after group commitment: %s",
    async (status, paymentId, membershipId) => {
      mocks.participantFindFirst.mockResolvedValue({
        id: "p1",
        userId: "owner",
        role: "creator",
        group: customerGroup(
          status!,
          paymentId,
          membershipId,
        ),
      });

      const response = await customerDelete(
        customerRequest(),
      );

      expect(response.status).toBe(409);
      expect(mocks.groupUpdateMany)
        .not.toHaveBeenCalled();
      expect(mocks.participantUpdateMany)
        .not.toHaveBeenCalled();
    },
  );

  it("customer can cancel untouched group", async () => {
    const response = await customerDelete(
      customerRequest(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      cancelled: true,
    });

    expect(mocks.groupUpdateMany)
      .toHaveBeenCalledTimes(1);

    expect(mocks.participantUpdateMany)
      .toHaveBeenCalledTimes(1);
  });

  it("customer gets 404 if group lock fails", async () => {
    mocks.queryRaw.mockResolvedValueOnce([]);

    const response = await customerDelete(
      customerRequest(),
    );

    expect(response.status).toBe(404);
    expect(mocks.participantFindFirst)
      .not.toHaveBeenCalled();
    expect(mocks.groupUpdateMany)
      .not.toHaveBeenCalled();
  });

  it("old paid group missing two members stays blocked", () => {
    const result = assessFriendOfferGroupReadiness({
      status: "waiting",
      priceSnapshotMinor: 70500,
      config: { requiredMembers: 3 },
      participants: [
        {
          userId: "historical-paid",
          status: "paid",
          shareAmountMinor: 23500,
        },
      ],
    });

    expect(result).toMatchObject({
      ready: false,
      joinedMembers: 1,
      missingMembers: 2,
    });
  });

  it("full group with one paid can accept remaining payments", () => {
    const result = assessFriendOfferGroupReadiness({
      status: "ready",
      priceSnapshotMinor: 58500,
      config: { requiredMembers: 3 },
      participants: [
        "paid",
        "joined",
        "joined",
      ].map((status, index) => ({
        userId: `friend-${index}`,
        status,
        shareAmountMinor: 19500,
      })),
    });

    expect(result.ready).toBe(true);
  });
});
