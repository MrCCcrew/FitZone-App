import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { asDbTransactionClient, db } from "@/lib/db";
import { savePositionPayrollPolicyTx } from "@/lib/employees/position-payroll-policy-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, code: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(code);
  }

  return value.trim();
}

function optionalString(value: unknown) {
  if (value == null) return null;

  if (typeof value !== "string") {
    throw new Error("POSITION_PAYROLL_POLICY_INVALID_STRING");
  }

  return value.trim() || null;
}

function optionalInteger(value: unknown, code: string) {
  if (value == null) return null;

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    throw new Error(code);
  }

  return value;
}

function optionalBoolean(value: unknown) {
  if (value == null) return undefined;

  if (typeof value !== "boolean") {
    throw new Error(
      "POSITION_PAYROLL_POLICY_INVALID_ACTIVE_FLAG",
    );
  }

  return value;
}

function dateKey(value: Date | null) {
  return value
    ? value.toISOString().slice(0, 10)
    : null;
}

function serializePolicy<
  T extends {
    effectiveFrom: Date;
    effectiveTo: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
>(row: T) {
  return {
    ...row,
    effectiveFrom: dateKey(row.effectiveFrom),
    effectiveTo: dateKey(row.effectiveTo),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function actorId(guard: {
  session: {
    id?: string;
    user?: {
      id?: string;
    };
  };
}) {
  return (
    guard.session.user?.id ??
    guard.session.id ??
    null
  );
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "POSITION_PAYROLL_POLICY_UNKNOWN_ERROR";

  if (
    message ===
    "POSITION_PAYROLL_POLICY_POSITION_NOT_FOUND"
  ) {
    return NextResponse.json(
      { error: message },
      { status: 404 },
    );
  }

  if (
    message ===
    "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP"
  ) {
    return NextResponse.json(
      { error: message },
      { status: 409 },
    );
  }

  if (
    message.startsWith(
      "POSITION_PAYROLL_POLICY_",
    )
  ) {
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }

  console.error(
    "payroll settings API error",
    error,
  );

  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}

export async function GET() {
  const guard = await requireAdminPermission(
    "employee_compensation_view",
  );

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const positions = await db.position.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
      ],

      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        isActive: true,

        payrollPolicies: {
          orderBy: {
            effectiveFrom: "desc",
          },
        },
      },
    });

    return NextResponse.json({
      positions: positions.map((position) => ({
        id: position.id,
        code: position.code,
        name: position.name,
        nameEn: position.nameEn,
        isActive: position.isActive,

        policies:
          position.payrollPolicies.map(
            serializePolicy,
          ),
      })),
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(
  req: NextRequest,
) {
  const guard = await requireAdminPermission(
    "employee_compensation_manage",
  );

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const body =
      (await req.json()) as Record<
        string,
        unknown
      >;

    const policy = await db.$transaction(
      async (tx) =>
        savePositionPayrollPolicyTx(asDbTransactionClient(tx), {
          positionId: requiredString(
            body.positionId,
            "POSITION_PAYROLL_POLICY_POSITION_REQUIRED",
          ),

          effectiveFrom: requiredString(
            body.effectiveFrom,
            "POSITION_PAYROLL_POLICY_EFFECTIVE_FROM_REQUIRED",
          ),

          effectiveTo: optionalString(
            body.effectiveTo,
          ),

          fixedSalaryMinor: optionalInteger(
            body.fixedSalaryMinor,
            "POSITION_PAYROLL_POLICY_INVALID_FIXED_SALARY_MINOR",
          ),

          defaultFixedClassMonthlyMinor:
            optionalInteger(
              body.defaultFixedClassMonthlyMinor,
              "POSITION_PAYROLL_POLICY_INVALID_DEFAULT_FIXED_CLASS_MONTHLY_MINOR",
            ),

          traineeClassCommissionBps:
            optionalInteger(
              body.traineeClassCommissionBps,
              "POSITION_PAYROLL_POLICY_INVALID_TRAINEE_CLASS_COMMISSION_BPS",
            ),

          privateSessionCommissionBps:
            optionalInteger(
              body.privateSessionCommissionBps,
              "POSITION_PAYROLL_POLICY_INVALID_PRIVATE_SESSION_COMMISSION_BPS",
            ),

          coachMembershipCommissionBps:
            optionalInteger(
              body.coachMembershipCommissionBps,
              "POSITION_PAYROLL_POLICY_INVALID_COACH_MEMBERSHIP_COMMISSION_BPS",
            ),

          headCoachMonthlyBaseMinutes:
            optionalInteger(
              body.headCoachMonthlyBaseMinutes,
              "POSITION_PAYROLL_POLICY_INVALID_HEAD_COACH_MONTHLY_BASE_MINUTES",
            ),

          headCoachWeeklyMinMinutes:
            optionalInteger(
              body.headCoachWeeklyMinMinutes,
              "POSITION_PAYROLL_POLICY_INVALID_HEAD_COACH_WEEKLY_MIN_MINUTES",
            ),

          headCoachWeeklyCapMinutes:
            optionalInteger(
              body.headCoachWeeklyCapMinutes,
              "POSITION_PAYROLL_POLICY_INVALID_HEAD_COACH_WEEKLY_CAP_MINUTES",
            ),

          currency:
            optionalString(body.currency) ??
            "EGP",

          isActive:
            optionalBoolean(body.isActive) ??
            true,

          notes: optionalString(body.notes),

          createdById: actorId(guard),
        }),
    );

    return NextResponse.json(
      {
        policy: serializePolicy(policy),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return mapError(error);
  }
}
