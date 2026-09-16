import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import {
  listPayrollEligibilityTerms,
  savePayrollEligibilityTerm,
} from "@/lib/employees/payroll-eligibility-service";

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

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(code);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function requiredBoolean(value: unknown) {
  if (typeof value !== "boolean") {
    throw new Error("PAYROLL_ELIGIBILITY_ENABLED_REQUIRED");
  }

  return value;
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "PAYROLL_ELIGIBILITY_UNKNOWN_ERROR";

  if (
    message === "PAYROLL_ELIGIBILITY_EMPLOYEE_NOT_FOUND" ||
    message === "PAYROLL_ELIGIBILITY_TERM_NOT_FOUND"
  ) {
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 404,
      },
    );
  }

  if (
    message === "PAYROLL_ELIGIBILITY_TERM_OVERLAP" ||
    message === "PAYROLL_ELIGIBILITY_TERM_EMPLOYEE_IMMUTABLE"
  ) {
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 409,
      },
    );
  }

  if (message.startsWith("PAYROLL_ELIGIBILITY_")) {
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
      },
    );
  }

  console.error("payroll eligibility API error", error);

  return NextResponse.json(
    {
      error: "Internal server error",
    },
    {
      status: 500,
    },
  );
}

async function parseBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    throw new Error("PAYROLL_ELIGIBILITY_INVALID_JSON");
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdminPermission("payroll_eligibility_view");

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const url = new URL(req.url);

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    const [terms, employees] = await Promise.all([
      listPayrollEligibilityTerms(employeeId),

      db.employeeProfile.findMany({
        orderBy: [
          {
            employmentStatus: "asc",
          },
          {
            employeeCode: "asc",
          },
        ],

        select: {
          id: true,
          employeeCode: true,
          name: true,
          employmentStatus: true,
          payrollEnabled: true,
          hireDate: true,
          employmentEndDate: true,
        },
      }),
    ]);

    return NextResponse.json({
      terms,
      employees,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminPermission("payroll_eligibility_manage");

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const body = (await parseBody(req)) as Record<string, unknown>;

    if (body.termId != null) {
      throw new Error("PAYROLL_ELIGIBILITY_CREATE_TERM_ID_NOT_ALLOWED");
    }

    const term = await savePayrollEligibilityTerm(
      {
        employeeId: requiredString(
          body.employeeId,
          "PAYROLL_ELIGIBILITY_EMPLOYEE_REQUIRED",
        ),

        effectiveFrom: requiredString(
          body.effectiveFrom,
          "PAYROLL_ELIGIBILITY_EFFECTIVE_FROM_REQUIRED",
        ),

        effectiveTo: optionalString(body.effectiveTo),

        enabled: requiredBoolean(body.enabled),

        notes: optionalString(body.notes),
      },

      actorFromGuard(guard),
    );

    return NextResponse.json(
      {
        term,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return mapError(error);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminPermission("payroll_eligibility_manage");

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const body = (await parseBody(req)) as Record<string, unknown>;

    const termId = requiredString(
      body.termId,
      "PAYROLL_ELIGIBILITY_TERM_ID_REQUIRED",
    );

    const term = await savePayrollEligibilityTerm(
      {
        termId,

        employeeId: requiredString(
          body.employeeId,
          "PAYROLL_ELIGIBILITY_EMPLOYEE_REQUIRED",
        ),

        effectiveFrom: requiredString(
          body.effectiveFrom,
          "PAYROLL_ELIGIBILITY_EFFECTIVE_FROM_REQUIRED",
        ),

        effectiveTo: optionalString(body.effectiveTo),

        enabled: requiredBoolean(body.enabled),

        notes: optionalString(body.notes),

        editReason: optionalString(body.editReason),
      },

      actorFromGuard(guard),
    );

    return NextResponse.json({
      term,
    });
  } catch (error) {
    return mapError(error);
  }
}
