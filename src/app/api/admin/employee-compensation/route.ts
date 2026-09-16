import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import {
  saveCoachClassCompensationTerm,
  saveCoachCompensationTerm,
  saveEmployeeCompensationTerm,
  type CoachCompensationLevel,
} from "@/lib/employees/compensation-service";

export const dynamic = "force-dynamic";

type CompensationKind = "employee" | "coach" | "coach_class";

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

function readKind(value: unknown): CompensationKind {
  if (value === "employee" || value === "coach" || value === "coach_class") {
    return value;
  }

  throw new Error("COMPENSATION_INVALID_KIND");
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(code);
  }

  return value.trim();
}

function requiredInteger(value: unknown, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(code);
  }

  return value;
}

function mapError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "COMPENSATION_UNKNOWN_ERROR";

  if (
    message === "COMPENSATION_EMPLOYEE_NOT_FOUND" ||
    message === "COMPENSATION_CLASS_NOT_FOUND" ||
    message === "COMPENSATION_TERM_NOT_FOUND"
  ) {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (
    message === "COMPENSATION_EMPLOYEE_TERM_OVERLAP" ||
    message === "COMPENSATION_COACH_TERM_OVERLAP" ||
    message === "COMPENSATION_COACH_CLASS_TERM_OVERLAP" ||
    message === "COMPENSATION_TERM_EMPLOYEE_IMMUTABLE" ||
    message === "COMPENSATION_TERM_CLASS_IMMUTABLE"
  ) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (message.startsWith("COMPENSATION_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("employee-compensation API error", error);

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function parseBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new Error("COMPENSATION_INVALID_JSON");
  }
}

async function saveByKind(
  kind: CompensationKind,
  body: Record<string, unknown>,
  actor: ReturnType<typeof actorFromGuard>,
  termId?: string,
) {
  const common = {
    ...(termId ? { termId } : {}),
    employeeId: requiredString(
      body.employeeId,
      "COMPENSATION_EMPLOYEE_REQUIRED",
    ),
    effectiveFrom: requiredString(
      body.effectiveFrom,
      "COMPENSATION_EFFECTIVE_FROM_REQUIRED",
    ),
    effectiveTo: optionalString(body.effectiveTo),
    currency: optionalString(body.currency),
    notes: optionalString(body.notes),
    editReason: optionalString(body.editReason),
  };

  if (kind === "employee") {
    return saveEmployeeCompensationTerm(
      {
        ...common,
        fixedSalaryMinor: requiredInteger(
          body.fixedSalaryMinor,
          "COMPENSATION_INVALID_FIXED_SALARY_MINOR",
        ),
      },
      actor,
    );
  }

  if (kind === "coach") {
    return saveCoachCompensationTerm(
      {
        ...common,
        coachLevel: requiredString(
          body.coachLevel,
          "COMPENSATION_INVALID_COACH_LEVEL",
        ) as CoachCompensationLevel,
        defaultFixedClassMonthlyMinor: requiredInteger(
          body.defaultFixedClassMonthlyMinor,
          "COMPENSATION_INVALID_DEFAULT_FIXED_CLASS_MONTHLY_MINOR",
        ),
        traineeClassCommissionBps: requiredInteger(
          body.traineeClassCommissionBps,
          "COMPENSATION_INVALID_TRAINEE_CLASS_COMMISSION_BPS",
        ),
        privateSessionCommissionBps: requiredInteger(
          body.privateSessionCommissionBps,
          "COMPENSATION_INVALID_PRIVATE_SESSION_COMMISSION_BPS",
        ),
        coachMembershipCommissionBps: requiredInteger(
          body.coachMembershipCommissionBps,
          "COMPENSATION_INVALID_COACH_MEMBERSHIP_COMMISSION_BPS",
        ),
      },
      actor,
    );
  }

  return saveCoachClassCompensationTerm(
    {
      ...common,
      classId: requiredString(body.classId, "COMPENSATION_CLASS_REQUIRED"),
      monthlyAmountMinor: requiredInteger(
        body.monthlyAmountMinor,
        "COMPENSATION_INVALID_CLASS_MONTHLY_AMOUNT_MINOR",
      ),
    },
    actor,
  );
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminPermission("employee_compensation_view");

  if ("error" in guard) return guard.error;

  try {
    const url = new URL(req.url);

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    const classId = url.searchParams.get("classId")?.trim() || null;

    const employeeTerms = await db.employeeCompensationTerm.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
            employmentStatus: true,
            payrollEnabled: true,
          },
        },
      },
    });

    const coachTerms = await db.coachCompensationTerm.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
            trainerProfile: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    const coachClassTerms = await db.coachClassCompensationTerm.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(classId ? { classId } : {}),
      },
      orderBy: [
        { employeeId: "asc" },
        { classId: "asc" },
        { effectiveFrom: "desc" },
      ],
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
          },
        },
        class: {
          select: {
            id: true,
            name: true,
            trainerId: true,
          },
        },
      },
    });

    const compensationEmployees = await db.employeeProfile.findMany({
      orderBy: [{ employmentStatus: "asc" }, { employeeCode: "asc" }],
      select: {
        id: true,
        employeeCode: true,
        name: true,
        employmentStatus: true,
        payrollEnabled: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        position: {
          select: {
            id: true,
            name: true,
          },
        },
        trainerProfile: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    const classRows = await db.class.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        id: true,
        name: true,
        trainerId: true,
        trainer: {
          select: {
            id: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    const compensationClasses = classRows
      .filter((row) => Boolean(row.trainer.employeeId))
      .map((row) => ({
        id: row.id,
        name: row.name,
        trainerId: row.trainerId,
        trainerName: row.trainer.name,
        employeeId: row.trainer.employeeId,
      }));

    return NextResponse.json({
      employeeTerms,
      coachTerms,
      coachClassTerms,
      employees: compensationEmployees,
      classes: compensationClasses,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("employee_compensation_manage");

  if ("error" in guard) return guard.error;

  try {
    const body = (await parseBody(req)) as Record<string, unknown>;

    const kind = readKind(body.kind);

    if (body.termId != null) {
      throw new Error("COMPENSATION_CREATE_TERM_ID_NOT_ALLOWED");
    }

    const term = await saveByKind(kind, body, actorFromGuard(guard));

    return NextResponse.json(
      {
        kind,
        term,
      },
      { status: 201 },
    );
  } catch (error) {
    return mapError(error);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminPermission("employee_compensation_manage");

  if ("error" in guard) return guard.error;

  try {
    const body = (await parseBody(req)) as Record<string, unknown>;

    const kind = readKind(body.kind);

    const termId = requiredString(body.termId, "COMPENSATION_TERM_ID_REQUIRED");

    const term = await saveByKind(kind, body, actorFromGuard(guard), termId);

    return NextResponse.json({
      kind,
      term,
    });
  } catch (error) {
    return mapError(error);
  }
}
