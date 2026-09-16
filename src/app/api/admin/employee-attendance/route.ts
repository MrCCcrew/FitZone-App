import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import {
  cairoDateStartInstant,
  addCairoCalendarDays,
} from "@/lib/fitzone-time";
import {
  EMPLOYEE_ATTENDANCE_STATUSES,
  saveEmployeeAttendance,
  type EmployeeAttendanceStatus,
} from "@/lib/employees/employee-attendance-service";

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
  const userId = guard.session.user?.id ?? guard.session.id ?? "";

  return {
    userId,
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

  return { from, to };
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminPermission("employee_attendance_view");

  if ("error" in guard) return guard.error;

  const url = new URL(req.url);

  const employeeId = url.searchParams.get("employeeId");
  const month = url.searchParams.get("month");
  const date = url.searchParams.get("date");
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (status) {
    if (
      !EMPLOYEE_ATTENDANCE_STATUSES.includes(status as EmployeeAttendanceStatus)
    ) {
      return NextResponse.json(
        { error: "حالة الحضور غير صحيحة" },
        { status: 400 },
      );
    }

    where.status = status;
  }

  try {
    if (date) {
      const start = cairoDateStartInstant(date);
      const end = addCairoCalendarDays(start, 1);

      where.attendanceDate = {
        gte: start,
        lt: end,
      };
    } else if (month) {
      const { from, to } = parseMonthRange(month);

      where.attendanceDate = {
        gte: from,
        lt: to,
      };
    }
  } catch {
    return NextResponse.json(
      { error: "التاريخ أو الشهر غير صحيح" },
      { status: 400 },
    );
  }

  const rows = await db.employeeAttendance.findMany({
    where,
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          phone: true,
          avatar: true,
          employmentStatus: true,
          department: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
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
    orderBy: [{ attendanceDate: "desc" }, { employee: { name: "asc" } }],
  });

  let period = null;

  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    period = await db.attendancePeriod.findUnique({
      where: { monthKey: month },
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
    period: period ?? {
      monthKey: month ?? null,
      status: "open",
      implicit: true,
    },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("employee_attendance_manage");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const attendance = await saveEmployeeAttendance(
      {
        employeeId: String(body.employeeId ?? ""),
        date: String(body.date ?? ""),
        status: String(body.status ?? "") as EmployeeAttendanceStatus,
        scheduledStartTime: body.scheduledStartTime ?? null,
        scheduledEndTime: body.scheduledEndTime ?? null,
        checkInAt: body.checkInAt ?? null,
        checkOutAt: body.checkOutAt ?? null,
        lateMinutes: body.lateMinutes == null ? 0 : Number(body.lateMinutes),
        notes: body.notes ?? null,
        editReason: body.editReason ?? null,
      },
      actorFromGuard(guard),
    );

    return NextResponse.json({ attendance });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    const map: Record<string, [number, string]> = {
      EMPLOYEE_ATTENDANCE_EMPLOYEE_REQUIRED: [400, "الموظف مطلوب"],
      EMPLOYEE_ATTENDANCE_INVALID_DATE: [400, "التاريخ غير صحيح"],
      EMPLOYEE_ATTENDANCE_INVALID_STATUS: [400, "حالة الحضور غير صحيحة"],
      EMPLOYEE_ATTENDANCE_INVALID_SCHEDULED_START_TIME: [
        400,
        "وقت بداية العمل غير صحيح",
      ],
      EMPLOYEE_ATTENDANCE_INVALID_SCHEDULED_END_TIME: [
        400,
        "وقت نهاية العمل غير صحيح",
      ],
      EMPLOYEE_ATTENDANCE_INVALID_CHECK_IN: [400, "وقت الحضور غير صحيح"],
      EMPLOYEE_ATTENDANCE_INVALID_CHECK_OUT: [400, "وقت الانصراف غير صحيح"],
      EMPLOYEE_ATTENDANCE_INVALID_LATE_MINUTES: [
        400,
        "عدد دقائق التأخير غير صحيح",
      ],
      EMPLOYEE_ATTENDANCE_CHECKOUT_BEFORE_CHECKIN: [
        400,
        "وقت الانصراف لا يمكن أن يسبق وقت الحضور",
      ],
      EMPLOYEE_ATTENDANCE_EDIT_REASON_REQUIRED: [
        400,
        "سبب تعديل سجل الحضور مطلوب",
      ],
      EMPLOYEE_ATTENDANCE_EMPLOYEE_NOT_FOUND: [404, "الموظف غير موجود"],
      EMPLOYEE_ATTENDANCE_PERIOD_LOCKED: [409, "شهر الحضور مقفول"],
    };

    const mapped = map[code];

    if (mapped) {
      return NextResponse.json(
        { error: mapped[1], code },
        { status: mapped[0] },
      );
    }

    console.error("[EMPLOYEE_ATTENDANCE_POST]", error);

    return NextResponse.json({ error: "تعذر حفظ الحضور" }, { status: 500 });
  }
}
