import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { saveCoachClassAttendance } from "@/lib/employees/coach-class-attendance-service";
import { saveCoachCompensationTerm } from "@/lib/employees/compensation-service";

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
    "REFUSING: Trainee Class Earning integration requires fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";

let customerId = "";
let scannerId = "";

let employeeId = "";
let substituteEmployeeId = "";

let trainerId = "";
let substituteTrainerId = "";

let classId = "";
let membershipId = "";
let userMembershipId = "";
let attendancePassId = "";

const scheduleIds: string[] = [];
const bookingIds: string[] = [];
const checkInIds: string[] = [];

const positionIds: string[] = [];
const positionTermIds: string[] = [];
const positionPolicyIds: string[] = [];

const actor = () => ({
  userId: actorId,
  name: "Trainee Class Earning Test Admin",
  email: `tce-admin-${stamp}@test.local`,
  role: "admin",
});

async function cleanupScenario() {
  await db.traineeClassEarning.deleteMany({
    where: {
      customerId,
    },
  });

  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
        targetType: "TraineeClassEarning",
      },
    });
  }

  if (checkInIds.length) {
    await db.attendanceCheckIn.deleteMany({
      where: {
        id: {
          in: checkInIds,
        },
      },
    });
  }

  checkInIds.splice(0, checkInIds.length);

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

  if (bookingIds.length) {
    await db.booking.deleteMany({
      where: {
        id: {
          in: bookingIds,
        },
      },
    });
  }

  bookingIds.splice(0, bookingIds.length);

  await db.coachClassAttendance.deleteMany({
    where: {
      occurrenceKey: {
        contains: "2037-05",
      },
    },
  });

  await db.coachCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: [employeeId, substituteEmployeeId].filter(Boolean),
      },
    },
  });

  if (scheduleIds.length) {
    await db.schedule.deleteMany({
      where: {
        id: {
          in: scheduleIds,
        },
      },
    });
  }

  scheduleIds.splice(0, scheduleIds.length);
}

async function cleanupAll() {
  await cleanupScenario();

  if (attendancePassId) {
    await db.attendancePass.deleteMany({
      where: {
        id: attendancePassId,
      },
    });
  }

  if (userMembershipId) {
    await db.userMembership.deleteMany({
      where: {
        id: userMembershipId,
      },
    });
  }

  if (membershipId) {
    await db.membership.deleteMany({
      where: {
        id: membershipId,
      },
    });
  }

  if (classId) {
    await db.class.deleteMany({
      where: {
        id: classId,
      },
    });
  }

  await db.trainer.deleteMany({
    where: {
      id: {
        in: [trainerId, substituteTrainerId].filter(Boolean),
      },
    },
  });

  await db.employeeProfile.deleteMany({
    where: {
      id: {
        in: [employeeId, substituteEmployeeId].filter(Boolean),
      },
    },
  });

  await db.user.deleteMany({
    where: {
      id: {
        in: [actorId, customerId, scannerId].filter(Boolean),
      },
    },
  });
}

async function createSchedule(date = "2037-05-05", time = "18:00") {
  const row = await db.schedule.create({
    data: {
      classId,
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      availableSpots: 20,
      isActive: true,
    },
  });

  scheduleIds.push(row.id);

  return row;
}

async function createBookingAndCheckIn(input?: {
  entitlementUnits?: number;
  scheduleId?: string;
}) {
  const scheduleId = input?.scheduleId ?? (await createSchedule()).id;

  const booking = await db.booking.create({
    data: {
      userId: customerId,
      scheduleId,
      userMembershipId,
      status: "attended",
      paidAmount: 0,
      paymentMethod: "membership",
      entitlementUnits: input?.entitlementUnits ?? 1,
    },
  });

  bookingIds.push(booking.id);

  const checkIn = await db.attendanceCheckIn.create({
    data: {
      passId: attendancePassId,
      userId: customerId,
      userMembershipId,
      bookingId: booking.id,
      scheduleId,
      scannedByUserId: scannerId,
      checkInType: "class",
    },
  });

  checkInIds.push(checkIn.id);

  return {
    booking,
    checkIn,
    scheduleId,
  };
}

async function setCoachAttendance(
  scheduleId: string,
  status: "present" | "substitute" | "absent",
) {
  await saveCoachClassAttendance(
    {
      scheduleId,
      status,
      actualTrainerId:
        status === "substitute" ? substituteTrainerId : undefined,
      notes: "trainee earning test",
    },
    actor(),
  );
}

async function createCoachTerm(targetEmployeeId: string, rateBps: number) {
  return saveCoachCompensationTerm(
    {
      employeeId: targetEmployeeId,
      effectiveFrom: "2037-01-01",
      effectiveTo: null,
      coachLevel: "normal",
      defaultFixedClassMonthlyMinor: 0,
      traineeClassCommissionBps: rateBps,
      privateSessionCommissionBps: 0,
      coachMembershipCommissionBps: 0,
      currency: "EGP",
      notes: "trainee earning test",
    },
    actor(),
  );
}


async function attachTraineePositionPolicy(
  targetEmployeeId: string,
  input: {
    code: string;
    rateBps?: number | null;
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
      sortOrder: 991,
    },
  });

  positionIds.push(position.id);

  const positionTerm = await db.employeePositionTerm.create({
    data: {
      employeeId: targetEmployeeId,
      positionId: position.id,
      effectiveFrom:
        input.effectiveFrom ??
        new Date("2037-05-01T00:00:00.000Z"),
      effectiveTo:
        input.effectiveTo ?? null,
    },
  });

  positionTermIds.push(positionTerm.id);

  let policy = null;

  if (input.rateBps !== undefined) {
    policy = await db.positionPayrollPolicy.create({
      data: {
        positionId: position.id,

        effectiveFrom:
          input.effectiveFrom ??
          new Date("2037-05-01T00:00:00.000Z"),

        effectiveTo:
          input.effectiveTo ?? null,

        traineeClassCommissionBps:
          input.rateBps,

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

beforeAll(async () => {
  await cleanupAll();

  const admin = await db.user.create({
    data: {
      name: "Trainee Earning Admin",
      email: `tce-admin-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = admin.id;

  const customer = await db.user.create({
    data: {
      name: "Trainee Customer",
      email: `tce-customer-${stamp}@test.local`,
      role: "user",
      isActive: true,
    },
  });

  customerId = customer.id;

  const scanner = await db.user.create({
    data: {
      name: "Trainee Scanner",
      email: `tce-scanner-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  scannerId = scanner.id;

  const employee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-TCE-E1-${stamp}`,
      name: "Primary Coach Employee",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employeeId = employee.id;

  const substituteEmployee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-TCE-E2-${stamp}`,
      name: "Substitute Coach Employee",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  substituteEmployeeId = substituteEmployee.id;

  const trainer = await db.trainer.create({
    data: {
      name: `TEST TCE Trainer ${stamp}`,
      specialty: "fitness",
      employeeId,
    },
  });

  trainerId = trainer.id;

  const substituteTrainer = await db.trainer.create({
    data: {
      name: `TEST TCE Substitute ${stamp}`,
      specialty: "fitness",
      employeeId: substituteEmployeeId,
    },
  });

  substituteTrainerId = substituteTrainer.id;

  const classRow = await db.class.create({
    data: {
      name: `TEST TCE Class ${stamp}`,
      trainerId,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 20,
    },
  });

  classId = classRow.id;

  const membership = await db.membership.create({
    data: {
      name: `TEST TCE Membership ${stamp}`,
      kind: "subscription",
      price: 1000,
      duration: 30,
      sessionsCount: 10,
      features: "[]",
      maxClasses: -1,
      isActive: true,
    },
  });

  membershipId = membership.id;

  const userMembership = await db.userMembership.create({
    data: {
      userId: customerId,
      membershipId,
      startDate: new Date("2037-05-01T00:00:00.000Z"),
      endDate: new Date("2037-05-31T23:59:59.000Z"),
      status: "active",
      activatedAt: new Date("2037-05-01T00:00:00.000Z"),
      paymentAmount: 1000,
      paymentMethod: "cash",
      totalSessions: 10,
    },
  });

  userMembershipId = userMembership.id;

  const pass = await db.attendancePass.create({
    data: {
      userId: customerId,
      userMembershipId,
      code: `TCE-${stamp}`,
      kind: "membership",
      status: "active",
    },
  });

  attendancePassId = pass.id;
});

beforeEach(async () => {
  await cleanupScenario();

  await db.userMembership.update({
    where: {
      id: userMembershipId,
    },
    data: {
      paymentAmount: 1000,
      totalSessions: 10,
      status: "active",
    },
  });
});

afterAll(async () => {
  await cleanupAll();
});

describe("TraineeClassEarningService — real fitzone_test integration", () => {
  it("calculates 20% from actual membership payment allocated per entitlement unit", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("calculated");

    expect(earning.paymentAmountMinor).toBe(100000);

    expect(earning.totalSessionsSnapshot).toBe(10);

    expect(earning.entitlementUnitsSnapshot).toBe(1);

    expect(earning.unitValueMinor).toBe(10000);

    expect(earning.commissionBaseMinor).toBe(10000);

    expect(earning.commissionRateBps).toBe(2000);

    expect(earning.commissionAmountMinor).toBe(2000);

    expect(earning.commissionSourceSnapshot).toBe(
      "legacy_coach_compensation_term",
    );

    expect(earning.coachCompensationTermId).not.toBeNull();
    expect(earning.positionTermIdSnapshot).toBeNull();
    expect(earning.positionIdSnapshot).toBeNull();
    expect(earning.positionPayrollPolicyIdSnapshot).toBeNull();
  });

  it("multiplies the economic base by entitlementUnits", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn({
      entitlementUnits: 2,
    });

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.entitlementUnitsSnapshot).toBe(2);

    expect(earning.commissionBaseMinor).toBe(20000);

    expect(earning.commissionAmountMinor).toBe(4000);
  });

  it("uses present coach attendance actual employee as owner", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.actualEmployeeId).toBe(employeeId);

    expect(earning.actualTrainerId).toBe(trainerId);
  });

  it("uses substitute actual coach instead of scheduled coach", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(substituteEmployeeId, 2250);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "substitute");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.actualEmployeeId).toBe(substituteEmployeeId);

    expect(earning.actualTrainerId).toBe(substituteTrainerId);

    expect(earning.commissionRateBps).toBe(2250);

    expect(earning.commissionAmountMinor).toBe(2250);
  });

  it("blocks when coach attendance is missing", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain("COACH_ATTENDANCE");
  });

  it("blocks when coach attendance has no payable actual coach", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "absent");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toContain("ACTUAL_COACH");
  });

  it("calculates zero for a genuinely free membership", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await db.userMembership.update({
      where: { id: userMembershipId },
      data: { paymentAmount: 0 },
    });

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("calculated");
    expect(earning.paymentAmountMinor).toBe(0);
    expect(earning.unitValueMinor).toBe(0);
    expect(earning.commissionBaseMinor).toBe(0);
    expect(earning.commissionAmountMinor).toBe(0);
  });

  it("blocks when membership totalSessions is invalid", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await db.userMembership.update({
      where: { id: userMembershipId },
      data: { totalSessions: 0 },
    });

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");
    expect(earning.blockReason).toBe("INVALID_SESSION_DENOMINATOR");
  });

  it("uses the compensation term effective on attendance date", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await saveCoachCompensationTerm(
      {
        employeeId,
        effectiveFrom: "2037-01-01",
        effectiveTo: "2037-04-30",
        coachLevel: "normal",
        defaultFixedClassMonthlyMinor: 0,
        traineeClassCommissionBps: 1500,
        privateSessionCommissionBps: 0,
        coachMembershipCommissionBps: 0,
        currency: "EGP",
        notes: "old trainee rate",
      },
      actor(),
    );

    const current = await saveCoachCompensationTerm(
      {
        employeeId,
        effectiveFrom: "2037-05-01",
        effectiveTo: null,
        coachLevel: "normal",
        defaultFixedClassMonthlyMinor: 0,
        traineeClassCommissionBps: 2500,
        privateSessionCommissionBps: 0,
        coachMembershipCommissionBps: 0,
        currency: "EGP",
        notes: "current trainee rate",
      },
      actor(),
    );

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.coachCompensationTermId).toBe(current.id);

    expect(earning.commissionRateBps).toBe(2500);
    expect(earning.commissionAmountMinor).toBe(2500);
  });

  it("uses PositionPayrollPolicy after Position History starts and freezes ownership snapshots", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    // Legacy exists intentionally. Position policy must win.
    await createCoachTerm(employeeId, 2000);

    const positionSource =
      await attachTraineePositionPolicy(
        employeeId,
        {
          code: "C05-POSITION-SOURCE",
          rateBps: 2250,
        },
      );

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(
      source.scheduleId,
      "present",
    );

    const earning =
      await calculateTraineeClassEarning(
        {
          attendanceCheckInId:
            source.checkIn.id,
        },
        actor(),
      );

    expect(earning.status).toBe("calculated");

    expect(
      earning.commissionSourceSnapshot,
    ).toBe(
      "position_payroll_policy",
    );

    expect(
      earning.coachCompensationTermId,
    ).toBeNull();

    expect(
      earning.positionTermIdSnapshot,
    ).toBe(
      positionSource.positionTerm.id,
    );

    expect(
      earning.positionIdSnapshot,
    ).toBe(
      positionSource.position.id,
    );

    expect(
      earning.positionPayrollPolicyIdSnapshot,
    ).toBe(
      positionSource.policy?.id,
    );

    expect(
      earning.commissionRateBps,
    ).toBe(2250);

    expect(
      earning.commissionAmountMinor,
    ).toBe(2250);
  });

  it("does not silently fall back to legacy compensation when PositionPayrollPolicy is missing", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    // A valid legacy term exists intentionally.
    await createCoachTerm(employeeId, 2000);

    await attachTraineePositionPolicy(
      employeeId,
      {
        code: "C05-MISSING-POLICY",

        // undefined = Position + PositionTerm,
        // but no PositionPayrollPolicy.
        rateBps: undefined,
      },
    );

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(
      source.scheduleId,
      "present",
    );

    const earning =
      await calculateTraineeClassEarning(
        {
          attendanceCheckInId:
            source.checkIn.id,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "TRAINEE_CLASS_EARNING_POSITION_PAYROLL_POLICY_MISSING",
    );

    expect(
      earning.commissionSourceSnapshot,
    ).toBeNull();

    expect(
      earning.coachCompensationTermId,
    ).toBeNull();

    expect(
      earning.positionPayrollPolicyIdSnapshot,
    ).toBeNull();
  });

  it("blocks when PositionPayrollPolicy has no trainee commission rate", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    // Legacy must not be used once Position History starts.
    await createCoachTerm(employeeId, 2000);

    await attachTraineePositionPolicy(
      employeeId,
      {
        code: "C05-MISSING-RATE",
        rateBps: null,
      },
    );

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(
      source.scheduleId,
      "present",
    );

    const earning =
      await calculateTraineeClassEarning(
        {
          attendanceCheckInId:
            source.checkIn.id,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "TRAINEE_CLASS_EARNING_TRAINEE_RATE_MISSING",
    );

    expect(
      earning.commissionSourceSnapshot,
    ).toBeNull();

    expect(
      earning.commissionRateBps,
    ).toBeNull();

    expect(
      earning.commissionAmountMinor,
    ).toBe(0);
  });

  it("blocks when Position History has started but the effective PositionTerm has ended", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    // Legacy must not become a silent fallback.
    await createCoachTerm(employeeId, 2000);

    await attachTraineePositionPolicy(
      employeeId,
      {
        code: "C05-ENDED-POSITION",
        rateBps: 2500,

        effectiveFrom:
          new Date("2037-04-01T00:00:00.000Z"),

        effectiveTo:
          new Date("2037-04-30T00:00:00.000Z"),
      },
    );

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(
      source.scheduleId,
      "present",
    );

    const earning =
      await calculateTraineeClassEarning(
        {
          attendanceCheckInId:
            source.checkIn.id,
        },
        actor(),
      );

    expect(earning.status).toBe("blocked");

    expect(earning.blockReason).toBe(
      "TRAINEE_CLASS_EARNING_POSITION_TERM_MISSING",
    );

    expect(
      earning.commissionSourceSnapshot,
    ).toBeNull();

    expect(
      earning.coachCompensationTermId,
    ).toBeNull();
  });

  it("blocks when no effective compensation term exists", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(earning.status).toBe("blocked");
    expect(earning.blockReason).toBe("COACH_COMPENSATION_TERM_MISSING");
  });

  it("is exact-once per AttendanceCheckIn and recalculation does not duplicate", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const first = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    const second = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(second.id).toBe(first.id);

    const count = await db.traineeClassEarning.count({
      where: {
        attendanceCheckInId: source.checkIn.id,
      },
    });

    expect(count).toBe(1);
  });

  it("finalizes a calculated earning and prevents later recalculation", async () => {
    const { calculateTraineeClassEarning, finalizeTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const calculated = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    const finalized = await finalizeTraineeClassEarning(
      {
        earningId: calculated.id,
      },
      actor(),
    );

    expect(finalized.status).toBe("finalized");
    expect(finalized.finalizedAt).not.toBeNull();
    expect(finalized.finalizedById).toBe(actorId);

    await expect(
      calculateTraineeClassEarning(
        {
          attendanceCheckInId: source.checkIn.id,
        },
        actor(),
      ),
    ).rejects.toThrow("TRAINEE_CLASS_EARNING_FINALIZED");
  });

  it("mandatory AuditLog failure rolls back calculation mutation", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const badActor = {
      ...actor(),
      name: "X".repeat(500),
    };

    await expect(
      calculateTraineeClassEarning(
        {
          attendanceCheckInId: source.checkIn.id,
        },
        badActor,
      ),
    ).rejects.toThrow();

    const row = await db.traineeClassEarning.findUnique({
      where: {
        attendanceCheckInId: source.checkIn.id,
      },
    });

    expect(row).toBeNull();
  });

  it("preserves historical snapshots after source mutation", async () => {
    const { calculateTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const earning = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    const originalClassName = earning.classNameSnapshot;

    const originalAttendanceTime = earning.attendanceTime;

    const originalEmployeeName = earning.actualEmployeeNameSnapshot;

    await db.class.update({
      where: {
        id: classId,
      },
      data: {
        name: "MUTATED CLASS NAME",
      },
    });

    await db.schedule.update({
      where: {
        id: source.scheduleId,
      },
      data: {
        time: "23:59",
      },
    });

    await db.employeeProfile.update({
      where: {
        id: employeeId,
      },
      data: {
        name: "MUTATED EMPLOYEE NAME",
      },
    });

    const stored = await db.traineeClassEarning.findUniqueOrThrow({
      where: {
        id: earning.id,
      },
    });

    expect(stored.classNameSnapshot).toBe(originalClassName);

    expect(stored.attendanceTime).toBe(originalAttendanceTime);

    expect(stored.actualEmployeeNameSnapshot).toBe(originalEmployeeName);
  });

  it("normalizes legacy invalid entitlementUnits through the authoritative helper", async () => {
    const { getBookingEntitlementUnits } =
      await import("@/lib/membership-session-units");

    expect(
      getBookingEntitlementUnits({
        entitlementUnits: 0,
      }),
    ).toBe(1);

    expect(
      getBookingEntitlementUnits({
        entitlementUnits: -1,
      }),
    ).toBe(1);

    expect(
      getBookingEntitlementUnits({
        entitlementUnits: null,
      }),
    ).toBe(1);

    expect(
      getBookingEntitlementUnits({
        entitlementUnits: 1,
      }),
    ).toBe(1);

    expect(
      getBookingEntitlementUnits({
        entitlementUnits: 2,
      }),
    ).toBe(2);
  });

  it("does not finalize a blocked earning", async () => {
    const { calculateTraineeClassEarning, finalizeTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    const source = await createBookingAndCheckIn();

    const blocked = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    expect(blocked.status).toBe("blocked");

    await expect(
      finalizeTraineeClassEarning(
        {
          earningId: blocked.id,
        },
        actor(),
      ),
    ).rejects.toThrow("TRAINEE_CLASS_EARNING_NOT_CALCULATED");
  });

  it("finalize is idempotent for an already finalized earning", async () => {
    const { calculateTraineeClassEarning, finalizeTraineeClassEarning } =
      await import("@/lib/employees/trainee-class-earning-service");

    await createCoachTerm(employeeId, 2000);

    const source = await createBookingAndCheckIn();

    await setCoachAttendance(source.scheduleId, "present");

    const calculated = await calculateTraineeClassEarning(
      {
        attendanceCheckInId: source.checkIn.id,
      },
      actor(),
    );

    const first = await finalizeTraineeClassEarning(
      {
        earningId: calculated.id,
      },
      actor(),
    );

    const second = await finalizeTraineeClassEarning(
      {
        earningId: calculated.id,
      },
      actor(),
    );

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("finalized");
    expect(second.finalizedAt).toEqual(first.finalizedAt);
    expect(second.finalizedById).toBe(first.finalizedById);
  });
});
