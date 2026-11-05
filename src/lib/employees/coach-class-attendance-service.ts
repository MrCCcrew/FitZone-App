import type { Prisma } from "@prisma/client";
import { db, asDbTransactionClient } from "@/lib/db";
import { scheduleCalendarDateKey } from "@/lib/fitzone-time";

type Tx = Prisma.TransactionClient;

export const COACH_CLASS_ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "substitute",
  "excused",
  "cancelled",
] as const;

export type CoachClassAttendanceStatus =
  (typeof COACH_CLASS_ATTENDANCE_STATUSES)[number];

type ActorSnapshot = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SaveCoachClassAttendanceInput = {
  scheduleId: string;
  status: CoachClassAttendanceStatus;
  actualTrainerId?: string | null;
  notes?: string | null;
  editReason?: string | null;
};

function validateStatus(
  status: string,
): asserts status is CoachClassAttendanceStatus {
  if (
    !COACH_CLASS_ATTENDANCE_STATUSES.includes(
      status as CoachClassAttendanceStatus,
    )
  ) {
    throw new Error("COACH_CLASS_ATTENDANCE_INVALID_STATUS");
  }
}

function normalizeScheduleTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());

  if (!match) {
    throw new Error("COACH_CLASS_ATTENDANCE_INVALID_SCHEDULE_TIME");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error("COACH_CLASS_ATTENDANCE_INVALID_SCHEDULE_TIME");
  }

  if (second !== 0) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
      2,
      "0",
    )}:${String(second).padStart(2, "0")}`;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeNotes(value: string | null | undefined) {
  if (value == null) return null;

  const trimmed = value.trim();

  return trimmed || null;
}

async function assertPeriodOpen(tx: Tx, monthKey: string) {
  const period = await tx.attendancePeriod.findUnique({
    where: {
      monthKey,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (period?.status === "locked") {
    throw new Error("COACH_CLASS_ATTENDANCE_PERIOD_LOCKED");
  }
}

async function writeMandatoryAudit(
  tx: Tx,
  actor: ActorSnapshot,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: JSON.stringify(input.details),
    },
  });
}

async function loadActualTrainer(tx: Tx, trainerId: string) {
  const trainer = await tx.trainer.findUnique({
    where: {
      id: trainerId,
    },
    select: {
      id: true,
      name: true,
      employeeId: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          payrollEnabled: true,
          employmentStatus: true,
        },
      },
    },
  });

  if (!trainer) {
    throw new Error("COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_FOUND");
  }

  if (!trainer.employeeId || !trainer.employee) {
    throw new Error("COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_LINKED");
  }

  return trainer;
}

export async function saveCoachClassAttendance(
  input: SaveCoachClassAttendanceInput,
  actor: ActorSnapshot,
) {
  if (!input.scheduleId?.trim()) {
    throw new Error("COACH_CLASS_ATTENDANCE_SCHEDULE_REQUIRED");
  }

  if (!actor.userId?.trim()) {
    throw new Error("COACH_CLASS_ATTENDANCE_ACTOR_REQUIRED");
  }

  validateStatus(input.status);

  const notes = normalizeNotes(input.notes);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const schedule = await tx.schedule.findUnique({
      where: {
        id: input.scheduleId,
      },
      select: {
        id: true,
        date: true,
        time: true,
        classId: true,
        class: {
          select: {
            id: true,
            name: true,
            duration: true,
            classType: {
              select: {
                key: true,
                nameAr: true,
              },
            },
            trainer: {
              select: {
                id: true,
                name: true,
                employeeId: true,
                employee: {
                  select: {
                    id: true,
                    employeeCode: true,
                    name: true,
                    payrollEnabled: true,
                    employmentStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!schedule) {
      throw new Error("COACH_CLASS_ATTENDANCE_SCHEDULE_NOT_FOUND");
    }

    const scheduledTrainer = schedule.class.trainer;

    if (!scheduledTrainer.employeeId || !scheduledTrainer.employee) {
      throw new Error("COACH_CLASS_ATTENDANCE_SCHEDULED_TRAINER_NOT_LINKED");
    }

    const dateKey = scheduleCalendarDateKey(schedule.date);

    const monthKey = dateKey.slice(0, 7);

    await assertPeriodOpen(tx, monthKey);

    const scheduleTime = normalizeScheduleTime(schedule.time);

    const occurrenceKey = [schedule.class.id, dateKey, scheduleTime].join(":");

    let actualTrainer: Awaited<ReturnType<typeof loadActualTrainer>> | null =
      null;

    if (input.status === "present") {
      if (
        input.actualTrainerId &&
        input.actualTrainerId !== scheduledTrainer.id
      ) {
        throw new Error("COACH_CLASS_ATTENDANCE_PRESENT_TRAINER_MISMATCH");
      }

      actualTrainer = await loadActualTrainer(tx, scheduledTrainer.id);
    } else if (input.status === "substitute") {
      if (!input.actualTrainerId?.trim()) {
        throw new Error("COACH_CLASS_ATTENDANCE_SUBSTITUTE_REQUIRED");
      }

      if (input.actualTrainerId === scheduledTrainer.id) {
        throw new Error("COACH_CLASS_ATTENDANCE_SUBSTITUTE_MUST_DIFFER");
      }

      actualTrainer = await loadActualTrainer(tx, input.actualTrainerId);
    } else if (input.actualTrainerId) {
      throw new Error("COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_ALLOWED");
    }

    const existing = await tx.coachClassAttendance.findUnique({
      where: {
        occurrenceKey,
      },
    });

    const editReason =
      input.editReason?.trim() || null;

    if (
      existing &&
      (!editReason || editReason.length < 3)
    ) {
      throw new Error(
        "COACH_CLASS_ATTENDANCE_EDIT_REASON_REQUIRED",
      );
    }

    const actualSnapshot = actualTrainer
      ? {
          actualTrainerId: actualTrainer.id,
          actualTrainerNameSnapshot: actualTrainer.name,
          actualEmployeeId: actualTrainer.employee!.id,
          actualEmployeeCodeSnapshot: actualTrainer.employee!.employeeCode,
          actualEmployeeNameSnapshot: actualTrainer.employee!.name,
        }
      : {
          actualTrainerId: null,
          actualTrainerNameSnapshot: null,
          actualEmployeeId: null,
          actualEmployeeCodeSnapshot: null,
          actualEmployeeNameSnapshot: null,
        };

    const row = existing
      ? await tx.coachClassAttendance.update({
          where: {
            id: existing.id,
          },
          data: {
            // scheduleId is a mutable reference only.
            // Historical scheduled snapshots below are intentionally
            // NOT rewritten during corrections.
            scheduleId: schedule.id,
            status: input.status,
            notes,
            recordedById: actor.userId,
            ...actualSnapshot,
          },
        })
      : await tx.coachClassAttendance.create({
          data: {
            scheduleId: schedule.id,
            classId: schedule.class.id,

            sourceClassIdSnapshot: schedule.class.id,
            occurrenceKey,

            scheduleDate: schedule.date,
            scheduleTime,

            classNameSnapshot: schedule.class.name,
            classTypeKeySnapshot: schedule.class.classType?.key ?? null,
            classTypeNameSnapshot: schedule.class.classType?.nameAr ?? null,
            durationMinutesSnapshot: schedule.class.duration,

            scheduledTrainerId: scheduledTrainer.id,
            scheduledTrainerNameSnapshot: scheduledTrainer.name,

            scheduledEmployeeId: scheduledTrainer.employee.id,
            scheduledEmployeeCodeSnapshot:
              scheduledTrainer.employee.employeeCode,
            scheduledEmployeeNameSnapshot: scheduledTrainer.employee.name,

            ...actualSnapshot,

            status: input.status,
            notes,
            recordedById: actor.userId,
          },
        });

    await writeMandatoryAudit(tx, actor, {
      action: existing
        ? "coach_class_attendance_update"
        : "coach_class_attendance_create",
      targetType: "CoachClassAttendance",
      targetId: row.id,
      details: {
        occurrenceKey,
        scheduleId: schedule.id,
        classId: schedule.class.id,
        date: dateKey,
        time: scheduleTime,
        editReason,

        before: existing
          ? {
              status: existing.status,
              actualTrainerId: existing.actualTrainerId,
              actualTrainerNameSnapshot: existing.actualTrainerNameSnapshot,
              actualEmployeeId: existing.actualEmployeeId,
              notes: existing.notes,
            }
          : null,

        after: {
          status: row.status,
          scheduledTrainerId: row.scheduledTrainerId,
          scheduledTrainerNameSnapshot: row.scheduledTrainerNameSnapshot,
          scheduledEmployeeId: row.scheduledEmployeeId,

          actualTrainerId: row.actualTrainerId,
          actualTrainerNameSnapshot: row.actualTrainerNameSnapshot,
          actualEmployeeId: row.actualEmployeeId,

          notes: row.notes,
        },
      },
    });

    return row;
  });
}
