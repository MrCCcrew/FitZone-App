import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

import { saveCoachClassAttendance } from "@/lib/employees/coach-class-attendance-service";

import {
  saveCoachClassCompensationTerm,
  saveCoachCompensationTerm,
} from "@/lib/employees/compensation-service";

import {
  calculateFixedClassEarning,
  finalizeFixedClassEarning,
} from "@/lib/employees/fixed-class-earning-service";

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
    "REFUSING: Fixed Class Earning integration requires fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MONTH = "2036-03";

let actorId = "";

let employeeId = "";
let substituteEmployeeId = "";

let trainerId = "";
let substituteTrainerId = "";

let classId = "";

const scheduleIds: string[] = [];

const positionIds: string[] = [];
const positionTermIds: string[] = [];
const positionPolicyIds: string[] = [];

const actor = () => ({
  userId: actorId,
  name: "Fixed Class Earning Test Admin",
  email: `fixed-class-${stamp}@test.local`,
  role: "admin",
});

async function createSchedule(date: string, time: string, isActive = true) {
  const row = await db.schedule.create({
    data: {
      classId,
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      availableSpots: 10,
      isActive,
    },
  });

  scheduleIds.push(row.id);

  return row;
}

async function createCoachTerm(
  monthlyAmountMinor: number,
  effectiveFrom = "2036-01-01",
  effectiveTo?: string,
) {
  return saveCoachCompensationTerm(
    {
      employeeId,
      effectiveFrom,
      effectiveTo,
      coachLevel: "normal",
      defaultFixedClassMonthlyMinor: monthlyAmountMinor,
      traineeClassCommissionBps: 0,
      privateSessionCommissionBps: 0,
      coachMembershipCommissionBps: 0,
    },
    actor(),
  );
}

async function createClassOverride(
  monthlyAmountMinor: number,
  effectiveFrom = "2036-01-01",
  effectiveTo?: string,
) {
  return saveCoachClassCompensationTerm(
    {
      employeeId,
      classId,
      effectiveFrom,
      effectiveTo,
      monthlyAmountMinor,
    },
    actor(),
  );
}


async function attachFixedClassPositionPolicy(
  targetEmployeeId: string,
  input: {
    code: string;
    monthlyAmountMinor?: number | null;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
  },
) {
  const position = await db.position.create({
    data: {
      code: `${input.code}-${stamp}`,
      name: `${input.code} Test`,
      nameEn: `${input.code} Test`,
      isActive: true,
      sortOrder: 992,
    },
  });

  positionIds.push(position.id);

  const positionTerm =
    await db.employeePositionTerm.create({
      data: {
        employeeId: targetEmployeeId,
        positionId: position.id,

        effectiveFrom:
          input.effectiveFrom ??
          new Date("2036-03-01T00:00:00.000Z"),

        effectiveTo:
          input.effectiveTo ?? null,
      },
    });

  positionTermIds.push(positionTerm.id);

  let policy = null;

  if (input.monthlyAmountMinor !== undefined) {
    policy =
      await db.positionPayrollPolicy.create({
        data: {
          positionId: position.id,

          effectiveFrom:
            input.effectiveFrom ??
            new Date("2036-03-01T00:00:00.000Z"),

          effectiveTo:
            input.effectiveTo ?? null,

          defaultFixedClassMonthlyMinor:
            input.monthlyAmountMinor,

          currency: "EGP",
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

async function setAttendance(
  scheduleId: string,
  status: "present" | "absent" | "excused" | "cancelled" | "substitute",
) {
  return saveCoachClassAttendance(
    {
      scheduleId,
      status,
      actualTrainerId:
        status === "substitute" ? substituteTrainerId : undefined,
    },
    actor(),
  );
}

async function deleteScenarioData() {
  await db.fixedClassEarningOccurrence.deleteMany({
    where: {
      earning: {
        employeeId,
      },
    },
  });

  await db.fixedClassEarning.deleteMany({
    where: {
      employeeId,
    },
  });

  await db.auditLog.deleteMany({
    where: {
      actorUserId: actorId,
      targetType: {
        in: [
          "FixedClassEarning",
          "CoachClassAttendance",
          "CoachCompensationTerm",
          "CoachClassCompensationTerm",
        ],
      },
    },
  });

  await db.coachClassAttendance.deleteMany({
    where: {
      scheduleDate: {
        gte: new Date("2036-03-01T00:00:00.000Z"),
        lt: new Date("2036-04-01T00:00:00.000Z"),
      },
      OR: [
        { scheduledEmployeeId: employeeId },
        { actualEmployeeId: employeeId },
        { actualEmployeeId: substituteEmployeeId },
      ],
    },
  });

  await db.schedule.deleteMany({
    where: {
      id: {
        in: scheduleIds,
      },
    },
  });

  scheduleIds.splice(0, scheduleIds.length);

  if (positionPolicyIds.length) {
    await db.positionPayrollPolicy.deleteMany({
      where: {
        id: {
          in: positionPolicyIds,
        },
      },
    });
  }

  positionPolicyIds.splice(0, positionPolicyIds.length);

  if (positionTermIds.length) {
    await db.employeePositionTerm.deleteMany({
      where: {
        id: {
          in: positionTermIds,
        },
      },
    });
  }

  positionTermIds.splice(0, positionTermIds.length);

  if (positionIds.length) {
    await db.position.deleteMany({
      where: {
        id: {
          in: positionIds,
        },
      },
    });
  }

  positionIds.splice(0, positionIds.length);

  await db.coachClassCompensationTerm.deleteMany({
    where: {
      employeeId,
      classId,
    },
  });

  await db.coachCompensationTerm.deleteMany({
    where: {
      employeeId,
    },
  });

  await db.attendancePeriod.deleteMany({
    where: {
      monthKey: MONTH,
    },
  });
}

async function cleanupAll() {
  await deleteScenarioData();

  if (classId) {
    await db.class.deleteMany({
      where: {
        id: classId,
      },
    });
  }

  if (trainerId || substituteTrainerId) {
    await db.trainer.deleteMany({
      where: {
        id: {
          in: [trainerId, substituteTrainerId].filter(Boolean),
        },
      },
    });
  }

  if (employeeId || substituteEmployeeId) {
    await db.employeeProfile.deleteMany({
      where: {
        id: {
          in: [employeeId, substituteEmployeeId].filter(Boolean),
        },
      },
    });
  }

  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
      },
    });

    await db.user.deleteMany({
      where: {
        id: actorId,
      },
    });
  }
}

beforeAll(async () => {
  await cleanupAll();

  const user = await db.user.create({
    data: {
      name: "Fixed Class Earning Test Admin",
      email: `fixed-class-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = user.id;

  const employee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-FCE-E1-${stamp}`,
      name: "Fixed Class Coach",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employeeId = employee.id;

  const substituteEmployee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-FCE-E2-${stamp}`,
      name: "Fixed Class Substitute",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  substituteEmployeeId = substituteEmployee.id;

  const trainer = await db.trainer.create({
    data: {
      name: `TEST FCE Trainer ${stamp}`,
      specialty: "fitness",
      employeeId,
    },
  });

  trainerId = trainer.id;

  const substituteTrainer = await db.trainer.create({
    data: {
      name: `TEST FCE Substitute ${stamp}`,
      specialty: "fitness",
      employeeId: substituteEmployeeId,
    },
  });

  substituteTrainerId = substituteTrainer.id;

  const classRow = await db.class.create({
    data: {
      name: `TEST FCE Class ${stamp}`,
      trainerId,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
    },
  });

  classId = classRow.id;
});

beforeEach(async () => {
  await deleteScenarioData();
});

afterAll(async () => {
  await cleanupAll();
});

describe("FixedClassEarningService — real fitzone_test integration", () => {
  it("pays present occurrences", async () => {
    await createCoachTerm(30000);

    const s1 = await createSchedule("2036-03-03", "09:00");

    const s2 = await createSchedule("2036-03-10", "09:00");

    await setAttendance(s1.id, "present");
    await setAttendance(s2.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("calculated");

    expect(earning.presentSessions).toBe(2);

    expect(earning.absentSessions).toBe(0);

    expect(earning.grossAmountMinor).toBe(30000);

    expect(earning.earnedAmountMinor).toBe(30000);
  });

  it("deducts one full session for absent", async () => {
    await createCoachTerm(30000);

    const schedules = await Promise.all([
      createSchedule("2036-03-03", "09:00"),
      createSchedule("2036-03-10", "09:00"),
      createSchedule("2036-03-17", "09:00"),
    ]);

    await setAttendance(schedules[0].id, "present");

    await setAttendance(schedules[1].id, "absent");

    await setAttendance(schedules[2].id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.absentSessions).toBe(1);

    expect(earning.absenceDeductionMinor).toBe(10000);

    expect(earning.earnedAmountMinor).toBe(20000);
  });

  it("pays excused occurrence without deduction", async () => {
    await createCoachTerm(30000);

    const s1 = await createSchedule("2036-03-03", "09:00");

    const s2 = await createSchedule("2036-03-10", "09:00");

    await setAttendance(s1.id, "present");
    await setAttendance(s2.id, "excused");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.excusedSessions).toBe(1);

    expect(earning.absenceDeductionMinor).toBe(0);

    expect(earning.earnedAmountMinor).toBe(30000);
  });

  it("uses all scheduled occurrences as the fixed-class salary denominator", async () => {
    await createCoachTerm(30000);

    const schedules = await Promise.all([
      createSchedule("2036-03-03", "09:00"),
      createSchedule("2036-03-10", "09:00"),
      createSchedule("2036-03-17", "09:00"),
    ]);

    await setAttendance(schedules[0].id, "present");

    await setAttendance(schedules[1].id, "absent");

    await setAttendance(schedules[2].id, "cancelled");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.scheduledSessions).toBe(3);

    // Still useful operationally: two sessions were not cancelled.
    expect(earning.payableSessions).toBe(2);

    expect(earning.cancelledSessions).toBe(1);

    /*
     * 30,000 / 3 scheduled sessions = 10,000 per scheduled occurrence.
     * Present earns 10,000.
     * Absent deducts 10,000.
     * Cancelled earns/deducts zero but remains in the denominator.
     */
    expect(earning.absenceDeductionMinor).toBe(10000);

    expect(earning.earnedAmountMinor).toBe(10000);

    expect(
      earning.occurrences.map((row) => row.eligibleSessionCount),
    ).toEqual([3, 3, 3]);

    const present = earning.occurrences.find(
      (row) => row.attendanceStatus === "present",
    );

    const absent = earning.occurrences.find(
      (row) => row.attendanceStatus === "absent",
    );

    const cancelled = earning.occurrences.find(
      (row) => row.attendanceStatus === "cancelled",
    );

    expect(present?.sessionValueMinor).toBe(10000);
    expect(present?.earningMinor).toBe(10000);

    expect(absent?.sessionValueMinor).toBe(10000);
    expect(absent?.deductionMinor).toBe(10000);

    expect(cancelled?.sessionValueMinor).toBe(0);
    expect(cancelled?.earningMinor).toBe(0);
    expect(cancelled?.deductionMinor).toBe(0);
  });

  it("blocks calculation when active occurrence has no attendance", async () => {
    await createCoachTerm(30000);

    await createSchedule("2036-03-03", "09:00");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");

    expect(earning.unrecordedSessions).toBe(1);

    expect(earning.blockReason).toContain("UNRECORDED");
  });

  it("blocks calculation when substitute occurrence exists", async () => {
    await createCoachTerm(30000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "substitute");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");

    expect(earning.substituteSessions).toBe(1);

    expect(earning.blockReason).toContain("SUBSTITUTE");
  });

  it("uses class override before coach default", async () => {
    await createCoachTerm(30000);
    await createClassOverride(45000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.grossAmountMinor).toBe(45000);

    expect(earning.occurrences[0].compensationSource).toBe("class_override");

    expect(earning.occurrences[0].classCompensationTermId).not.toBeNull();
  });

  it("uses PositionPayrollPolicy default after Position History starts and freezes snapshots", async () => {
    // Legacy exists intentionally and must lose after Position History starts.
    await createCoachTerm(30000);

    const positionSource =
      await attachFixedClassPositionPolicy(
        employeeId,
        {
          code: "C04-POSITION-SOURCE",
          monthlyAmountMinor: 45000,
        },
      );

    const schedule =
      await createSchedule(
        "2036-03-03",
        "09:00",
      );

    await setAttendance(
      schedule.id,
      "present",
    );

    const earning =
      await calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      );

    expect(earning.status).toBe("calculated");
    expect(earning.grossAmountMinor).toBe(45000);

    const occurrence = earning.occurrences[0];

    expect(
      occurrence.compensationSource,
    ).toBe("position_payroll_policy");

    expect(
      occurrence.coachCompensationTermId,
    ).toBeNull();

    expect(
      occurrence.classCompensationTermId,
    ).toBeNull();

    expect(
      occurrence.positionTermIdSnapshot,
    ).toBe(positionSource.positionTerm.id);

    expect(
      occurrence.positionIdSnapshot,
    ).toBe(positionSource.position.id);

    expect(
      occurrence.positionPayrollPolicyIdSnapshot,
    ).toBe(positionSource.policy?.id);

    expect(
      occurrence.monthlyAmountMinor,
    ).toBe(45000);
  });

  it("does not silently fall back to legacy when PositionPayrollPolicy is missing", async () => {
    await createCoachTerm(30000);

    await attachFixedClassPositionPolicy(
      employeeId,
      {
        code: "C04-MISSING-POLICY",

        // undefined = Position + PositionTerm only.
        monthlyAmountMinor: undefined,
      },
    );

    const schedule =
      await createSchedule(
        "2036-03-03",
        "09:00",
      );

    await setAttendance(
      schedule.id,
      "present",
    );

    const earning =
      await calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain(
      "FIXED_CLASS_EARNING_POSITION_PAYROLL_POLICY_MISSING",
    );

    expect(
      earning.occurrences[0].compensationSource,
    ).toBe("none");

    expect(
      earning.occurrences[0].coachCompensationTermId,
    ).toBeNull();

    expect(
      earning.occurrences[0].positionPayrollPolicyIdSnapshot,
    ).toBeNull();
  });

  it("blocks when PositionPayrollPolicy has no fixed-class default amount", async () => {
    await createCoachTerm(30000);

    await attachFixedClassPositionPolicy(
      employeeId,
      {
        code: "C04-MISSING-AMOUNT",
        monthlyAmountMinor: null,
      },
    );

    const schedule =
      await createSchedule(
        "2036-03-03",
        "09:00",
      );

    await setAttendance(
      schedule.id,
      "present",
    );

    const earning =
      await calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain(
      "FIXED_CLASS_EARNING_FIXED_CLASS_AMOUNT_MISSING",
    );

    expect(
      earning.occurrences[0].compensationSource,
    ).toBe("none");

    expect(
      earning.occurrences[0].monthlyAmountMinor,
    ).toBe(0);
  });

  it("blocks when Position History started but latest PositionTerm ended before the occurrence", async () => {
    await createCoachTerm(30000);

    await attachFixedClassPositionPolicy(
      employeeId,
      {
        code: "C04-ENDED-POSITION",
        monthlyAmountMinor: 45000,

        effectiveFrom:
          new Date("2036-02-01T00:00:00.000Z"),

        effectiveTo:
          new Date("2036-02-28T00:00:00.000Z"),
      },
    );

    const schedule =
      await createSchedule(
        "2036-03-03",
        "09:00",
      );

    await setAttendance(
      schedule.id,
      "present",
    );

    const earning =
      await calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain(
      "FIXED_CLASS_EARNING_POSITION_TERM_MISSING",
    );

    expect(
      earning.occurrences[0].compensationSource,
    ).toBe("none");
  });

  it("keeps class override higher priority than PositionPayrollPolicy", async () => {
    await createCoachTerm(30000);

    await attachFixedClassPositionPolicy(
      employeeId,
      {
        code: "C04-OVERRIDE-PRIORITY",
        monthlyAmountMinor: 45000,
      },
    );

    const classOverride =
      await createClassOverride(60000);

    const schedule =
      await createSchedule(
        "2036-03-03",
        "09:00",
      );

    await setAttendance(
      schedule.id,
      "present",
    );

    const earning =
      await calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      );

    expect(earning.status).toBe("calculated");
    expect(earning.grossAmountMinor).toBe(60000);

    const occurrence = earning.occurrences[0];

    expect(
      occurrence.compensationSource,
    ).toBe("class_override");

    expect(
      occurrence.classCompensationTermId,
    ).toBe(classOverride.id);

    expect(
      occurrence.coachCompensationTermId,
    ).toBeNull();

    expect(
      occurrence.positionTermIdSnapshot,
    ).toBeNull();

    expect(
      occurrence.positionIdSnapshot,
    ).toBeNull();

    expect(
      occurrence.positionPayrollPolicyIdSnapshot,
    ).toBeNull();

    expect(
      occurrence.monthlyAmountMinor,
    ).toBe(60000);
  });

  it("selects effective-dated compensation by occurrence date", async () => {
    await createCoachTerm(30000, "2036-01-01", "2036-03-15");

    await createCoachTerm(60000, "2036-03-16");

    const first = await createSchedule("2036-03-10", "09:00");

    const second = await createSchedule("2036-03-20", "09:00");

    await setAttendance(first.id, "present");

    await setAttendance(second.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    const values = earning.occurrences
      .map((row) => row.monthlyAmountMinor)
      .sort((a, b) => a - b);

    expect(values).toEqual([30000, 60000]);
  });

  it("distributes minor-unit remainder deterministically without losing money", async () => {
    await createCoachTerm(10000);

    const schedules = await Promise.all([
      createSchedule("2036-03-03", "09:00"),
      createSchedule("2036-03-10", "09:00"),
      createSchedule("2036-03-17", "09:00"),
    ]);

    for (const schedule of schedules) {
      await setAttendance(schedule.id, "present");
    }

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    const values = earning.occurrences.map((row) => row.sessionValueMinor);

    expect(values.reduce((sum, value) => sum + value, 0)).toBe(10000);

    expect([...values].sort((a, b) => a - b)).toEqual([3333, 3333, 3334]);
  });

  it("recalculation is idempotent and does not duplicate occurrences", async () => {
    await createCoachTerm(30000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "present");

    const first = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    const second = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(second.id).toBe(first.id);

    expect(
      await db.fixedClassEarning.count({
        where: {
          monthKey: MONTH,
          employeeId,
          classId,
        },
      }),
    ).toBe(1);

    expect(
      await db.fixedClassEarningOccurrence.count({
        where: {
          earningId: first.id,
        },
      }),
    ).toBe(1);
  });

  it("does not silently recalculate finalized earning", async () => {
    await createCoachTerm(30000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    const finalized = await finalizeFixedClassEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    expect(finalized.status).toBe("finalized");

    await expect(
      calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        actor(),
      ),
    ).rejects.toThrow("FIXED_CLASS_EARNING_FINALIZED");
  });
  it("keeps recorded historical occurrence payable after schedule deletion", async () => {
    await createCoachTerm(30000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    const attendance = await setAttendance(schedule.id, "present");

    await db.schedule.delete({
      where: {
        id: schedule.id,
      },
    });

    const historical = await db.coachClassAttendance.findUniqueOrThrow({
      where: {
        id: attendance.id,
      },
    });

    expect(historical.scheduleId).toBeNull();

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("calculated");
    expect(earning.scheduledSessions).toBe(1);
    expect(earning.presentSessions).toBe(1);
    expect(earning.grossAmountMinor).toBe(30000);
    expect(earning.earnedAmountMinor).toBe(30000);

    expect(earning.occurrences).toHaveLength(1);

    expect(earning.occurrences[0].attendanceId).toBe(attendance.id);

    expect(earning.occurrences[0].scheduleId).toBeNull();
  });

  it("deduplicates recreated schedule against historical attendance by occurrenceKey", async () => {
    await createCoachTerm(30000);

    const originalSchedule = await createSchedule("2036-03-03", "09:00");

    const attendance = await setAttendance(originalSchedule.id, "present");

    await db.schedule.delete({
      where: {
        id: originalSchedule.id,
      },
    });

    const recreated = await createSchedule("2036-03-03", "09:00");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("calculated");
    expect(earning.scheduledSessions).toBe(1);
    expect(earning.presentSessions).toBe(1);
    expect(earning.unrecordedSessions).toBe(0);

    expect(earning.occurrences).toHaveLength(1);

    expect(earning.occurrences[0].occurrenceKey).toBe(
      `${classId}:2036-03-03:09:00`,
    );

    expect(earning.occurrences[0].attendanceId).toBe(attendance.id);

    expect(earning.occurrences[0].scheduleId).toBe(recreated.id);
  });
  it("blocks an empty month instead of creating a calculated zero earning", async () => {
    await createCoachTerm(30000);

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");
    expect(earning.scheduledSessions).toBe(0);
    expect(earning.payableSessions).toBe(0);

    expect(earning.blockReason).toContain("NO_OCCURRENCES");

    expect(earning.grossAmountMinor).toBe(0);
    expect(earning.earnedAmountMinor).toBe(0);
    expect(earning.occurrences).toHaveLength(0);
  });

  it("blocks payable attendance when no effective compensation exists", async () => {
    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");
    expect(earning.presentSessions).toBe(1);

    expect(earning.blockReason).toContain("MISSING_COMPENSATION");

    expect(earning.grossAmountMinor).toBe(0);
    expect(earning.earnedAmountMinor).toBe(0);

    expect(earning.occurrences[0].compensationSource).toBe("none");
  });

  it("blocks multiple monthly compensation amounts inside one class month pending explicit proration policy", async () => {
    await createCoachTerm(30000, "2036-01-01", "2036-03-15");

    await createCoachTerm(60000, "2036-03-16");

    const first = await createSchedule("2036-03-10", "09:00");

    const second = await createSchedule("2036-03-20", "09:00");

    await setAttendance(first.id, "present");

    await setAttendance(second.id, "present");

    const earning = await calculateFixedClassEarning(
      {
        monthKey: MONTH,
        employeeId,
        classId,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain(
      "MULTIPLE_COMPENSATION_AMOUNTS_IN_MONTH",
    );

    expect(
      earning.occurrences
        .map((row) => row.monthlyAmountMinor)
        .sort((a, b) => a - b),
    ).toEqual([30000, 60000]);

    expect(earning.grossAmountMinor).toBe(0);
    expect(earning.earnedAmountMinor).toBe(0);
  });

  it("mandatory AuditLog failure rolls back calculation mutation", async () => {
    await createCoachTerm(30000);

    const schedule = await createSchedule("2036-03-03", "09:00");

    await setAttendance(schedule.id, "present");

    await expect(
      calculateFixedClassEarning(
        {
          monthKey: MONTH,
          employeeId,
          classId,
        },
        {
          ...actor(),
          name: "X".repeat(500),
        },
      ),
    ).rejects.toThrow();

    expect(
      await db.fixedClassEarning.count({
        where: {
          monthKey: MONTH,
          employeeId,
          classId,
        },
      }),
    ).toBe(0);

    expect(
      await db.fixedClassEarningOccurrence.count({
        where: {
          earning: {
            monthKey: MONTH,
            employeeId,
            classId,
          },
        },
      }),
    ).toBe(0);
  });
});
