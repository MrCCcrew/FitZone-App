import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import {
  linkTrainerToEmployee,
  unlinkTrainerFromEmployee,
} from "@/lib/employees/trainer-employee-link-service";

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

export async function GET() {
  const guard = await requireAdminPermission("employees_view");

  if ("error" in guard) return guard.error;

  const trainers = await db.trainer.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameEn: true,
      specialty: true,
      specialtyEn: true,
      image: true,
      isActive: true,
      employeeId: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          phone: true,
          employmentStatus: true,
          payrollEnabled: true,
          department: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },
          position: {
            select: {
              id: true,
              code: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    trainers: trainers.map((trainer) => ({
      id: trainer.id,
      name: trainer.name,
      nameEn: trainer.nameEn,
      specialty: trainer.specialty,
      specialtyEn: trainer.specialtyEn,
      image: trainer.image,
      active: trainer.isActive,

      employeeId: trainer.employeeId,
      linked: Boolean(trainer.employeeId),

      employee: trainer.employee
        ? {
            id: trainer.employee.id,
            employeeCode: trainer.employee.employeeCode,
            name: trainer.employee.name,
            phone: trainer.employee.phone,
            employmentStatus: trainer.employee.employmentStatus,
            payrollEnabled: trainer.employee.payrollEnabled,
            department: trainer.employee.department,
            position: trainer.employee.position,
          }
        : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("employees_manage");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const result = await linkTrainerToEmployee(
      String(body.trainerId ?? ""),
      String(body.employeeId ?? ""),
      actorFromGuard(guard),
    );

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    const map: Record<string, [number, string]> = {
      TRAINER_EMPLOYEE_LINK_TRAINER_REQUIRED: [400, "المدرب مطلوب"],
      TRAINER_EMPLOYEE_LINK_EMPLOYEE_REQUIRED: [400, "الموظف مطلوب"],
      TRAINER_EMPLOYEE_LINK_TRAINER_NOT_FOUND: [404, "المدرب غير موجود"],
      TRAINER_EMPLOYEE_LINK_EMPLOYEE_NOT_FOUND: [404, "الموظف غير موجود"],
      TRAINER_EMPLOYEE_LINK_EMPLOYEE_ALREADY_LINKED: [
        409,
        "الموظف مرتبط بمدرب آخر بالفعل",
      ],
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

    console.error("[TRAINER_EMPLOYEE_LINK]", error);

    return NextResponse.json(
      {
        error: "تعذر ربط المدرب بالموظف",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdminPermission("employees_manage");

  if ("error" in guard) return guard.error;

  const body = await req.json();

  try {
    const result = await unlinkTrainerFromEmployee(
      String(body.trainerId ?? ""),
      String(body.reason ?? ""),
      actorFromGuard(guard),
    );

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";

    const map: Record<string, [number, string]> = {
      TRAINER_EMPLOYEE_LINK_TRAINER_REQUIRED: [400, "المدرب مطلوب"],
      TRAINER_EMPLOYEE_LINK_TRAINER_NOT_FOUND: [404, "المدرب غير موجود"],
      TRAINER_EMPLOYEE_UNLINK_REASON_REQUIRED: [400, "سبب إلغاء الربط مطلوب"],
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

    console.error("[TRAINER_EMPLOYEE_UNLINK]", error);

    return NextResponse.json(
      {
        error: "تعذر إلغاء ربط المدرب بالموظف",
      },
      {
        status: 500,
      },
    );
  }
}
