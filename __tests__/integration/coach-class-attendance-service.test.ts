import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveCoachClassAttendance } from "@/lib/employees/coach-class-attendance-service";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: coach class attendance tests require fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";

let scheduledEmployeeId = "";
let substituteEmployeeId = "";

let scheduledTrainerId = "";
let substituteTrainerId = "";
let unlinkedTrainerId = "";

let classId = "";
let unlinkedClassId = "";

let schedule1Id = "";
let schedule2Id = "";
let schedule3Id = "";
let unlinkedScheduleId = "";
let rollbackScheduleId = "";

const actor = () => ({
  userId: actorId,
  name: "Coach Attendance Test Admin",
  email: `coach-att-${stamp}@test.local`,
  role: "admin",
});

async function createSchedule(
  targetClassId: string,
  date: string,
  time: string,
) {
  return db.schedule.create({
    data: {
      classId: targetClassId,
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      availableSpots: 10,
      isActive: true,
    },
  });
}

async function cleanup() {
  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
        targetType: "CoachClassAttendance",
      },
    });
  }

  await db.coachClassAttendance.deleteMany({
    where: {
      occurrenceKey: {
        contains: "2031-04",
      },
    },
  });

  await db.attendancePeriod.deleteMany({
    where: {
      monthKey: "2031-04",
    },
  });

  const scheduleIds = [
    schedule1Id,
    schedule2Id,
    schedule3Id,
    unlinkedScheduleId,
    rollbackScheduleId,
  ].filter(Boolean);

  if (scheduleIds.length) {
    await db.schedule.deleteMany({
      where: {
        id: {
          in: scheduleIds,
        },
      },
    });
  }

  const classIds = [classId, unlinkedClassId].filter(Boolean);

  if (classIds.length) {
    await db.class.deleteMany({
      where: {
        id: {
          in: classIds,
        },
      },
    });
  }

  const trainerIds = [
    scheduledTrainerId,
    substituteTrainerId,
    unlinkedTrainerId,
  ].filter(Boolean);

  if (trainerIds.length) {
    await db.trainer.deleteMany({
      where: {
        id: {
          in: trainerIds,
        },
      },
    });
  }

  const employeeIds = [scheduledEmployeeId, substituteEmployeeId].filter(
    Boolean,
  );

  if (employeeIds.length) {
    await db.employeeProfile.deleteMany({
      where: {
        id: {
          in: employeeIds,
        },
      },
    });
  }

  if (actorId) {
    await db.user.deleteMany({
      where: {
        id: actorId,
      },
    });
  }
}

beforeAll(async () => {
  await cleanup();

  const actorUser = await db.user.create({
    data: {
      name: "Coach Attendance Test Admin",
      email: `coach-att-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = actorUser.id;

  const scheduledEmployee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-COACH-E1-${stamp}`,
      name: "Scheduled Coach Employee",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  scheduledEmployeeId = scheduledEmployee.id;

  const substituteEmployee = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-COACH-E2-${stamp}`,
      name: "Substitute Coach Employee",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  substituteEmployeeId = substituteEmployee.id;

  const scheduledTrainer = await db.trainer.create({
    data: {
      name: `TEST Scheduled Trainer ${stamp}`,
      specialty: "Test",
      employeeId: scheduledEmployeeId,
    },
  });

  scheduledTrainerId = scheduledTrainer.id;

  const substituteTrainer = await db.trainer.create({
    data: {
      name: `TEST Substitute Trainer ${stamp}`,
      specialty: "Test",
      employeeId: substituteEmployeeId,
    },
  });

  substituteTrainerId = substituteTrainer.id;

  const unlinkedTrainer = await db.trainer.create({
    data: {
      name: `TEST Unlinked Trainer ${stamp}`,
      specialty: "Test",
    },
  });

  unlinkedTrainerId = unlinkedTrainer.id;

  const classRow = await db.class.create({
    data: {
      name: `TEST Payroll Class ${stamp}`,
      trainerId: scheduledTrainerId,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
    },
  });

  classId = classRow.id;

  const unlinkedClass = await db.class.create({
    data: {
      name: `TEST Unlinked Class ${stamp}`,
      trainerId: unlinkedTrainerId,
      type: "fitness",
      duration: 45,
      intensity: "medium",
      maxSpots: 10,
    },
  });

  unlinkedClassId = unlinkedClass.id;

  schedule1Id = (await createSchedule(classId, "2031-04-07", "09:00")).id;

  schedule2Id = (await createSchedule(classId, "2031-04-08", "10:00")).id;

  schedule3Id = (await createSchedule(classId, "2031-04-09", "11:00")).id;

  unlinkedScheduleId = (
    await createSchedule(unlinkedClassId, "2031-04-10", "12:00")
  ).id;

  rollbackScheduleId = (await createSchedule(classId, "2031-04-11", "13:00"))
    .id;
});

afterAll(async () => {
  await cleanup();
});

describe("Coach Class Attendance Service", () => {
  it("records present with scheduled trainer/employee snapshots", async () => {
    const row = await saveCoachClassAttendance(
      {
        scheduleId: schedule1Id,
        status: "present",
      },
      actor(),
    );

    expect(row.status).toBe("present");

    expect(row.scheduledTrainerId).toBe(scheduledTrainerId);

    expect(row.actualTrainerId).toBe(scheduledTrainerId);

    expect(row.scheduledEmployeeId).toBe(scheduledEmployeeId);

    expect(row.actualEmployeeId).toBe(scheduledEmployeeId);

    expect(row.scheduleTime).toBe("09:00");

    expect(row.occurrenceKey).toBe(`${classId}:2031-04-07:09:00`);

    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: actorId,
        targetType: "CoachClassAttendance",
        targetId: row.id,
        action: "coach_class_attendance_create",
      },
    });

    expect(audit).toBeTruthy();
  });

  it("updates same occurrence without duplicate", async () => {
    const first = await saveCoachClassAttendance(
      {
        scheduleId: schedule2Id,
        status: "present",
      },
      actor(),
    );

    const second = await saveCoachClassAttendance(
      {
        scheduleId: schedule2Id,
        status: "absent",
        notes: "Did not attend",
        editReason: "Correcting coach attendance",
      },
      actor(),
    );

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("absent");
    expect(second.actualTrainerId).toBeNull();

    expect(
      await db.coachClassAttendance.count({
        where: {
          occurrenceKey: `${classId}:2031-04-08:10:00`,
        },
      }),
    ).toBe(1);

    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: actorId,
        targetId: second.id,
        action: "coach_class_attendance_update",
      },
    });

    expect(audit).toBeTruthy();

    const details = JSON.parse(audit!.details || "{}");

    expect(details.before.status).toBe("present");
    expect(details.after.status).toBe("absent");
    expect(details.editReason).toBe("Correcting coach attendance");
  });

  it("requires edit reason for an existing coach attendance correction", async () => {
    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: schedule2Id,
          status: "excused",
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_EDIT_REASON_REQUIRED");

    const unchanged = await db.coachClassAttendance.findUniqueOrThrow({
      where: {
        occurrenceKey: `${classId}:2031-04-08:10:00`,
      },
    });

    expect(unchanged.status).toBe("absent");
  });

  it("records substitute with actual trainer/employee snapshots", async () => {
    const row = await saveCoachClassAttendance(
      {
        scheduleId: schedule3Id,
        status: "substitute",
        actualTrainerId: substituteTrainerId,
      },
      actor(),
    );

    expect(row.status).toBe("substitute");

    expect(row.scheduledTrainerId).toBe(scheduledTrainerId);

    expect(row.scheduledEmployeeId).toBe(scheduledEmployeeId);

    expect(row.actualTrainerId).toBe(substituteTrainerId);

    expect(row.actualEmployeeId).toBe(substituteEmployeeId);
  });

  it("requires substitute trainer", async () => {
    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: schedule3Id,
          status: "substitute",
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_SUBSTITUTE_REQUIRED");
  });

  it("substitute must differ from scheduled trainer", async () => {
    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: schedule3Id,
          status: "substitute",
          actualTrainerId: scheduledTrainerId,
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_SUBSTITUTE_MUST_DIFFER");
  });

  it("rejects actual trainer for absent status", async () => {
    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: schedule3Id,
          status: "absent",
          actualTrainerId: substituteTrainerId,
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_ALLOWED");
  });

  it("rejects payroll attendance when scheduled trainer has no EmployeeProfile link", async () => {
    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: unlinkedScheduleId,
          status: "present",
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_SCHEDULED_TRAINER_NOT_LINKED");
  });

  it("respects monthly attendance lock", async () => {
    await db.attendancePeriod.upsert({
      where: {
        monthKey: "2031-04",
      },
      create: {
        monthKey: "2031-04",
        status: "locked",
        lockedAt: new Date(),
        lockedById: actorId,
      },
      update: {
        status: "locked",
        lockedAt: new Date(),
        lockedById: actorId,
      },
    });

    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: rollbackScheduleId,
          status: "present",
        },
        actor(),
      ),
    ).rejects.toThrow("COACH_CLASS_ATTENDANCE_PERIOD_LOCKED");

    await db.attendancePeriod.update({
      where: {
        monthKey: "2031-04",
      },
      data: {
        status: "open",
      },
    });
  });

  it("mandatory AuditLog failure rolls back attendance mutation", async () => {
    /*
     * Keep actor.userId VALID so CoachClassAttendance.create()
     * can succeed first.
     *
     * AuditLog.actorName is VARCHAR(191). Oversized actorName
     * forces AuditLog.create() to fail after the attendance
     * mutation inside the same transaction.
     */
    const auditFailingActor = {
      ...actor(),
      name: "X".repeat(500),
    };

    await expect(
      saveCoachClassAttendance(
        {
          scheduleId: rollbackScheduleId,
          status: "present",
        },
        auditFailingActor,
      ),
    ).rejects.toThrow();

    expect(
      await db.coachClassAttendance.count({
        where: {
          occurrenceKey: `${classId}:2031-04-11:13:00`,
        },
      }),
    ).toBe(0);

    expect(
      await db.auditLog.count({
        where: {
          actorUserId: actorId,
          targetType: "CoachClassAttendance",
          action: "coach_class_attendance_create",
          details: {
            contains: `${classId}:2031-04-11:13:00`,
          },
        },
      }),
    ).toBe(0);
  });

  it("historical occurrence survives schedule deletion and recreated schedule reuses same occurrence", async () => {
    const original = await saveCoachClassAttendance(
      {
        scheduleId: rollbackScheduleId,
        status: "present",
      },
      actor(),
    );

    expect(original.scheduleId).toBe(rollbackScheduleId);

    await db.schedule.delete({
      where: {
        id: rollbackScheduleId,
      },
    });

    const afterDelete = await db.coachClassAttendance.findUniqueOrThrow({
      where: {
        id: original.id,
      },
    });

    expect(afterDelete.scheduleId).toBeNull();

    const recreated = await createSchedule(classId, "2031-04-11", "13:00");

    rollbackScheduleId = recreated.id;

    const corrected = await saveCoachClassAttendance(
      {
        scheduleId: recreated.id,
        status: "excused",
        editReason: "Correction after schedule recreation",
      },
      actor(),
    );

    expect(corrected.id).toBe(original.id);
    expect(corrected.status).toBe("excused");
    expect(corrected.scheduleId).toBe(recreated.id);

    expect(
      await db.coachClassAttendance.count({
        where: {
          occurrenceKey: `${classId}:2031-04-11:13:00`,
        },
      }),
    ).toBe(1);

    // Scheduled historical snapshot remains the same
    // even though the mutable schedule reference changed.
    expect(corrected.scheduledTrainerId).toBe(original.scheduledTrainerId);

    expect(corrected.scheduledEmployeeId).toBe(original.scheduledEmployeeId);
  });
});
