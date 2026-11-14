import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import {
  previewMembershipSessionCarryoverTx,
  prepareMembershipSessionCarryoverTx,
  applyMembershipSessionCarryoverTx,
  isBlockingMembershipCarryoverReason,
  type MembershipCarryoverTargetContract,
} from "@/lib/membership-session-carryover";

const baseTarget: MembershipCarryoverTargetContract = {
  membershipId: "subscription-plan",
  offerId: null,
  eligibilitySnapshot: null,
  allowedClassTypesSnapshot: null,
  baseSessions: 8,
  startDate: new Date("2026-11-15T00:00:00Z"),
  endDate: new Date("2026-12-15T00:00:00Z"),
  kind: "subscription",
};

function source(
  id: string,
  kind: string,
  offerId: string | null = null,
) {
  return {
    id,
    membershipId: "subscription-plan",
    offerId,
    totalSessions: 5,
    eligibilitySnapshot: null,
    allowedClassTypesSnapshot: null,
    membership: { kind },
  };
}

function database(
  rows: ReturnType<typeof source>[] = [],
) {
  const findMany = vi.fn().mockResolvedValue(rows);

  const findUnique = vi.fn();

  const count = vi.fn().mockResolvedValue(0);

  const bookingFindMany = vi.fn().mockResolvedValue([]);

  const bookingUpdateMany = vi.fn();

  const membershipUpdateMany = vi.fn();

  const raw = vi.fn();

  const exchangeUpdateMany = vi.fn();

  const tx = {
    userMembership: {
      findMany,
      findUnique,
      updateMany: membershipUpdateMany,
    },
    classExchangeRequest: {
      count,
    },
    booking: {
      findMany: bookingFindMany,
      updateMany: bookingUpdateMany,
    },
    membershipClassExchange: {
      updateMany: exchangeUpdateMany,
    },
    $queryRaw: raw,
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    findMany,
    findUnique,
    count,
    bookingFindMany,
    bookingUpdateMany,
    membershipUpdateMany,
    exchangeUpdateMany,
    raw,
  };
}

describe("commercial carryover isolation", () => {
  it("does not query existing subscriptions when purchasing a package", async () => {
    const db = database([
      source("old-subscription", "subscription"),
    ]);

    const result = await previewMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: { ...baseTarget, kind: "package" },
      },
    );

    expect(result.reason).toBe("no_source");
    expect(result.eligible).toBe(false);
    expect(result.carryoverSessions).toBe(0);
    expect(result.expectedTotalSessions).toBe(8);
    expect(isBlockingMembershipCarryoverReason(result.reason)).toBe(false);
    expect(db.findMany).not.toHaveBeenCalled();
    expect(db.bookingFindMany).not.toHaveBeenCalled();
  });

  it("does not transfer subscription rights into an offer backed by a subscription template", async () => {
    const db = database([
      source("old-subscription", "subscription"),
    ]);

    const result = await prepareMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: {
          ...baseTarget,
          offerId: "direct-offer",
        },
      },
    );

    expect(result.reason).toBe("no_source");
    expect(result.sourceMembershipId).toBeNull();
    expect(result.transferableBookingIds).toEqual([]);
    expect(db.findMany).not.toHaveBeenCalled();
    expect(db.raw).not.toHaveBeenCalled();
  });

  it("retains the purchased rights when a paid package is activated", async () => {
    const db = database();

    db.findUnique.mockResolvedValue({
      id: "package-owner",
      userId: "customer",
      membershipId: "package-plan",
      offerId: null,
      status: "active",
      startDate: baseTarget.startDate,
      endDate: baseTarget.endDate,
      totalSessions: 8,
      baseSessions: 8,
      carryoverSessions: 0,
      carryoverFromMembershipId: null,
      carryoverAppliedAt: null,
      eligibilitySnapshot: null,
      allowedClassTypesSnapshot: null,
      membership: { kind: "package" },
    });

    const result = await applyMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        targetMembershipId: "package-owner",
      },
    );

    expect(result.reason).toBe("no_source");
    expect(result.appliedAt).toBeNull();
    expect(result.expectedTotalSessions).toBe(8);

    expect(db.findMany).not.toHaveBeenCalled();
    expect(db.bookingUpdateMany).not.toHaveBeenCalled();
    expect(db.membershipUpdateMany).not.toHaveBeenCalled();
    expect(db.exchangeUpdateMany).not.toHaveBeenCalled();
  });

  it("does not select legacy packages or offers as carryover sources", async () => {
    const db = database([
      source("legacy-package", "package"),
      source("legacy-offer", "subscription", "offer-1"),
      source("legacy-trial", "trial"),
    ]);

    const result = await previewMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: baseTarget,
      },
    );

    expect(db.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "customer",
          status: "active",
          offerId: null,
          membership: { kind: "subscription" },
        }),
      }),
    );

    expect(result.reason).toBe("no_source");
    expect(result.carryoverSessions).toBe(0);
    expect(result.sourceMembershipId).toBeNull();
    expect(db.bookingFindMany).not.toHaveBeenCalled();
  });

  it("preserves ordinary subscription renewal with independent rights present", async () => {
    const db = database([
      source("regular-subscription", "subscription"),
      source("package-one", "package"),
      source("package-two", "package"),
      source("offer-one", "subscription", "offer-1"),
    ]);

    const result = await previewMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: baseTarget,
      },
    );

    expect(result.reason).toBe("eligible");
    expect(result.sourceMembershipId).toBe(
      "regular-subscription",
    );
    expect(result.freeCarryoverSessions).toBe(5);
    expect(result.carryoverSessions).toBe(5);
    expect(result.expectedTotalSessions).toBe(13);

    expect(db.bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userMembershipId: "regular-subscription",
        }),
      }),
    );
  });

  it("still blocks multiple active ordinary subscription sources", async () => {
    const db = database([
      source("regular-one", "subscription"),
      source("regular-two", "subscription"),
      source("legacy-package", "package"),
    ]);

    const result = await previewMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: baseTarget,
      },
    );

    expect(result.reason).toBe("multiple_active_sources");
    expect(isBlockingMembershipCarryoverReason(result.reason)).toBe(true);
    expect(db.bookingFindMany).not.toHaveBeenCalled();
  });

  it("still leaves trial purchases outside carryover", async () => {
    const db = database();

    const result = await previewMembershipSessionCarryoverTx(
      db.tx,
      {
        userId: "customer",
        target: { ...baseTarget, kind: "trial" },
      },
    );

    expect(result.reason).toBe("target_trial");
    expect(result.carryoverSessions).toBe(0);
    expect(db.findMany).not.toHaveBeenCalled();
  });
});