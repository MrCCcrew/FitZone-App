import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";

import { db } from "@/lib/db";

import {
  calculatePayrollRun,
  finalizePayrollRun,
} from "@/lib/employees/payroll-run-service";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "draft",
  "blocked",
  "calculated",
  "finalized",
] as const;

type PayrollRunStatus = (typeof ALLOWED_STATUSES)[number];

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

function parseMonth(value: unknown) {
  const monthKey = requiredString(value, "PAYROLL_MONTH_REQUIRED");

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error("PAYROLL_INVALID_MONTH");
  }

  return monthKey;
}

async function parseBody(req: NextRequest) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new Error("PAYROLL_INVALID_JSON");
  }
}

function mapError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "PAYROLL_UNKNOWN_ERROR";

  if (message === "PAYROLL_RUN_NOT_FOUND") {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (
    message === "PAYROLL_RUN_FINALIZED_IMMUTABLE" ||
    message === "PAYROLL_RUN_NOT_FINALIZABLE" ||
    message === "PAYROLL_RUN_HAS_BLOCKED_EMPLOYEE" ||
    message === "PAYROLL_RUN_SOURCE_SNAPSHOT_STALE"
  ) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (message.startsWith("PAYROLL_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("payroll-runs API error", error);

  return NextResponse.json(
    {
      error: "Internal server error",
    },
    {
      status: 500,
    },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminPermission("payroll_run_view");

  if ("error" in guard) {
    return (
      guard.error ??
      NextResponse.json(
        {
          error: "ADMIN_PERMISSION_GUARD_INVALID_RESPONSE",
        },
        {
          status: 500,
        },
      )
    );
  }

  try {
    const url = new URL(req.url);

    const month = url.searchParams.get("month")?.trim() || null;

    const status = url.searchParams.get("status")?.trim() || null;

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("PAYROLL_INVALID_MONTH");
    }

    let parsedStatus: PayrollRunStatus | null = null;

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as PayrollRunStatus)) {
        throw new Error("PAYROLL_INVALID_STATUS");
      }

      parsedStatus = status as PayrollRunStatus;
    }

    const runs = await db.payrollRun.findMany({
      where: {
        ...(month
          ? {
              monthKey: month,
            }
          : {}),

        ...(parsedStatus
          ? {
              status: parsedStatus,
            }
          : {}),

        ...(employeeId
          ? {
              employees: {
                some: {
                  employeeId,
                },
              },
            }
          : {}),
      },

      include: {
        employees: {
          where: employeeId
            ? {
                employeeId,
              }
            : undefined,

          include: {
            items: {
              orderBy: [
                {
                  direction: "asc",
                },
                {
                  sourceType: "asc",
                },
                {
                  createdAt: "asc",
                },
              ],
            },

            employee: {
              select: {
                id: true,
                employeeCode: true,
                name: true,
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
          },

          orderBy: {
            employeeCodeSnapshot: "asc",
          },
        },
      },

      orderBy: {
        monthKey: "desc",
      },
    });

    return NextResponse.json({
      runs,
    });
  } catch (error) {
    return mapError(error);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;

  try {
    body = await parseBody(req);
  } catch (error) {
    return mapError(error);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "calculate") {
    const guard = await requireAdminPermission("payroll_run_calculate");

    if ("error" in guard) {
      return (
        guard.error ??
        NextResponse.json(
          {
            error: "ADMIN_PERMISSION_GUARD_INVALID_RESPONSE",
          },
          {
            status: 500,
          },
        )
      );
    }

    try {
      const run = await calculatePayrollRun(
        parseMonth(body.monthKey),
        actorFromGuard(guard),
      );

      return NextResponse.json({
        run,
      });
    } catch (error) {
      return mapError(error);
    }
  }

  if (action === "finalize") {
    const guard = await requireAdminPermission("payroll_run_finalize");

    if ("error" in guard) {
      return (
        guard.error ??
        NextResponse.json(
          {
            error: "ADMIN_PERMISSION_GUARD_INVALID_RESPONSE",
          },
          {
            status: 500,
          },
        )
      );
    }

    try {
      const run = await finalizePayrollRun(
        parseMonth(body.monthKey),
        actorFromGuard(guard),
      );

      return NextResponse.json({
        run,
      });
    } catch (error) {
      return mapError(error);
    }
  }

  return NextResponse.json(
    {
      error: "PAYROLL_INVALID_ACTION",
    },
    {
      status: 400,
    },
  );
}
