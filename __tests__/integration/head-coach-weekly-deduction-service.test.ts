import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  asDbTransactionClient,
  db,
} from "@/lib/db";

import {
  calculateHeadCoachWeeklyDeductionTx,
} from "@/lib/employees/head-coach-weekly-deduction-service";

import {
  savePositionPayrollPolicyTx,
} from "@/lib/employees/position-payroll-policy-service";

const raw = process.env.DATABASE_URL;

if (!raw) throw new Error("DATABASE_URL_REQUIRED");

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Head Coach deduction tests require fitzone_test",
  );
}

const stamp =
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let headPositionId = "";
let employeeId = "";
let policyId = "";

const monthKey = "2096-06";

function date(day: number) {
  return new Date(
    Date.UTC(
      2096,
      5,
      day,
    ),
  );
}

async function attendance(
  day: number,
  minutes: number,
  status: "present" | "substitute" | "absent",
  sequence: string,
) {
  return db.coachClassAttendance.create({
    data: {
      scheduleId: null,
      classId: null,

      sourceClassIdSnapshot: `TEST-${stamp}`,
      occurrenceKey:
        `HEAD-HOURS-${stamp}-${sequence}`,

      scheduleDate: date(day),
      scheduleTime: "10:00",

      classNameSnapshot: "Head Hours Test",
      classTypeKeySnapshot: "test",
      classTypeNameSnapshot: "Test",
      durationMinutesSnapshot: minutes,

      scheduledTrainerId: null,
      scheduledTrainerNameSnapshot: "Scheduled Test",

      scheduledEmployeeId: employeeId,
      scheduledEmployeeCodeSnapshot: `HEAD-${stamp}`,
      scheduledEmployeeNameSnapshot: "Head Coach Test",

      /*
       * Deliberately populate actual employee even for the absent
       * defensive test. The calculation status predicate must still
       * refuse to count absent time.
       */
      actualTrainerId: null,
      actualTrainerNameSnapshot:
        status === "absent" ? null : "Head Coach Test",

      actualEmployeeId: employeeId,
      actualEmployeeCodeSnapshot:
        status === "absent" ? null : `HEAD-${stamp}`,
      actualEmployeeNameSnapshot:
        status === "absent" ? null : "Head Coach Test",

      status,
    },
  });
}

beforeAll(async () => {
  const existingPosition =
    await db.position.findUnique({
      where: {
        code: "HEAD_COACH_OWNER",
      },
    });

  const headPosition =
    existingPosition ??
    (await db.position.create({
      data: {
        code: "HEAD_COACH_OWNER",
        name: "هيد كوتش / المالك",
        nameEn: "Head Coach / Owner",
        isActive: true,
      },
    }));

  headPositionId = headPosition.id;

  const employee =
    await db.employeeProfile.create({
      data: {
        employeeCode: `HEAD-${stamp}`,
        name: "Head Coach Hours Test",
        positionId: headPositionId,
        employmentStatus: "active",
        payrollEnabled: true,
      },
    });

  employeeId = employee.id;

  const policy =
    await db.$transaction((rawTx) =>
      savePositionPayrollPolicyTx(
        asDbTransactionClient(rawTx),
        {
          positionId: headPositionId,

          effectiveFrom: "2096-06-01",
          effectiveTo: "2096-06-30",

          fixedSalaryMinor: 250000,

          traineeClassCommissionBps: 2500,
          privateSessionCommissionBps: 6000,
          coachMembershipCommissionBps: 4000,

          headCoachMonthlyBaseMinutes: 1920,
          headCoachWeeklyMinMinutes: 300,
          headCoachWeeklyCapMinutes: 480,

          currency: "EGP",
          notes: `head-hours-${stamp}`,
        },
      ),
    );

  policyId = policy.id;

  /*
   * Period 1: 4h -> missing 1h.
   */
  await attendance(2, 240, "present", "p1");

  /*
   * Period 2: exactly 5h -> no deduction.
   */
  await attendance(9, 300, "present", "p2");

  /*
   * Period 3: 9h -> credited only up to configured 8h.
   * No additional earning and no deduction.
   */
  await attendance(16, 540, "substitute", "p3");

  /*
   * Period 4: 4h -> missing 1h.
   */
  await attendance(23, 240, "present", "p4");

  /*
   * Defensive evidence:
   * absent time must NEVER count even if malformed historical data
   * happens to contain actualEmployeeId.
   */
  await attendance(24, 300, "absent", "absent");
});

afterAll(async () => {
  await db.coachClassAttendance.deleteMany({
    where: {
      occurrenceKey: {
        startsWith: `HEAD-HOURS-${stamp}-`,
      },
    },
  });

  if (policyId) {
    await db.positionPayrollPolicy.deleteMany({
      where: {
        id: policyId,
      },
    });
  }

  if (employeeId) {
    await db.employeeProfile.deleteMany({
      where: {
        id: employeeId,
      },
    });
  }
});

describe("Head Coach weekly deduction engine", () => {
  it("uses four approved payroll periods and deducts only hours below weekly minimum", async () => {
    const result =
      await db.$transaction((rawTx) =>
        calculateHeadCoachWeeklyDeductionTx(
          asDbTransactionClient(rawTx),
          {
            employeeId,
            positionId: headPositionId,
            monthKey,
          },
        ),
      );

    expect(result.positionPayrollPolicyId).toBe(policyId);

    expect(result.fixedSalaryMinor).toBe(250000);

    expect(result.monthlyBaseMinutes).toBe(1920);
    expect(result.weeklyMinimumMinutes).toBe(300);
    expect(result.weeklyCapMinutes).toBe(480);

    expect(result.periods).toHaveLength(4);

    expect(result.periods[0]).toMatchObject({
      period: 1,
      startDay: 1,
      endDay: 7,
      actualMinutes: 240,
      creditedMinutes: 240,
      missingMinutes: 60,
    });

    expect(result.periods[1]).toMatchObject({
      period: 2,
      startDay: 8,
      endDay: 14,
      actualMinutes: 300,
      creditedMinutes: 300,
      missingMinutes: 0,
    });

    expect(result.periods[2]).toMatchObject({
      period: 3,
      startDay: 15,
      endDay: 21,
      actualMinutes: 540,
      creditedMinutes: 480,
      missingMinutes: 0,
    });

    expect(result.periods[3]).toMatchObject({
      period: 4,
      startDay: 22,
      endDay: 30,
      actualMinutes: 240,
      creditedMinutes: 240,
      missingMinutes: 60,
    });

    expect(result.totalActualMinutes).toBe(1320);
    expect(result.totalCreditedMinutes).toBe(1260);

    expect(result.totalMissingMinutes).toBe(120);

    /*
     * 250000 × 120 / 1920 = 15625 minor
     * = 156.25 EGP deduction.
     */
    expect(result.deductionMinor).toBe(15625);
  });

  it("ignores absent Coach Class Attendance", async () => {
    const result =
      await db.$transaction((rawTx) =>
        calculateHeadCoachWeeklyDeductionTx(
          asDbTransactionClient(rawTx),
          {
            employeeId,
            positionId: headPositionId,
            monthKey,
          },
        ),
      );

    expect(result.periods[3].actualMinutes).toBe(240);
  });

  it("does not create additional earning above the weekly cap", async () => {
    const result =
      await db.$transaction((rawTx) =>
        calculateHeadCoachWeeklyDeductionTx(
          asDbTransactionClient(rawTx),
          {
            employeeId,
            positionId: headPositionId,
            monthKey,
          },
        ),
      );

    expect(result.periods[2].actualMinutes).toBe(540);
    expect(result.periods[2].creditedMinutes).toBe(480);
    expect(result.periods[2].missingMinutes).toBe(0);
  });
});
