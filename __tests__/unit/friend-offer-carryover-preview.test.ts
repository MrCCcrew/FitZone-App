import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groupFindUnique: vi.fn(),
  membershipFindUnique: vi.fn(),
  transaction: vi.fn(),
  previewMembershipSessionCarryoverTx: vi.fn(),
  isBlockingMembershipCarryoverReason: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    friendOfferGroup: {
      findUnique: mocks.groupFindUnique,
    },
    membership: {
      findUnique: mocks.membershipFindUnique,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/membership-session-carryover", () => ({
  previewMembershipSessionCarryoverTx:
    mocks.previewMembershipSessionCarryoverTx,
  isBlockingMembershipCarryoverReason:
    mocks.isBlockingMembershipCarryoverReason,
}));

import {
  FriendOfferCarryoverPreviewError,
  previewFriendOfferCarryoverForCustomer,
} from "@/lib/payments/friend-offer-carryover-preview";

function frozenGroup(overrides?: Partial<any>) {
  const now = new Date("2026-09-22T12:00:00.000Z");

  return {
    id: "group-1",
    status: "waiting",
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    offerTermsSnapshot: JSON.stringify({
      offerId: "offer-frozen",
      membershipId: "membership-frozen",
      sessionsCount: 12,
      durationDays: 30,
    }),
    eligibilitySnapshot: JSON.stringify({
      allowedClassTypes: ["karate"],
    }),
    config: {
      isActive: true,
      offer: {
        id: "offer-frozen",
        isActive: true,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    },
    participants: [
      {
        userId: "user-1",
        status: "joined",
      },
      {
        userId: "user-2",
        status: "paid",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.groupFindUnique.mockResolvedValue(frozenGroup());
  mocks.membershipFindUnique.mockResolvedValue({ kind: "subscription" });
  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => callback({}),
  );
  mocks.previewMembershipSessionCarryoverTx.mockResolvedValue({
    eligible: true,
    reason: "eligible",
    sourceMembershipId: "source-1",
    baseSessions: 12,
    freeCarryoverSessions: 4,
    transferredReservedUnits: 0,
    carryoverSessions: 4,
    expectedTotalSessions: 16,
    transferableBookingIds: [],
  });
  mocks.isBlockingMembershipCarryoverReason.mockReturnValue(false);
});

describe("Friend Offer frozen-contract carryover preview", () => {
  it("builds the target only from the frozen group contract", async () => {
    const now = new Date("2026-09-22T12:00:00.000Z");

    const result = await previewFriendOfferCarryoverForCustomer(
      "user-1",
      " FRIENDTOKEN ",
      now,
    );

    expect(mocks.groupFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inviteToken: "FRIENDTOKEN" },
      }),
    );

    expect(mocks.membershipFindUnique).toHaveBeenCalledWith({
      where: { id: "membership-frozen" },
      select: { kind: true },
    });

    expect(
      mocks.previewMembershipSessionCarryoverTx,
    ).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "user-1",
        target: {
          membershipId: "membership-frozen",
          offerId: "offer-frozen",
          eligibilitySnapshot: JSON.stringify({
            allowedClassTypes: ["karate"],
          }),
          allowedClassTypesSnapshot: null,
          baseSessions: 12,
          startDate: now,
          endDate: new Date("2026-10-22T12:00:00.000Z"),
          kind: "subscription",
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        baseSessions: 12,
        carryoverSessions: 4,
        expectedTotalSessions: 16,
        targetMembershipId: "membership-frozen",
        targetOfferId: "offer-frozen",
        blocking: false,
        previewedAt: "2026-09-22T12:00:00.000Z",
      }),
    );
  });

  it("uses the frozen contract for a committed group even after mutable offer expiry", async () => {
    const now = new Date("2026-09-22T12:00:00.000Z");

    mocks.groupFindUnique.mockResolvedValueOnce(
      frozenGroup({
        expiresAt: new Date(now.getTime() - 60_000),
        config: {
          isActive: false,
          offer: {
            id: "offer-frozen",
            isActive: false,
            expiresAt: new Date(now.getTime() - 60_000),
          },
        },
        participants: [
          { userId: "user-1", status: "joined" },
          { userId: "user-2", status: "paid" },
        ],
      }),
    );

    const result = await previewFriendOfferCarryoverForCustomer(
      "user-1",
      "FRIENDTOKEN",
      now,
    );

    expect(result.targetMembershipId).toBe("membership-frozen");
    expect(
      mocks.previewMembershipSessionCarryoverTx,
    ).toHaveBeenCalledTimes(1);
  });

  it("surfaces the carryover engine blocking decision without changing it", async () => {
    mocks.previewMembershipSessionCarryoverTx.mockResolvedValueOnce({
      eligible: false,
      reason: "pending_exchange_request",
      sourceMembershipId: "source-1",
      baseSessions: 12,
      freeCarryoverSessions: 0,
      transferredReservedUnits: 0,
      carryoverSessions: 0,
      expectedTotalSessions: 12,
      transferableBookingIds: [],
    });
    mocks.isBlockingMembershipCarryoverReason.mockReturnValueOnce(true);

    const result = await previewFriendOfferCarryoverForCustomer(
      "user-1",
      "FRIENDTOKEN",
      new Date("2026-09-22T12:00:00.000Z"),
    );

    expect(result.reason).toBe("pending_exchange_request");
    expect(result.blocking).toBe(true);
  });

  it("fails closed when the frozen membership identity is missing", async () => {
    mocks.groupFindUnique.mockResolvedValueOnce(
      frozenGroup({
        offerTermsSnapshot: JSON.stringify({
          offerId: "offer-frozen",
          sessionsCount: 12,
          durationDays: 30,
        }),
      }),
    );

    await expect(
      previewFriendOfferCarryoverForCustomer(
        "user-1",
        "FRIENDTOKEN",
        new Date("2026-09-22T12:00:00.000Z"),
      ),
    ).rejects.toBeInstanceOf(FriendOfferCarryoverPreviewError);

    expect(
      mocks.previewMembershipSessionCarryoverTx,
    ).not.toHaveBeenCalled();
  });
});
