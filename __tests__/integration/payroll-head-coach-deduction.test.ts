import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import type {
  PrismaClient,
  User,
} from "@prisma/client";

let db: PrismaClient;
let actor: User;

const stamp =
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const monthKey = "2097-06";

let employeeId = "";
let positionId = "";
let positionTermId = "";
let policyId = "";

function date(day: number) {
  return new Date(
    Date.UTC(2097, 5, day),
  );
}

function actorInput() {
  return {
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  };
}

async function attendance(
  day: number,
  minutes: number,
  status:
    | "present"
    | "substitute"
    | "absent",
  sequence: string,
) {
  return db.coachClassAttendance.create({
    data: {
      scheduleId: null,
      classId: null,

      sourceClassIdSnapshot:
        `C07-PAYROLL-${stamp}`,

      occurrenceKey:
        `C07-PAYROLL-${stamp}-${sequence}`,

      scheduleDate:
        date(day),

      scheduleTime:
        "10:00",

      classNameSnapshot:
        "C07 Payroll Test",

      classTypeKeySnapshot:
        "test",

      classTypeNameSnapshot:
        "Test",

      durationMinutesSnapshot:
        minutes,

      scheduledTrainerId:
        null,

      scheduledTrainerNameSnapshot:
        "Head Coach",

      scheduledEmployeeId:
        employeeId,

      scheduledEmployeeCodeSnapshot:
        `HEAD-${stamp}`,

      scheduledEmployeeNameSnapshot:
        "Head Coach Payroll Test",

      actualTrainerId:
        null,

      actualTrainerNameSnapshot:
        status === "absent"
          ? null
          : "Head Coach",

      /*
       * Deliberately keep actualEmployeeId even on absent
       * to prove status filtering remains defensive.
       */
      actualEmployeeId:
        employeeId,

      actualEmployeeCodeSnapshot:
        status === "absent"
          ? null
          : `HEAD-${stamp}`,

      actualEmployeeNameSnapshot:
        status === "absent"
          ? null
          : "Head Coach Payroll Test",

      status,
    },
  });
}

beforeAll(async () => {
  const mod =
    await import("@/lib/db");

  db =
    mod.db as PrismaClient;

  const current =
    await db.$queryRawUnsafe<
      Array<{ db: string }>
    >("SELECT DATABASE() AS db");

  if (
    current[0]?.db !== "fitzone_test"
  ) {
    throw new Error(
      "REFUSING_NON_TEST_DB",
    );
  }

  actor =
    await db.user.create({
      data: {
        email:
          `c07-payroll-${stamp}@example.test`,

        name:
          "C07 Payroll Actor",

        role:
          "super_admin",
      },
    });

  const position =
    await db.position.findUnique({
      where: {
        code:
          "HEAD_COACH_OWNER",
      },
    });

  if (!position) {
    throw new Error(
      "HEAD_COACH_OWNER_POSITION_REQUIRED",
    );
  }

  positionId =
    position.id;

  const employee =
    await db.employeeProfile.create({
      data: {
        employeeCode:
          `HEAD-PAYROLL-${stamp}`,

        name:
          "Head Coach Payroll Test",

        positionId,

        hireDate:
          new Date(
            "2097-06-01T00:00:00.000Z",
          ),

        employmentEndDate:
          new Date(
            "2097-06-30T00:00:00.000Z",
          ),

        employmentStatus:
          "active",

        payrollEnabled:
          true,
      },
    });

  employeeId =
    employee.id;

  await db.employeePayrollEligibilityTerm.create({
    data: {
      employeeId,

      effectiveFrom:
        new Date(
          "2097-06-01T00:00:00.000Z",
        ),

      effectiveTo:
        new Date(
          "2097-06-30T00:00:00.000Z",
        ),

      enabled:
        true,

      createdById:
        actor.id,
    },
  });

  const positionTerm =
    await db.employeePositionTerm.create({
      data: {
        employeeId,
        positionId,

        effectiveFrom:
          new Date(
            "2097-06-01T00:00:00.000Z",
          ),

        effectiveTo:
          new Date(
            "2097-06-30T00:00:00.000Z",
          ),

        createdById:
          actor.id,
      },
    });

  positionTermId =
    positionTerm.id;

  const policy =
    await db.positionPayrollPolicy.create({
      data: {
        positionId,

        effectiveFrom:
          new Date(
            "2097-06-01T00:00:00.000Z",
          ),

        effectiveTo:
          new Date(
            "2097-06-30T00:00:00.000Z",
          ),

        fixedSalaryMinor:
          250000,

        traineeClassCommissionBps:
          2500,

        privateSessionCommissionBps:
          6000,

        coachMembershipCommissionBps:
          4000,

        headCoachMonthlyBaseMinutes:
          1920,

        headCoachWeeklyMinMinutes:
          300,

        headCoachWeeklyCapMinutes:
          480,

        currency:
          "EGP",

        isActive:
          true,

        createdById:
          actor.id,

        notes:
          `C07-PAYROLL-${stamp}`,
      },
    });

  policyId =
    policy.id;

  /*
   * P1 = 4h => missing 1h
   * P2 = 5h => missing 0
   * P3 = 9h => credited 8h, missing 0
   * P4 = 4h => missing 1h
   */
  await attendance(
    2,
    240,
    "present",
    "p1",
  );

  await attendance(
    9,
    300,
    "present",
    "p2",
  );

  await attendance(
    16,
    540,
    "substitute",
    "p3",
  );

  await attendance(
    23,
    240,
    "present",
    "p4",
  );

  await attendance(
    24,
    300,
    "absent",
    "absent",
  );
});

afterAll(async () => {
  if (!db) return;

  const run =
    await db.payrollRun.findUnique({
      where: {
        monthKey,
      },
      select: {
        id: true,
      },
    });

  if (run) {
    const employees =
      await db.payrollRunEmployee.findMany({
        where: {
          payrollRunId:
            run.id,
        },
        select: {
          id: true,
        },
      });

    await db.payrollRunItem.deleteMany({
      where: {
        payrollRunEmployeeId: {
          in: employees.map(
            (x) => x.id,
          ),
        },
      },
    });

    await db.payrollRunEmployee.deleteMany({
      where: {
        payrollRunId:
          run.id,
      },
    });

    await db.payrollRun.delete({
      where: {
        id:
          run.id,
      },
    });
  }

  await db.coachClassAttendance.deleteMany({
    where: {
      occurrenceKey: {
        startsWith:
          `C07-PAYROLL-${stamp}-`,
      },
    },
  });

  if (employeeId) {
    await db.employeePositionTerm.deleteMany({
      where: {
        employeeId,
      },
    });

    await db.employeePayrollEligibilityTerm.deleteMany({
      where: {
        employeeId,
      },
    });

    await db.employeeProfile.deleteMany({
      where: {
        id:
          employeeId,
      },
    });
  }

  if (policyId) {
    await db.positionPayrollPolicy.deleteMany({
      where: {
        id:
          policyId,
      },
    });
  }

  await db.user.deleteMany({
    where: {
      id:
        actor?.id,
    },
  });
});

describe(
  "C07 Head Coach deduction in Payroll",
  () => {
    it(
      "uses the same C10 policy and salary and persists the deduction snapshot",
      async () => {
        const {
          calculatePayrollRun,
        } =
          await import(
            "@/lib/employees/payroll-run-service"
          );

        const run =
          await calculatePayrollRun(
            monthKey,
            actorInput(),
          );

        const row =
          run.employees.find(
            (x) =>
              x.employeeId ===
              employeeId,
          );

        expect(row?.status).toBe(
          "calculated",
        );

        expect(
          row?.salarySourceSnapshot,
        ).toBe(
          "position_payroll_policy",
        );

        expect(
          row?.positionTermIdSnapshot,
        ).toBe(
          positionTermId,
        );

        expect(
          row?.positionPayrollPolicyIdSnapshot,
        ).toBe(
          policyId,
        );

        expect(
          row?.fixedSalaryMinor,
        ).toBe(
          250000,
        );

        /*
         * Missing:
         * 60 + 0 + 0 + 60 = 120 min.
         *
         * 250000 * 120 / 1920
         * = 15625 minor.
         */
        expect(
          row?.headCoachHoursDeductionMinor,
        ).toBe(
          15625,
        );

        expect(
          row?.totalDeductionsMinor,
        ).toBe(
          15625,
        );

        expect(
          row?.netPayMinor,
        ).toBe(
          234375,
        );

        const item =
          row?.items.find(
            (x) =>
              x.sourceType ===
              "head_coach_hours_deduction",
          );

        expect(item).toBeDefined();

        expect(
          item?.sourceId,
        ).toBe(
          policyId,
        );

        expect(
          item?.direction,
        ).toBe(
          "deduction",
        );

        expect(
          item?.amountMinor,
        ).toBe(
          15625,
        );

        const metadata =
          JSON.parse(
            item?.metadataSnapshot ??
              "{}",
          );

        expect(
          metadata.positionPayrollPolicyId,
        ).toBe(
          policyId,
        );

        expect(
          metadata.fixedSalaryMinor,
        ).toBe(
          250000,
        );

        expect(
          metadata.monthlyBaseMinutes,
        ).toBe(
          1920,
        );

        expect(
          metadata.weeklyMinimumMinutes,
        ).toBe(
          300,
        );

        expect(
          metadata.weeklyCapMinutes,
        ).toBe(
          480,
        );

        expect(
          metadata.totalMissingMinutes,
        ).toBe(
          120,
        );

        expect(
          metadata.periods,
        ).toHaveLength(
          4,
        );

        expect(
          metadata.periods[2]
            .actualMinutes,
        ).toBe(
          540,
        );

        expect(
          metadata.periods[2]
            .creditedMinutes,
        ).toBe(
          480,
        );

        expect(
          metadata.periods[2]
            .missingMinutes,
        ).toBe(
          0,
        );

        expect(
          metadata.periods[3]
            .actualMinutes,
        ).toBe(
          240,
        );
      },
    );
  },
);
