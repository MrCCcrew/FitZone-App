import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import {
  calculateFixedClassEarning,
  finalizeFixedClassEarning,
} from "@/lib/employees/fixed-class-earning-service";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = [
  "draft",
  "blocked",
  "calculated",
  "finalized",
] as const;

type FixedClassEarningStatus = (typeof ALLOWED_STATUSES)[number];

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
  const month = requiredString(value, "FIXED_CLASS_EARNING_MONTH_REQUIRED");

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("FIXED_CLASS_EARNING_INVALID_MONTH");
  }

  return month;
}

async function parseBody(req: NextRequest) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new Error("FIXED_CLASS_EARNING_INVALID_JSON");
  }
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "FIXED_CLASS_EARNING_UNKNOWN_ERROR";

  if (
    message === "FIXED_CLASS_EARNING_NOT_FOUND" ||
    message === "FIXED_CLASS_EARNING_EMPLOYEE_NOT_FOUND" ||
    message === "FIXED_CLASS_EARNING_CLASS_NOT_FOUND"
  ) {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (
    message === "FIXED_CLASS_EARNING_FINALIZED" ||
    message === "FIXED_CLASS_EARNING_NOT_CALCULATED"
  ) {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (message.startsWith("FIXED_CLASS_EARNING_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("fixed-class-earnings API error", error);

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminPermission("fixed_class_earning_view");

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

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    const classId = url.searchParams.get("classId")?.trim() || null;

    const status = url.searchParams.get("status")?.trim() || null;

    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("FIXED_CLASS_EARNING_INVALID_MONTH");
    }

    let parsedStatus: FixedClassEarningStatus | null = null;

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as FixedClassEarningStatus)) {
        throw new Error("FIXED_CLASS_EARNING_INVALID_STATUS");
      }

      parsedStatus = status as FixedClassEarningStatus;
    }

    const earnings = await db.fixedClassEarning.findMany({
      where: {
        ...(month ? { monthKey: month } : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(classId ? { classId } : {}),
        ...(parsedStatus ? { status: parsedStatus } : {}),
      },
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
          },
        },
        calculatedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        finalizedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        occurrences: {
          orderBy: [
            {
              occurrenceDate: "asc",
            },
            {
              occurrenceTime: "asc",
            },
          ],
        },
      },
      orderBy: [
        {
          monthKey: "desc",
        },
        {
          employeeId: "asc",
        },
        {
          classId: "asc",
        },
      ],
    });

    return NextResponse.json({
      earnings,
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
    const guard = await requireAdminPermission("fixed_class_earning_calculate");

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
      const earning = await calculateFixedClassEarning(
        {
          monthKey: parseMonth(body.monthKey),
          employeeId: requiredString(
            body.employeeId,
            "FIXED_CLASS_EARNING_EMPLOYEE_REQUIRED",
          ),
          classId: requiredString(
            body.classId,
            "FIXED_CLASS_EARNING_CLASS_REQUIRED",
          ),
        },
        actorFromGuard(guard),
      );

      return NextResponse.json({
        action,
        earning,
      });
    } catch (error) {
      return mapError(error);
    }
  }

  if (action === "finalize") {
    const guard = await requireAdminPermission("fixed_class_earning_finalize");

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
      const earning = await finalizeFixedClassEarning(
        {
          earningId: requiredString(
            body.earningId,
            "FIXED_CLASS_EARNING_ID_REQUIRED",
          ),
        },
        actorFromGuard(guard),
      );

      return NextResponse.json({
        action,
        earning,
      });
    } catch (error) {
      return mapError(error);
    }
  }

  return NextResponse.json(
    {
      error: "FIXED_CLASS_EARNING_INVALID_ACTION",
    },
    {
      status: 400,
    },
  );
}
