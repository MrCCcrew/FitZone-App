import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { unlockAttendancePeriod } from "@/lib/employees/employee-attendance-service";

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

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("employee_attendance_override");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const period = await unlockAttendancePeriod(
      String(body.monthKey ?? ""),
      String(body.reason ?? ""),
      actorFromGuard(guard),
    );

    return NextResponse.json({ period });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    const map: Record<string, [number, string]> = {
      EMPLOYEE_ATTENDANCE_INVALID_MONTH: [400, "الشهر غير صحيح"],
      EMPLOYEE_ATTENDANCE_UNLOCK_REASON_REQUIRED: [400, "سبب فك القفل مطلوب"],
      EMPLOYEE_ATTENDANCE_PERIOD_NOT_LOCKED: [409, "الشهر غير مقفول"],
    };

    const mapped = map[code];

    if (mapped) {
      return NextResponse.json(
        { error: mapped[1], code },
        { status: mapped[0] },
      );
    }

    console.error("[EMPLOYEE_ATTENDANCE_UNLOCK]", error);

    return NextResponse.json(
      { error: "تعذر فك قفل شهر الحضور" },
      { status: 500 },
    );
  }
}
