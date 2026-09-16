import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, asDbTransactionClient } from "@/lib/db";
import {
  accruePrivateSessionEarningTx,
  finalizePrivateSessionEarning,
} from "@/lib/employees/private-session-earning-service";
import { cairoDateStartInstant } from "@/lib/fitzone-time";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Private Session Earning integration requires fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let serial = 0;
let actorId = "";
let customerId = "";

const earningIds: string[] = [];
const applicationIds: string[] = [];
const paymentIds: string[] = [];
const trainerIds: string[] = [];
const employeeIds: string[] = [];
const termIds: string[] = [];

const positionIds: string[] = [];
const positionTermIds: string[] = [];
const positionPolicyIds: string[] = [];

function next(prefix: string) {
  serial += 1;
  return `${prefix}-${stamp}-${serial}`;
}

function actor() {
  return {
    userId: actorId,
    name: "Private Session Earning Test Admin",
    email: `pse-admin-${stamp}@test.local`,
    role: "admin",
  };
}

async function cleanupScenario() {
  if (earningIds.length > 0) {
    await db.auditLog.deleteMany({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: { in: [...earningIds] },
      },
    });

    await db.privateSessionEarning.deleteMany({
      where: { id: { in: [...earningIds] } },
    });

    earningIds.splice(0);
  }

  if (applicationIds.length > 0) {
    await db.attendanceCheckIn.deleteMany({
      where: {
        privateSessionApplicationId: {
          in: [...applicationIds],
        },
      },
    });

    await db.attendancePass.deleteMany({
      where: {
        privateSessionApplicationId: {
          in: [...applicationIds],
        },
      },
    });

    await db.privateSessionApplication.deleteMany({
      where: { id: { in: [...applicationIds] } },
    });

    applicationIds.splice(0);
  }

  if (paymentIds.length > 0) {
    await db.paymentTransaction.deleteMany({
      where: { id: { in: [...paymentIds] } },
    });

    paymentIds.splice(0);
  }

  if (termIds.length > 0) {
    await db.coachCompensationTerm.deleteMany({
      where: { id: { in: [...termIds] } },
    });

    termIds.splice(0);
  }

  if (positionTermIds.length > 0) {
    await db.employeePositionTerm.deleteMany({
      where: {
        id: {
          in: [...positionTermIds],
        },
      },
    });

    positionTermIds.splice(0);
  }

  if (positionPolicyIds.length > 0) {
    await db.positionPayrollPolicy.deleteMany({
      where: {
        id: {
          in: [...positionPolicyIds],
        },
      },
    });

    positionPolicyIds.splice(0);
  }

  if (positionIds.length > 0) {
    await db.position.deleteMany({
      where: {
        id: {
          in: [...positionIds],
        },
      },
    });

    positionIds.splice(0);
  }

  if (trainerIds.length > 0) {
    await db.trainer.deleteMany({
      where: { id: { in: [...trainerIds] } },
    });

    trainerIds.splice(0);
  }

  if (employeeIds.length > 0) {
    await db.employeeProfile.deleteMany({
      where: { id: { in: [...employeeIds] } },
    });

    employeeIds.splice(0);
  }
}

async function cleanupAll() {
  await cleanupScenario();

  await db.auditLog.deleteMany({
    where: {
      OR: [
        {
          actorUserId: actorId || "__none__",
          targetType: "PrivateSessionEarning",
        },
        {
          actorName: "system:private-session-accrual",
          targetType: "PrivateSessionEarning",
        },
      ],
    },
  });

  const ids = [actorId, customerId].filter(Boolean);

  if (ids.length > 0) {
    await db.user.deleteMany({
      where: { id: { in: ids } },
    });
  }
}

type ScenarioOptions = {
  amount?: number;
  rateBps?: number;
  paidAt?: Date;

  employeeLink?: boolean;
  employmentStatus?: string;
  payrollEnabled?: boolean;
  compensationTerm?: boolean;

  paymentStatus?: string;
  paymentPurpose?: string;
  paymentMetadataApplicationId?: string;
  currency?: string;
};

async function createScenario(options: ScenarioOptions = {}) {
  const employeeLink = options.employeeLink !== false;

  let employee: Awaited<ReturnType<typeof db.employeeProfile.create>> | null =
    null;

  if (employeeLink) {
    employee = await db.employeeProfile.create({
      data: {
        employeeCode: next("EMP-PSE"),
        name: "Private Session Test Employee",
        employmentStatus: options.employmentStatus ?? "active",
        payrollEnabled: options.payrollEnabled ?? true,
      },
    });

    employeeIds.push(employee.id);
  }

  const trainer = await db.trainer.create({
    data: {
      name: next("Private Trainer"),
      specialty: "Private Training",
      isActive: true,
      ...(employee ? { employeeId: employee.id } : {}),
    },
  });

  trainerIds.push(trainer.id);

  const paidAt = options.paidAt ?? new Date("2038-09-08T12:00:00.000Z");

  if (employee && options.compensationTerm !== false) {
    const term = await db.coachCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2038-09-01T00:00:00.000Z"),

        coachLevel: "normal",

        defaultFixedClassMonthlyMinor: 25000,
        traineeClassCommissionBps: 2000,
        privateSessionCommissionBps: options.rateBps ?? 4000,
        coachMembershipCommissionBps: 4000,

        currency: options.currency ?? "EGP",
      },
    });

    termIds.push(term.id);
  }

  /*
   * Application is created first because payment metadata
   * freezes its exact source id.
   */
  const application = await db.privateSessionApplication.create({
    data: {
      userId: customerId,
      trainerId: trainer.id,

      type: "private",
      status: "approved",

      trainerPrice: options.amount ?? 1000,
      sessionsCount: 8,
      durationDays: 30,
    },
  });

  applicationIds.push(application.id);

  const metadataApplicationId =
    options.paymentMetadataApplicationId ?? application.id;

  const payment = await db.paymentTransaction.create({
    data: {
      userId: customerId,

      purpose: options.paymentPurpose ?? "private_session",

      businessUnit: "club",
      provider: "paymob",

      amount: options.amount ?? 1000,
      currency: options.currency ?? "EGP",

      status: options.paymentStatus ?? "paid",

      paymentMethod: "paymob",

      paidAt: (options.paymentStatus ?? "paid") === "paid" ? paidAt : null,

      metadata: JSON.stringify({
        privateSessionApplicationId: metadataApplicationId,
        type: "private",
        trainerId: trainer.id,
      }),
    },
  });

  paymentIds.push(payment.id);

  await db.privateSessionApplication.update({
    where: { id: application.id },
    data: {
      status: "paid",
      paymentTransactionId: payment.id,
      paidAt,
    },
  });

  return {
    application: await db.privateSessionApplication.findUniqueOrThrow({
      where: { id: application.id },
    }),
    payment,
    trainer,
    employee,
  };
}

async function attachPositionPolicy(
  employeeId: string,
  input: {
    code: string;
    rateBps?: number | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    currency?: string;
  },
) {
  const position =
    await db.position.create({
      data: {
        code: next(input.code),
        name: `${input.code} Test`,
        nameEn: `${input.code} Test`,
        isActive: true,
        sortOrder: 990,
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
          new Date("2038-09-01T00:00:00.000Z"),

        effectiveTo:
          input.effectiveTo ?? null,
      },
    });

  positionTermIds.push(positionTerm.id);

  let policy:
    | Awaited<
        ReturnType<
          typeof db.positionPayrollPolicy.create
        >
      >
    | null = null;

  if (input.rateBps !== undefined) {
    policy =
      await db.positionPayrollPolicy.create({
        data: {
          positionId: position.id,

          effectiveFrom:
            input.effectiveFrom ??
            new Date("2038-09-01T00:00:00.000Z"),

          effectiveTo:
            input.effectiveTo ?? null,

          privateSessionCommissionBps:
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

async function accrue(applicationId: string) {
  const earning = await db.$transaction(async (tx) =>
    accruePrivateSessionEarningTx(asDbTransactionClient(tx), {
      privateSessionApplicationId: applicationId,
    }),
  );

  if (!earningIds.includes(earning.id)) {
    earningIds.push(earning.id);
  }

  return earning;
}

beforeAll(async () => {
  const admin = await db.user.create({
    data: {
      name: "Private Session Earning Test Admin",
      email: `pse-admin-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = admin.id;

  const customer = await db.user.create({
    data: {
      name: "Private Session Test Customer",
      email: `pse-customer-${stamp}@test.local`,
      role: "member",
      isActive: true,
    },
  });

  customerId = customer.id;
});

beforeEach(async () => {
  await cleanupScenario();
});

afterAll(async () => {
  await cleanupAll();
});

describe("PrivateSessionEarningService — real fitzone_test integration", () => {
  it("creates calculated earning from paid economic evidence", async () => {
    const scenario = await createScenario({
      amount: 1000,
      rateBps: 4000,
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.status).toBe("calculated");

    expect(earning.paymentAmountMinor).toBe(100000);

    expect(earning.commissionRateBps).toBe(4000);

    expect(earning.commissionAmountMinor).toBe(40000);

    expect(earning.currency).toBe("EGP");
  });

  it("uses PaymentTransaction.amount rather than recalculating trainer price", async () => {
    const scenario = await createScenario({
      amount: 777.77,
      rateBps: 4000,
    });

    await db.privateSessionApplication.update({
      where: {
        id: scenario.application.id,
      },
      data: {
        trainerPrice: 9999,
      },
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.paymentAmountMinor).toBe(77777);

    expect(earning.commissionAmountMinor).toBe(31111);
  });

  it("freezes actual trainer and employee identity", async () => {
    const scenario = await createScenario();

    const earning = await accrue(scenario.application.id);

    expect(earning.trainerIdSnapshot).toBe(scenario.trainer.id);

    expect(earning.employeeIdSnapshot).toBe(scenario.employee?.id);

    expect(earning.employeeCodeSnapshot).toBe(scenario.employee?.employeeCode);
  });

  it("uses Cairo payroll month at midnight boundary", async () => {
    const scenario = await createScenario({
      /*
       * 22:30Z on Sep 30 is Oct 1 in Cairo
       * under the applicable offset.
       */
      paidAt: new Date("2038-09-30T22:30:00.000Z"),
    });

    if (scenario.employee) {
      await db.coachCompensationTerm.deleteMany({
        where: {
          employeeId: scenario.employee.id,
        },
      });

      termIds.splice(0);

      const term = await db.coachCompensationTerm.create({
        data: {
          employeeId: scenario.employee.id,

          effectiveFrom: cairoDateStartInstant("2038-10-01"),

          coachLevel: "normal",

          defaultFixedClassMonthlyMinor: 25000,

          traineeClassCommissionBps: 2000,

          privateSessionCommissionBps: 4000,

          coachMembershipCommissionBps: 4000,

          currency: "EGP",
        },
      });

      termIds.push(term.id);
    }

    const earning = await accrue(scenario.application.id);

    expect(earning.monthKey).toBe("2038-10");

    expect(earning.status).toBe("calculated");
  });

  it("blocks trainer without HR employee link", async () => {
    const scenario = await createScenario({
      employeeLink: false,
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "PRIVATE_SESSION_EARNING_TRAINER_EMPLOYEE_LINK_MISSING",
    );

    expect(earning.commissionAmountMinor).toBe(0);
  });

  it("blocks inactive employee", async () => {
    const scenario = await createScenario({
      employmentStatus: "inactive",
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "PRIVATE_SESSION_EARNING_EMPLOYEE_NOT_ACTIVE",
    );
  });

  it("blocks payroll-disabled employee", async () => {
    const scenario = await createScenario({
      payrollEnabled: false,
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "PRIVATE_SESSION_EARNING_EMPLOYEE_PAYROLL_DISABLED",
    );
  });

  it("blocks missing effective coach compensation term", async () => {
    const scenario = await createScenario({
      compensationTerm: false,
    });

    const earning = await accrue(scenario.application.id);

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "PRIVATE_SESSION_EARNING_COMPENSATION_TERM_MISSING",
    );
  });

  it("re-evaluates same blocked row after HR configuration is repaired", async () => {
    const scenario = await createScenario({
      employeeLink: false,
    });

    const blocked = await accrue(scenario.application.id);

    expect(blocked.status).toBe("blocked");

    const employee = await db.employeeProfile.create({
      data: {
        employeeCode: next("EMP-PSE-REPAIR"),
        name: "Private Session Repaired Employee",
        employmentStatus: "active",
        payrollEnabled: true,
      },
    });

    employeeIds.push(employee.id);

    await db.trainer.update({
      where: {
        id: scenario.trainer.id,
      },
      data: {
        employeeId: employee.id,
      },
    });

    const term = await db.coachCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2038-09-01T00:00:00.000Z"),

        coachLevel: "leader",

        defaultFixedClassMonthlyMinor: 25000,

        traineeClassCommissionBps: 2250,

        privateSessionCommissionBps: 5000,

        coachMembershipCommissionBps: 4000,

        currency: "EGP",
      },
    });

    termIds.push(term.id);

    const calculated = await accrue(scenario.application.id);

    expect(calculated.id).toBe(blocked.id);

    expect(calculated.status).toBe("calculated");

    expect(calculated.employeeIdSnapshot).toBe(employee.id);

    expect(calculated.commissionRateBps).toBe(5000);

    expect(calculated.commissionAmountMinor).toBe(50000);

    const rows = await db.privateSessionEarning.count({
      where: {
        privateSessionApplicationId: scenario.application.id,
      },
    });

    expect(rows).toBe(1);
  });

  it("is exact-once and identical calculated retry does not duplicate audit", async () => {
    const scenario = await createScenario();

    const first = await accrue(scenario.application.id);

    const auditBefore = await db.auditLog.count({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: first.id,
        action: "private_session_earning_calculate",
      },
    });

    const second = await accrue(scenario.application.id);

    expect(second.id).toBe(first.id);

    const count = await db.privateSessionEarning.count({
      where: {
        privateSessionApplicationId: scenario.application.id,
      },
    });

    expect(count).toBe(1);

    const auditAfter = await db.auditLog.count({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: first.id,
        action: "private_session_earning_calculate",
      },
    });

    expect(auditAfter).toBe(auditBefore);
  });

  it("rejects payment source metadata mismatch without creating earning", async () => {
    const scenario = await createScenario({
      paymentMetadataApplicationId: "wrong-private-session-source",
    });

    await expect(accrue(scenario.application.id)).rejects.toThrow(
      "PRIVATE_SESSION_EARNING_PAYMENT_SOURCE_MISMATCH",
    );

    const rows = await db.privateSessionEarning.count({
      where: {
        privateSessionApplicationId: scenario.application.id,
      },
    });

    expect(rows).toBe(0);
  });

  it("finalizes calculated earning with mandatory admin audit", async () => {
    const scenario = await createScenario();

    const earning = await accrue(scenario.application.id);

    const finalized = await finalizePrivateSessionEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    expect(finalized.status).toBe("finalized");

    expect(finalized.finalizedById).toBe(actorId);

    expect(finalized.finalizedAt).not.toBeNull();

    const audit = await db.auditLog.findFirst({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: earning.id,
        action: "private_session_earning_finalize",
        actorUserId: actorId,
      },
    });

    expect(audit).not.toBeNull();
  });

  it("finalize retry is idempotent and does not duplicate audit", async () => {
    const scenario = await createScenario();

    const earning = await accrue(scenario.application.id);

    const first = await finalizePrivateSessionEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    const auditBefore = await db.auditLog.count({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: earning.id,
        action: "private_session_earning_finalize",
      },
    });

    const second = await finalizePrivateSessionEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    expect(second.id).toBe(first.id);

    expect(second.status).toBe("finalized");

    const auditAfter = await db.auditLog.count({
      where: {
        targetType: "PrivateSessionEarning",
        targetId: earning.id,
        action: "private_session_earning_finalize",
      },
    });

    expect(auditAfter).toBe(auditBefore);
  });

  it("calculated snapshot remains frozen when mutable compensation later changes", async () => {
    const scenario = await createScenario({
      rateBps: 4000,
    });

    const first = await accrue(scenario.application.id);

    expect(first.commissionRateBps).toBe(4000);

    if (!scenario.employee) {
      throw new Error("TEST_FIXTURE_EMPLOYEE_REQUIRED");
    }

    await db.coachCompensationTerm.update({
      where: {
        id: termIds[0],
      },
      data: {
        privateSessionCommissionBps: 6000,
      },
    });

    const retried = await accrue(scenario.application.id);

    expect(retried.id).toBe(first.id);

    expect(retried.commissionRateBps).toBe(4000);

    expect(retried.commissionAmountMinor).toBe(first.commissionAmountMinor);
  });

  it("uses Position Payroll Policy for Normal coach 40/60 private split", async () => {
    const scenario =
      await createScenario({
        amount: 1000,

        // Deliberately different legacy rate.
        rateBps: 2000,
      });

    if (!scenario.employee) {
      throw new Error(
        "TEST_FIXTURE_EMPLOYEE_REQUIRED",
      );
    }

    const source =
      await attachPositionPolicy(
        scenario.employee.id,
        {
          code:
            "C09_NORMAL_COACH",

          rateBps: 4000,
        },
      );

    const earning =
      await accrue(
        scenario.application.id,
      );

    expect(earning.status).toBe(
      "calculated",
    );

    expect(
      earning.commissionSourceSnapshot,
    ).toBe(
      "position_payroll_policy",
    );

    expect(
      earning.positionTermIdSnapshot,
    ).toBe(source.positionTerm.id);

    expect(
      earning.positionIdSnapshot,
    ).toBe(source.position.id);

    expect(
      earning.positionPayrollPolicyIdSnapshot,
    ).toBe(source.policy?.id);

    expect(
      earning.coachCompensationTermIdSnapshot,
    ).toBeNull();

    expect(
      earning.paymentAmountMinor,
    ).toBe(100000);

    expect(
      earning.commissionRateBps,
    ).toBe(4000);

    expect(
      earning.commissionAmountMinor,
    ).toBe(40000);

    expect(
      earning.gymShareAmountMinor,
    ).toBe(60000);

    expect(
      earning.commissionAmountMinor +
        (earning.gymShareAmountMinor ?? 0),
    ).toBe(
      earning.paymentAmountMinor,
    );
  });

  it("uses Position Payroll Policy for Leader coach 50/50 private split", async () => {
    const scenario =
      await createScenario({
        amount: 1000,

        // Legacy must not win.
        rateBps: 2000,
      });

    if (!scenario.employee) {
      throw new Error(
        "TEST_FIXTURE_EMPLOYEE_REQUIRED",
      );
    }

    await attachPositionPolicy(
      scenario.employee.id,
      {
        code:
          "C09_LEADER_COACH",

        rateBps: 5000,
      },
    );

    const earning =
      await accrue(
        scenario.application.id,
      );

    expect(
      earning.commissionSourceSnapshot,
    ).toBe(
      "position_payroll_policy",
    );

    expect(
      earning.commissionRateBps,
    ).toBe(5000);

    expect(
      earning.commissionAmountMinor,
    ).toBe(50000);

    expect(
      earning.gymShareAmountMinor,
    ).toBe(50000);

    expect(
      earning.commissionAmountMinor +
        (earning.gymShareAmountMinor ?? 0),
    ).toBe(
      earning.paymentAmountMinor,
    );
  });

  it("uses Position Payroll Policy for Head coach 60/40 private split", async () => {
    const scenario =
      await createScenario({
        amount: 1000,

        // Legacy must not win.
        rateBps: 2000,
      });

    if (!scenario.employee) {
      throw new Error(
        "TEST_FIXTURE_EMPLOYEE_REQUIRED",
      );
    }

    await attachPositionPolicy(
      scenario.employee.id,
      {
        code:
          "C09_HEAD_COACH_OWNER",

        rateBps: 6000,
      },
    );

    const earning =
      await accrue(
        scenario.application.id,
      );

    expect(
      earning.commissionSourceSnapshot,
    ).toBe(
      "position_payroll_policy",
    );

    expect(
      earning.commissionRateBps,
    ).toBe(6000);

    expect(
      earning.commissionAmountMinor,
    ).toBe(60000);

    expect(
      earning.gymShareAmountMinor,
    ).toBe(40000);

    expect(
      earning.commissionAmountMinor +
        (earning.gymShareAmountMinor ?? 0),
    ).toBe(
      earning.paymentAmountMinor,
    );
  });

  it("does not silently fall back to legacy compensation after Position History starts", async () => {
    const scenario =
      await createScenario({
        amount: 1000,

        // A valid legacy rate exists intentionally.
        rateBps: 4000,
      });

    if (!scenario.employee) {
      throw new Error(
        "TEST_FIXTURE_EMPLOYEE_REQUIRED",
      );
    }

    await attachPositionPolicy(
      scenario.employee.id,
      {
        code:
          "C09_POLICY_MISSING",

        // undefined means:
        // create Position + PositionTerm only,
        // no PositionPayrollPolicy.
        rateBps: undefined,
      },
    );

    const earning =
      await accrue(
        scenario.application.id,
      );

    expect(
      earning.status,
    ).toBe("blocked");

    expect(
      earning.blockReason,
    ).toBe(
      "PRIVATE_SESSION_EARNING_POSITION_PAYROLL_POLICY_MISSING",
    );

    expect(
      earning.commissionSourceSnapshot,
    ).toBeNull();

    expect(
      earning.coachCompensationTermIdSnapshot,
    ).toBeNull();

    expect(
      earning.commissionRateBps,
    ).toBeNull();

    expect(
      earning.commissionAmountMinor,
    ).toBe(0);

    expect(
      earning.gymShareAmountMinor,
    ).toBeNull();
  });

  it("creates no TrainerCommission or CommissionPayout side effects", async () => {
    const trainerCommissionBefore = await db.trainerCommission.count();

    const payoutBefore = await db.commissionPayout.count();

    const scenario = await createScenario();

    await accrue(scenario.application.id);

    const trainerCommissionAfter = await db.trainerCommission.count();

    const payoutAfter = await db.commissionPayout.count();

    expect(trainerCommissionAfter).toBe(trainerCommissionBefore);

    expect(payoutAfter).toBe(payoutBefore);
  });
});
