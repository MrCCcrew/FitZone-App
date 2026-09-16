import { describe, expect, it, vi } from "vitest";

import { accrueCoachMembershipEarningTx } from "@/lib/employees/coach-membership-earning-service";

type MembershipSnapshotFixture = {
  id: string;

  coachMembershipTrainerIdSnapshot: string | null;
  coachMembershipTrainerNameSnapshot: string | null;

  coachMembershipEmployeeIdSnapshot: string | null;
  coachMembershipEmployeeCodeSnapshot: string | null;
  coachMembershipEmployeeNameSnapshot: string | null;

  coachMembershipCompensationTermIdSnapshot: string | null;
  coachMembershipCommissionBpsSnapshot: number | null;
  coachMembershipCurrencySnapshot: string | null;
};

function membershipSnapshot(): MembershipSnapshotFixture {
  return {
    id: "membership-1",

    coachMembershipTrainerIdSnapshot: "trainer-1",
    coachMembershipTrainerNameSnapshot: "Coach One",

    coachMembershipEmployeeIdSnapshot: "employee-1",
    coachMembershipEmployeeCodeSnapshot: "EMP-001",
    coachMembershipEmployeeNameSnapshot: "Coach One Employee",

    coachMembershipCompensationTermIdSnapshot: "term-1",

    coachMembershipCommissionBpsSnapshot: 4000,

    coachMembershipCurrencySnapshot: "EGP",
  };
}

function fakeTx(options?: {
  membership?: ReturnType<typeof membershipSnapshot> | null;

  existing?: Record<string, unknown> | null;
}) {
  const created = {
    id: "earning-1",
    userMembershipId: "membership-1",

    monthKey: "2026-09",

    trainerIdSnapshot: "trainer-1",
    trainerNameSnapshot: "Coach One",

    employeeIdSnapshot: "employee-1",
    employeeCodeSnapshot: "EMP-001",
    employeeNameSnapshot: "Coach One Employee",

    coachCompensationTermIdSnapshot: "term-1",

    paymentAmountMinor: 100000,
    commissionRateBps: 4000,
    commissionAmountMinor: 40000,

    currency: "EGP",

    status: "calculated",
    blockReason: null,

    calculatedAt: new Date("2026-09-08T12:00:00.000Z"),
    calculatedById: null,

    finalizedAt: null,
    finalizedById: null,

    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    userMembership: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          options?.membership === undefined
            ? membershipSnapshot()
            : options.membership,
        ),
    },

    coachMembershipEarning: {
      findUnique: vi.fn().mockResolvedValue(options?.existing ?? null),

      create: vi.fn().mockResolvedValue(created),
    },

    auditLog: {
      create: vi.fn().mockResolvedValue({
        id: "audit-1",
      }),
    },

    __created: created,
  };
}

describe("Coach Membership earning service", () => {
  it("uses total economic consideration after commercial discounts", async () => {
    const tx = fakeTx();

    const result = await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 500,
        walletAmount: 300,
        pointsAmount: 200,
      },
    });

    expect(result).not.toBeNull();

    expect(tx.coachMembershipEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentAmountMinor: 100000,
          commissionRateBps: 4000,
          commissionAmountMinor: 40000,
        }),
      }),
    );
  });

  it("uses frozen purchase-time identity and rate", async () => {
    const tx = fakeTx();

    await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 1000,
      },
    });

    expect(tx.coachMembershipEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trainerIdSnapshot: "trainer-1",
          employeeIdSnapshot: "employee-1",
          employeeCodeSnapshot: "EMP-001",
          coachCompensationTermIdSnapshot: "term-1",
          commissionRateBps: 4000,
          currency: "EGP",
        }),
      }),
    );
  });

  it("does nothing for ordinary memberships without Coach Membership snapshots", async () => {
    const tx = fakeTx({
      membership: {
        ...membershipSnapshot(),

        coachMembershipTrainerIdSnapshot: null,
        coachMembershipTrainerNameSnapshot: null,

        coachMembershipEmployeeIdSnapshot: null,
        coachMembershipEmployeeCodeSnapshot: null,
        coachMembershipEmployeeNameSnapshot: null,

        coachMembershipCompensationTermIdSnapshot: null,
        coachMembershipCommissionBpsSnapshot: null,
        coachMembershipCurrencySnapshot: null,
      },
    });

    const result = await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 1000,
      },
    });

    expect(result).toBeNull();

    expect(tx.coachMembershipEarning.create).not.toHaveBeenCalled();
  });

  it("rejects partial Coach Membership snapshots", async () => {
    const tx = fakeTx({
      membership: {
        ...membershipSnapshot(),
        coachMembershipEmployeeCodeSnapshot: null,
      },
    });

    await expect(
      accrueCoachMembershipEarningTx(tx as never, {
        userMembershipId: "membership-1",

        finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

        consideration: {
          externalPaidAmount: 1000,
        },
      }),
    ).rejects.toThrow("COACH_MEMBERSHIP_EARNING_INCOMPLETE_SNAPSHOT");
  });

  it("creates a zero earning for a genuinely zero-consideration Coach Membership", async () => {
    const tx = fakeTx();

    await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 0,
        walletAmount: 0,
        pointsAmount: 0,
      },
    });

    expect(tx.coachMembershipEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentAmountMinor: 0,
          commissionAmountMinor: 0,
        }),
      }),
    );
  });

  it("is idempotent when an existing earning exactly matches", async () => {
    const first = fakeTx();

    await accrueCoachMembershipEarningTx(first as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 500,
        walletAmount: 300,
        pointsAmount: 200,
      },
    });

    const existing = first.__created;

    const retry = fakeTx({
      existing,
    });

    const result = await accrueCoachMembershipEarningTx(retry as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 500,
        walletAmount: 300,
        pointsAmount: 200,
      },
    });

    expect(result).toBe(existing);

    expect(retry.coachMembershipEarning.create).not.toHaveBeenCalled();

    expect(retry.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an idempotency retry with different economics", async () => {
    const existing = fakeTx().__created;

    const tx = fakeTx({
      existing,
    });

    await expect(
      accrueCoachMembershipEarningTx(tx as never, {
        userMembershipId: "membership-1",

        finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

        consideration: {
          externalPaidAmount: 999,
        },
      }),
    ).rejects.toThrow("COACH_MEMBERSHIP_EARNING_EXISTING_MISMATCH");
  });

  it("writes mandatory automatic audit in the same tx", async () => {
    const tx = fakeTx();

    await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      finalizedAt: new Date("2026-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: 1000,
      },
    });

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: null,
          actorRole: "system",
          action: "coach_membership_earning_calculate",
          targetType: "CoachMembershipEarning",
        }),
      }),
    );
  });

  it("uses Cairo calendar month for finalizedAt", async () => {
    const tx = fakeTx();

    await accrueCoachMembershipEarningTx(tx as never, {
      userMembershipId: "membership-1",

      // 22:30 UTC on Sep 30 = Oct 1 in Cairo.
      finalizedAt: new Date("2026-09-30T22:30:00.000Z"),

      consideration: {
        externalPaidAmount: 1000,
      },
    });

    expect(tx.coachMembershipEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          monthKey: "2026-10",
        }),
      }),
    );
  });
});
