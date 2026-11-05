import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import {
  COACH_CLASS_ATTENDANCE_STATUSES,
  saveCoachClassAttendance,
  type CoachClassAttendanceStatus,
} from "@/lib/employees/coach-class-attendance-service";
import {
  addCairoCalendarDays,
  cairoDateStartInstant,
  scheduleCalendarDateKey,
} from "@/lib/fitzone-time";

export const dynamic = "force-dynamic";

function actorFromGuard(guard: {
  session: {
    id?: string;
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      role?: string | null;
    };
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
  role?: string;
}) {
  return {
    userId: guard.session.user?.id ?? guard.session.id ?? "",
    name: guard.session.user?.name ?? guard.session.name ?? null,
    email: guard.session.user?.email ?? guard.session.email ?? null,
    role: guard.session.user?.role ?? guard.session.role ?? guard.role ?? null,
  };
}

function parseMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("INVALID_MONTH");
  }

  const from = cairoDateStartInstant(`${month}-01`);

  const [year, monthNumber] = month.split("-").map(Number);

  const nextMonth =
    monthNumber === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;

  const to = cairoDateStartInstant(`${nextMonth}-01`);

  return {
    from,
    to,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminPermission("coach_class_attendance_view");

  if ("error" in guard) return guard.error;

  const url = new URL(req.url);

  const month = url.searchParams.get("month");

  const date = url.searchParams.get("date");

  const status = url.searchParams.get("status");

  const trainerId = url.searchParams.get("trainerId");

  const employeeId = url.searchParams.get("employeeId");

  const classId = url.searchParams.get("classId");

  const where: Record<string, unknown> = {};

  if (classId) {
    where.classId = classId;
  }

  if (status) {
    if (
      !COACH_CLASS_ATTENDANCE_STATUSES.includes(
        status as CoachClassAttendanceStatus,
      )
    ) {
      return NextResponse.json(
        {
          error: "حالة حضور المدرب غير صحيحة",
        },
        {
          status: 400,
        },
      );
    }

    where.status = status;
  }

  const andConditions: Record<string, unknown>[] = [];

  if (trainerId) {
    andConditions.push({
      OR: [
        {
          scheduledTrainerId: trainerId,
        },
        {
          actualTrainerId: trainerId,
        },
      ],
    });
  }

  if (employeeId) {
    andConditions.push({
      OR: [
        {
          scheduledEmployeeId: employeeId,
        },
        {
          actualEmployeeId: employeeId,
        },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  try {
    if (date) {
      const start = cairoDateStartInstant(date);

      const end = addCairoCalendarDays(start, 1);

      where.scheduleDate = {
        gte: start,
        lt: end,
      };
    } else if (month) {
      const { from, to } = parseMonthRange(month);

      where.scheduleDate = {
        gte: from,
        lt: to,
      };
    }
  } catch {
    return NextResponse.json(
      {
        error: "التاريخ أو الشهر غير صحيح",
      },
      {
        status: 400,
      },
    );
  }

  const rows = await db.coachClassAttendance.findMany({
    where,
    include: {
      scheduledTrainer: {
        select: {
          id: true,
          name: true,
        },
      },
      actualTrainer: {
        select: {
          id: true,
          name: true,
        },
      },
      scheduledEmployee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
        },
      },
      actualEmployee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
        },
      },
      recordedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [
      {
        scheduleDate: "desc",
      },
      {
        scheduleTime: "desc",
      },
    ],
  });

  let occurrenceRange: {
    gte: Date;
    lt: Date;
  } | null = null;

  if (date) {
    const start = cairoDateStartInstant(date);

    occurrenceRange = {
      gte: start,
      lt: addCairoCalendarDays(start, 1),
    };
  } else if (month) {
    const { from, to } = parseMonthRange(month);

    occurrenceRange = {
      gte: from,
      lt: to,
    };
  }

  const scheduleRows = occurrenceRange
    ? await db.schedule.findMany({
        where: {
          date: occurrenceRange,
          ...(classId
            ? {
                classId,
              }
            : {}),
        },
        include: {
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

          coachClassAttendance: {
            include: {
              scheduledTrainer: {
                select: {
                  id: true,
                  name: true,
                },
              },

              actualTrainer: {
                select: {
                  id: true,
                  name: true,
                },
              },

              scheduledEmployee: {
                select: {
                  id: true,
                  employeeCode: true,
                  name: true,
                },
              },

              actualEmployee: {
                select: {
                  id: true,
                  employeeCode: true,
                  name: true,
                },
              },

              recordedBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },

        orderBy: [
          {
            date: "asc",
          },
          {
            time: "asc",
          },
        ],
      })
    : [];

  const occurrences = scheduleRows
    .map((schedule) => ({
      scheduleId: schedule.id,
      classId: schedule.classId,

      date: scheduleCalendarDateKey(schedule.date),
      time: schedule.time,

      isActive: schedule.isActive,
      availableSpots: schedule.availableSpots,

      class: {
        id: schedule.class.id,
        name: schedule.class.name,
        durationMinutes: schedule.class.duration,
        classTypeKey: schedule.class.classType?.key ?? null,
        classTypeName: schedule.class.classType?.nameAr ?? null,
      },

      scheduledTrainer: {
        id: schedule.class.trainer.id,
        name: schedule.class.trainer.name,
        employeeId: schedule.class.trainer.employeeId,

        employee: schedule.class.trainer.employee
          ? {
              id: schedule.class.trainer.employee.id,
              employeeCode: schedule.class.trainer.employee.employeeCode,
              name: schedule.class.trainer.employee.name,
              payrollEnabled: schedule.class.trainer.employee.payrollEnabled,
              employmentStatus:
                schedule.class.trainer.employee.employmentStatus,
            }
          : null,
      },

      attendance: schedule.coachClassAttendance,
    }))
    .filter((occurrence) => {
      if (status && occurrence.attendance?.status !== status) {
        return false;
      }

      if (
        trainerId &&
        occurrence.scheduledTrainer.id !== trainerId &&
        occurrence.attendance?.actualTrainerId !== trainerId
      ) {
        return false;
      }

      if (
        employeeId &&
        occurrence.scheduledTrainer.employeeId !== employeeId &&
        occurrence.attendance?.actualEmployeeId !== employeeId
      ) {
        return false;
      }

      return true;
    });

  let period = null;

  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    period = await db.attendancePeriod.findUnique({
      where: {
        monthKey: month,
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        unlockedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  return NextResponse.json({
    rows,
    occurrences,
    period:
      period ??
      (month
        ? {
            monthKey: month,
            status: "open",
            implicit: true,
          }
        : null),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("coach_class_attendance_manage");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const attendance = await saveCoachClassAttendance(
      {
        scheduleId: String(body.scheduleId ?? ""),
        status: String(body.status ?? "") as CoachClassAttendanceStatus,

        actualTrainerId:
          body.actualTrainerId == null ? null : String(body.actualTrainerId),

        notes: body.notes == null ? null : String(body.notes),

        editReason: body.editReason == null ? null : String(body.editReason),
      },
      actorFromGuard(guard),
    );

    return NextResponse.json({
      attendance,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    const map: Record<string, [number, string]> = {
      COACH_CLASS_ATTENDANCE_SCHEDULE_REQUIRED: [400, "الحصة مطلوبة"],

      COACH_CLASS_ATTENDANCE_INVALID_STATUS: [
        400,
        "حالة حضور المدرب غير صحيحة",
      ],

      COACH_CLASS_ATTENDANCE_INVALID_SCHEDULE_TIME: [400, "وقت الحصة غير صحيح"],

      COACH_CLASS_ATTENDANCE_PRESENT_TRAINER_MISMATCH: [
        400,
        "المدرب الفعلي لا يطابق المدرب المجدول",
      ],

      COACH_CLASS_ATTENDANCE_SUBSTITUTE_REQUIRED: [400, "المدرب البديل مطلوب"],

      COACH_CLASS_ATTENDANCE_SUBSTITUTE_MUST_DIFFER: [
        400,
        "المدرب البديل يجب أن يختلف عن المدرب المجدول",
      ],

      COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_ALLOWED: [
        400,
        "لا يمكن تحديد مدرب فعلي لهذه الحالة",
      ],

      COACH_CLASS_ATTENDANCE_EDIT_REASON_REQUIRED: [
        400,
        "سبب تعديل حضور الحصة مطلوب",
      ],

      COACH_CLASS_ATTENDANCE_SCHEDULE_NOT_FOUND: [404, "الحصة غير موجودة"],

      COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_FOUND: [
        404,
        "المدرب الفعلي غير موجود",
      ],

      COACH_CLASS_ATTENDANCE_SCHEDULED_TRAINER_NOT_LINKED: [
        409,
        "المدرب المجدول غير مربوط بملف موظف",
      ],

      COACH_CLASS_ATTENDANCE_ACTUAL_TRAINER_NOT_LINKED: [
        409,
        "المدرب الفعلي غير مربوط بملف موظف",
      ],

      COACH_CLASS_ATTENDANCE_PERIOD_LOCKED: [409, "شهر الحضور مقفول"],
    };

    const mapped = map[code];

    if (mapped) {
      return NextResponse.json(
        {
          error: mapped[1],
          code,
        },
        {
          status: mapped[0],
        },
      );
    }

    console.error("[COACH_CLASS_ATTENDANCE_POST]", error);

    return NextResponse.json(
      {
        error: "تعذر حفظ حضور المدرب للحصة",
      },
      {
        status: 500,
      },
    );
  }
}
