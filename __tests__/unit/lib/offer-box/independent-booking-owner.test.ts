import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseEligibilityPolicySnapshot: vi.fn(),
  getEligibilityPolicySnapshotForSource: vi.fn(),
  isClassAllowedByEligibilitySnapshot: vi.fn(),
}));

vi.mock("@/lib/get-eligible-classes", () => ({
  parseEligibilityPolicySnapshot:
    mocks.parseEligibilityPolicySnapshot,
  getEligibilityPolicySnapshotForSource:
    mocks.getEligibilityPolicySnapshotForSource,
  isClassAllowedByEligibilitySnapshot:
    mocks.isClassAllowedByEligibilitySnapshot,
}));

vi.mock("@/lib/booking/health-booking-policy", () => ({
  assertUserCanBookClassByHealth: vi.fn(),
}));

vi.mock("@/lib/booking/booking-policy", () => ({
  resolveBookingPolicy: vi.fn(),
}));

vi.mock("@/lib/membership-session-units", () => ({
  sumMembershipBookingUnits: vi.fn(),
}));

import {
  applyMembershipBookingPlanTx,
  applyOfferBoxBookingPlanTx,
} from "@/lib/payments/membership-booking-plan";

const startDate = new Date("2026-11-10T10:00:00.000Z");
const endDate = new Date("2027-02-08T10:00:00.000Z");

const eligibility = {
  mode: "class_ids",
  classIds: [],
  classTypes: [],
  classTypeIds: [],
};

const baseInput = {
  userId: "test-user",
  startDate,
  endDate,
  selectedScheduleIds: [],
  source: {
    type: "offer" as const,
    id: "test-offer",
  },
  plan: {
    kind: "subscription",
    sessionsCount: 12,
    duration: 90,
  },
};

function makeTx(
  overrides: Record<string, unknown> = {},
) {
  return {
    offerBoxEntitlement: {
      findUnique: vi.fn().mockResolvedValue({
        id: "test-entitlement",
        userId: baseInput.userId,
        status: "active",
        startDate,
        endDate,
        totalSessions: 12,
        bookingPatternSnapshot: null,
        eligibilitySnapshot: "frozen-eligibility",
        ...overrides,
      }),
      updateMany: vi.fn(),
    },

    userMembership: {
      findUnique: vi.fn().mockResolvedValue({
        bookingPatternSnapshot: null,
        eligibilitySnapshot: "frozen-eligibility",
      }),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },

    booking: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

describe("R06D2A independent Offer Box booking owner", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.parseEligibilityPolicySnapshot
      .mockReturnValue(eligibility);

    mocks.getEligibilityPolicySnapshotForSource
      .mockResolvedValue(eligibility);
  });

  it("reads the independent entitlement without touching memberships", async () => {
    const tx = makeTx();

    const result = await applyOfferBoxBookingPlanTx({
      ...baseInput,
      tx,
      offerBoxEntitlementId: "test-entitlement",
    });

    expect(result.createdCount).toBe(0);
    expect(result.bookedSchedules).toEqual([]);

    expect(tx.offerBoxEntitlement.findUnique)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "test-entitlement" },
        }),
      );

    expect(tx.userMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.userMembership.create).not.toHaveBeenCalled();
    expect(tx.userMembership.update).not.toHaveBeenCalled();
    expect(tx.userMembership.updateMany).not.toHaveBeenCalled();

    expect(mocks.getEligibilityPolicySnapshotForSource)
      .not.toHaveBeenCalled();
  });

  it("rejects another customer's entitlement", async () => {
    const tx = makeTx({
      userId: "different-user",
    });

    await expect(
      applyOfferBoxBookingPlanTx({
        ...baseInput,
        tx,
        offerBoxEntitlementId: "test-entitlement",
      }),
    ).rejects.toThrow(
      "OFFER_BOX_BOOKING_OWNER_CONTRACT_MISMATCH",
    );

    expect(tx.userMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it("rejects non-active independent entitlement", async () => {
    const tx = makeTx({
      status: "cancelled",
    });

    await expect(
      applyOfferBoxBookingPlanTx({
        ...baseInput,
        tx,
        offerBoxEntitlementId: "test-entitlement",
      }),
    ).rejects.toThrow(
      "OFFER_BOX_BOOKING_OWNER_CONTRACT_MISMATCH",
    );
  });

  it("rejects altered purchase-time session rights", async () => {
    const tx = makeTx({
      totalSessions: 6,
    });

    await expect(
      applyOfferBoxBookingPlanTx({
        ...baseInput,
        tx,
        offerBoxEntitlementId: "test-entitlement",
      }),
    ).rejects.toThrow(
      "OFFER_BOX_BOOKING_OWNER_CONTRACT_MISMATCH",
    );

    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it("fails closed without frozen eligibility and never reads live offer terms", async () => {
    const tx = makeTx();

    mocks.parseEligibilityPolicySnapshot
      .mockReturnValue(null);

    await expect(
      applyOfferBoxBookingPlanTx({
        ...baseInput,
        tx,
        offerBoxEntitlementId: "test-entitlement",
      }),
    ).rejects.toThrow(
      "OFFER_BOX_FROZEN_ELIGIBILITY_REQUIRED",
    );

    expect(mocks.getEligibilityPolicySnapshotForSource)
      .not.toHaveBeenCalled();
  });

  it("preserves the existing membership booking entry point", async () => {
    const tx = makeTx();

    const result = await applyMembershipBookingPlanTx({
      ...baseInput,
      tx,
      userMembershipId: "legacy-membership",
    });

    expect(result.createdCount).toBe(0);

    expect(tx.userMembership.findUnique)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "legacy-membership" },
        }),
      );

    expect(tx.offerBoxEntitlement.findUnique)
      .not.toHaveBeenCalled();
  });
});