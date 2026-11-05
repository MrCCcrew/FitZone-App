import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { lockAttendancePeriod } from "@/lib/employees/employee-attendance-service";

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
  const guard = await requireAdminPermission("employee_attendance_lock");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const result = await lockAttendancePeriod(
      String(body.monthKey ?? ""),
      actorFromGuard(guard),
    );

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    if (code === "EMPLOYEE_ATTENDANCE_INVALID_MONTH") {
      return NextResponse.json(
        { error: "الشهر غير صحيح", code },
        { status: 400 },
      );
    }

    console.error("[EMPLOYEE_ATTENDANCE_LOCK]", error);

    return NextResponse.json({ error: "تعذر قفل شهر الحضور" }, { status: 500 });
  }
}
