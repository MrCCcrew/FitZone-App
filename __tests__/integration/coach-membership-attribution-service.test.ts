import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { asDbTransactionClient } from "@/lib/db";
import {
  buildCoachMembershipAttributionTx,
  CoachMembershipAttributionError,
} from "@/lib/employees/coach-membership-attribution-service";

let db: typeof import("@/lib/db").db;

const suffix = `coach-membership-${Date.now()}`;

let regularMembershipId: string;
let coachMembershipId: string;

let activeEmployeeId: string;
let inactiveEmployeeId: string;
let payrollDisabledEmployeeId: string;

let activeTrainerId: string;
let inactiveTrainerId: string;
let unlinkedTrainerId: string;
let inactiveEmployeeTrainerId: string;
let payrollDisabledTrainerId: string;

let effectiveTermId: string;
let futureTermId: string;

const positionIds: string[] = [];
const positionTermIds: string[] = [];
const positionPolicyIds: string[] = [];

const purchaseAt = new Date("2026-09-08T12:00:00.000Z");

async function resolve(
  membershipId: string,
  trainerId?: string | null,
  at = purchaseAt,
) {
  return db.$transaction(async (tx) =>
    buildCoachMembershipAttributionTx(asDbTransactionClient(tx), {
      membershipId,
      trainerId,
      purchaseAt: at,
    }),
  );
}

async function expectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`Expected CoachMembershipAttributionError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CoachMembershipAttributionError);

    expect((error as CoachMembershipAttributionError).code).toBe(code);
  }
}

async function attachCoachMembershipPositionPolicy(
  employeeId: string,
  input: {
    code: string;
    rateBps?: number | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    currency?: string;
  },
) {
  const position = await db.position.create({
    data: {
      code: `${input.code}-${suffix}`,
      name: `${input.code} Test`,
      nameEn: `${input.code} Test`,
      isActive: true,
      sortOrder: 993,
    },
  });

  positionIds.push(position.id);

  const positionTerm =
    await db.employeePositionTerm.create({
      data: {
        employeeId,
        positionId: position.id,

        effectiveFrom:
          input.effectiveFrom ??
          new Date("2026-09-01T00:00:00.000Z"),

        effectiveTo:
          input.effectiveTo ?? null,
      },
    });

  positionTermIds.push(positionTerm.id);

  let policy = null;

  /*
   * undefined => Position + PositionTerm only.
   * null      => Policy exists but Coach Membership rate is unset.
   */
  if (input.rateBps !== undefined) {
    policy =
      await db.positionPayrollPolicy.create({
        data: {
          positionId: position.id,

          effectiveFrom:
            input.effectiveFrom ??
            new Date("2026-09-01T00:00:00.000Z"),

          effectiveTo:
            input.effectiveTo ?? null,

          coachMembershipCommissionBps:
            input.rateBps,

          currency:
            input.currency ?? "EGP",

          isActive: true,
        },
      });

    positionPolicyIds.push(policy.id);
  }

  return {
    position,
    positionTerm,
    policy,
  };
}

describe("Coach Membership Attribution Service — real fitzone_test integration", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));

    const current = await db.$queryRawUnsafe<Array<{ db: string }>>(
      "SELECT DATABASE() AS db",
    );

    expect(current[0]?.db).toBe("fitzone_test");

    const regular = await db.membership.create({
      data: {
        name: `Regular ${suffix}`,
        kind: "subscription",
        price: 1000,
        duration: 30,
        sessionsCount: 8,
        features: "[]",
        coachMembershipEnabled: false,
      },
    });

    regularMembershipId = regular.id;

    const coach = await db.membership.create({
      data: {
        name: `Coach ${suffix}`,
        kind: "subscription",
        price: 1000,
        duration: 30,
        sessionsCount: 8,
        features: "[]",
        coachMembershipEnabled: true,
      },
    });

    coachMembershipId = coach.id;

    const activeEmployee = await db.employeeProfile.create({
      data: {
        employeeCode: `CM-A-${Date.now()}`,
        name: `Coach Active ${suffix}`,
        employmentStatus: "active",
        payrollEnabled: true,
      },
    });

    activeEmployeeId = activeEmployee.id;

    const inactiveEmployee = await db.employeeProfile.create({
      data: {
        employeeCode: `CM-I-${Date.now()}`,
        name: `Coach Inactive ${suffix}`,
        employmentStatus: "inactive",
        payrollEnabled: true,
      },
    });

    inactiveEmployeeId = inactiveEmployee.id;

    const payrollDisabledEmployee = await db.employeeProfile.create({
      data: {
        employeeCode: `CM-P-${Date.now()}`,
        name: `Coach Payroll Disabled ${suffix}`,
        employmentStatus: "active",
        payrollEnabled: false,
      },
    });

    payrollDisabledEmployeeId = payrollDisabledEmployee.id;

    const activeTrainer = await db.trainer.create({
      data: {
        name: `Trainer Active ${suffix}`,
        specialty: "fitness",
        isActive: true,
        employeeId: activeEmployeeId,
      },
    });

    activeTrainerId = activeTrainer.id;

    const inactiveTrainer = await db.trainer.create({
      data: {
        name: `Trainer Inactive ${suffix}`,
        specialty: "fitness",
        isActive: false,
      },
    });

    inactiveTrainerId = inactiveTrainer.id;

    const unlinkedTrainer = await db.trainer.create({
      data: {
        name: `Trainer Unlinked ${suffix}`,
        specialty: "fitness",
        isActive: true,
      },
    });

    unlinkedTrainerId = unlinkedTrainer.id;

    const inactiveEmployeeTrainer = await db.trainer.create({
      data: {
        name: `Trainer Employee Inactive ${suffix}`,
        specialty: "fitness",
        isActive: true,
        employeeId: inactiveEmployeeId,
      },
    });

    inactiveEmployeeTrainerId = inactiveEmployeeTrainer.id;

    const payrollDisabledTrainer = await db.trainer.create({
      data: {
        name: `Trainer Payroll Disabled ${suffix}`,
        specialty: "fitness",
        isActive: true,
        employeeId: payrollDisabledEmployeeId,
      },
    });

    payrollDisabledTrainerId = payrollDisabledTrainer.id;

    const effectiveTerm = await db.coachCompensationTerm.create({
      data: {
        employeeId: activeEmployeeId,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        effectiveTo: new Date("2026-09-30T00:00:00.000Z"),
        coachLevel: "normal",
        defaultFixedClassMonthlyMinor: 25000,
        traineeClassCommissionBps: 2000,
        privateSessionCommissionBps: 4000,
        coachMembershipCommissionBps: 4000,
        currency: "EGP",
      },
    });

    effectiveTermId = effectiveTerm.id;

    const futureTerm = await db.coachCompensationTerm.create({
      data: {
        employeeId: activeEmployeeId,
        effectiveFrom: new Date("2026-10-01T00:00:00.000Z"),
        effectiveTo: null,
        coachLevel: "leader",
        defaultFixedClassMonthlyMinor: 30000,
        traineeClassCommissionBps: 2250,
        privateSessionCommissionBps: 5000,
        coachMembershipCommissionBps: 4500,
        currency: "USD",
      },
    });

    futureTermId = futureTerm.id;
  });

  afterEach(async () => {
    if (positionPolicyIds.length > 0) {
      await db.positionPayrollPolicy.deleteMany({
        where: {
          id: {
            in: positionPolicyIds,
          },
        },
      });
    }

    positionPolicyIds.splice(
      0,
      positionPolicyIds.length,
    );

    if (positionTermIds.length > 0) {
      await db.employeePositionTerm.deleteMany({
        where: {
          id: {
            in: positionTermIds,
          },
        },
      });
    }

    positionTermIds.splice(
      0,
      positionTermIds.length,
    );

    if (positionIds.length > 0) {
      await db.position.deleteMany({
        where: {
          id: {
            in: positionIds,
          },
        },
      });
    }

    positionIds.splice(
      0,
      positionIds.length,
    );
  });

  afterAll(async () => {
    if (!db) return;

    await db.coachCompensationTerm.deleteMany({
      where: {
        id: {
          in: [effectiveTermId, futureTermId].filter(Boolean),
        },
      },
    });

    await db.trainer.deleteMany({
      where: {
        id: {
          in: [
            activeTrainerId,
            inactiveTrainerId,
            unlinkedTrainerId,
            inactiveEmployeeTrainerId,
            payrollDisabledTrainerId,
          ].filter(Boolean),
        },
      },
    });

    await db.employeeProfile.deleteMany({
      where: {
        id: {
          in: [
            activeEmployeeId,
            inactiveEmployeeId,
            payrollDisabledEmployeeId,
          ].filter(Boolean),
        },
      },
    });

    await db.membership.deleteMany({
      where: {
        id: {
          in: [regularMembershipId, coachMembershipId].filter(Boolean),
        },
      },
    });
  });

  it("regular membership without trainer returns null", async () => {
    await expect(resolve(regularMembershipId)).resolves.toBeNull();
  });

  it("regular membership rejects Coach Membership trainer attribution", async () => {
    await expectCode(
      resolve(regularMembershipId, activeTrainerId),
      "COACH_NOT_ALLOWED",
    );
  });

  it("coach membership requires trainer", async () => {
    await expectCode(resolve(coachMembershipId), "COACH_REQUIRED");
  });

  it("coach membership rejects inactive trainer", async () => {
    await expectCode(
      resolve(coachMembershipId, inactiveTrainerId),
      "TRAINER_INACTIVE",
    );
  });

  it("coach membership rejects trainer without HR employee link", async () => {
    await expectCode(
      resolve(coachMembershipId, unlinkedTrainerId),
      "TRAINER_EMPLOYEE_LINK_REQUIRED",
    );
  });

  it("coach membership rejects inactive employee", async () => {
    await expectCode(
      resolve(coachMembershipId, inactiveEmployeeTrainerId),
      "EMPLOYEE_INACTIVE",
    );
  });

  it("coach membership rejects payroll-disabled employee", async () => {
    await expectCode(
      resolve(coachMembershipId, payrollDisabledTrainerId),
      "EMPLOYEE_PAYROLL_DISABLED",
    );
  });

  it("coach membership rejects when no compensation term is effective", async () => {
    await expectCode(
      resolve(
        coachMembershipId,
        activeTrainerId,
        new Date("2026-08-15T12:00:00.000Z"),
      ),
      "COACH_COMPENSATION_TERM_MISSING",
    );
  });

  it("freezes trainer employee term rate and currency from effective purchase-date term", async () => {
    const result = await resolve(coachMembershipId, activeTrainerId);

    expect(result).not.toBeNull();

    expect(result).toMatchObject({
      trainerIdSnapshot: activeTrainerId,

      employeeIdSnapshot: activeEmployeeId,

      coachCompensationTermIdSnapshot: effectiveTermId,

      coachMembershipCommissionSourceSnapshot:
        "legacy_coach_compensation_term",

      coachMembershipPositionTermIdSnapshot: null,
      coachMembershipPositionIdSnapshot: null,
      coachMembershipPositionPayrollPolicyIdSnapshot: null,

      coachMembershipCommissionBpsSnapshot: 4000,

      coachMembershipCurrencySnapshot: "EGP",
    });

    expect(result?.trainerNameSnapshot).toContain("Trainer Active");

    expect(result?.employeeCodeSnapshot).toContain("CM-A-");

    expect(result?.employeeNameSnapshot).toContain("Coach Active");
  });

  it("uses PositionPayrollPolicy after Position History starts and freezes purchase-date ownership", async () => {
    /*
     * A valid 40% legacy CoachCompensationTerm already exists.
     * Position policy must win after Position History starts.
     */
    const source =
      await attachCoachMembershipPositionPolicy(
        activeEmployeeId,
        {
          code: "C06-POSITION-SOURCE",
          rateBps: 4250,
          currency: "EGP",
        },
      );

    const result =
      await resolve(
        coachMembershipId,
        activeTrainerId,
      );

    expect(result).not.toBeNull();

    expect(result).toMatchObject({
      trainerIdSnapshot:
        activeTrainerId,

      employeeIdSnapshot:
        activeEmployeeId,

      coachCompensationTermIdSnapshot:
        null,

      coachMembershipCommissionSourceSnapshot:
        "position_payroll_policy",

      coachMembershipPositionTermIdSnapshot:
        source.positionTerm.id,

      coachMembershipPositionIdSnapshot:
        source.position.id,

      coachMembershipPositionPayrollPolicyIdSnapshot:
        source.policy?.id,

      coachMembershipCommissionBpsSnapshot:
        4250,

      coachMembershipCurrencySnapshot:
        "EGP",
    });
  });

  it("does not silently fall back to legacy compensation when PositionPayrollPolicy is missing", async () => {
    /*
     * Legacy 40% compensation exists intentionally.
     * Position History has started, so it must NOT be used.
     */
    await attachCoachMembershipPositionPolicy(
      activeEmployeeId,
      {
        code: "C06-MISSING-POLICY",

        // No PositionPayrollPolicy.
        rateBps: undefined,
      },
    );

    await expectCode(
      resolve(
        coachMembershipId,
        activeTrainerId,
      ),
      "COACH_MEMBERSHIP_POSITION_PAYROLL_POLICY_MISSING",
    );
  });

  it("rejects PositionPayrollPolicy with no Coach Membership rate", async () => {
    /*
     * Legacy compensation exists, but once Position History begins
     * a missing Position policy rate must fail closed.
     */
    await attachCoachMembershipPositionPolicy(
      activeEmployeeId,
      {
        code: "C06-MISSING-RATE",
        rateBps: null,
      },
    );

    await expectCode(
      resolve(
        coachMembershipId,
        activeTrainerId,
      ),
      "COACH_MEMBERSHIP_RATE_MISSING",
    );
  });

  it("rejects an ended PositionTerm instead of falling back to legacy compensation", async () => {
    await attachCoachMembershipPositionPolicy(
      activeEmployeeId,
      {
        code: "C06-ENDED-POSITION",

        rateBps: 4250,

        effectiveFrom:
          new Date("2026-08-01T00:00:00.000Z"),

        effectiveTo:
          new Date("2026-08-31T00:00:00.000Z"),
      },
    );

    await expectCode(
      resolve(
        coachMembershipId,
        activeTrainerId,
      ),
      "COACH_MEMBERSHIP_POSITION_TERM_MISSING",
    );
  });

  it("uses Cairo calendar date when selecting the effective term", async () => {
    // 2026-09-30 22:30 UTC is already 2026-10-01 in Cairo.
    const result = await resolve(
      coachMembershipId,
      activeTrainerId,
      new Date("2026-09-30T22:30:00.000Z"),
    );

    expect(result).toMatchObject({
      coachCompensationTermIdSnapshot: futureTermId,

      coachMembershipCommissionBpsSnapshot: 4500,

      coachMembershipCurrencySnapshot: "USD",
    });
  });

  it("performs no earning mutation", async () => {
    const before = await db.coachMembershipEarning.count();

    await resolve(coachMembershipId, activeTrainerId);

    const after = await db.coachMembershipEarning.count();

    expect(after).toBe(before);
  });
});
