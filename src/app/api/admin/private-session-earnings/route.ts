import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { asDbTransactionClient, db } from "@/lib/db";
import {
  accruePrivateSessionEarningTx,
  finalizePrivateSessionEarning,
} from "@/lib/employees/private-session-earning-service";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["blocked", "calculated", "finalized"] as const;

type PrivateSessionEarningStatus = (typeof ALLOWED_STATUSES)[number];

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

    name: guard.session.user?.name ?? guard.session.name ?? "",

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

async function parseBody(req: NextRequest) {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new Error("PRIVATE_SESSION_EARNING_INVALID_JSON");
  }
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "PRIVATE_SESSION_EARNING_UNKNOWN_ERROR";

  if (
    message === "PRIVATE_SESSION_EARNING_NOT_FOUND" ||
    message === "PRIVATE_SESSION_EARNING_APPLICATION_NOT_FOUND"
  ) {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (message === "PRIVATE_SESSION_EARNING_NOT_CALCULATED") {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (message.startsWith("PRIVATE_SESSION_EARNING_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("private-session-earnings API error", error);

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
  const guard = await requireAdminPermission("private_session_earning_view");

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

    const trainerId = url.searchParams.get("trainerId")?.trim() || null;

    const status = url.searchParams.get("status")?.trim() || null;

    const applicationId = url.searchParams.get("applicationId")?.trim() || null;

    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("PRIVATE_SESSION_EARNING_INVALID_MONTH");
    }

    let parsedStatus: PrivateSessionEarningStatus | null = null;

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as PrivateSessionEarningStatus)) {
        throw new Error("PRIVATE_SESSION_EARNING_INVALID_STATUS");
      }

      parsedStatus = status as PrivateSessionEarningStatus;
    }

    const earnings = await db.privateSessionEarning.findMany({
      where: {
        ...(month
          ? {
              monthKey: month,
            }
          : {}),

        ...(employeeId
          ? {
              employeeIdSnapshot: employeeId,
            }
          : {}),

        ...(trainerId
          ? {
              trainerIdSnapshot: trainerId,
            }
          : {}),

        ...(parsedStatus
          ? {
              status: parsedStatus,
            }
          : {}),

        ...(applicationId
          ? {
              privateSessionApplicationId: applicationId,
            }
          : {}),
      },

      orderBy: [
        {
          calculatedAt: "desc",
        },
        {
          createdAt: "desc",
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

  if (action !== "calculate" && action !== "finalize") {
    return NextResponse.json(
      {
        error: "PRIVATE_SESSION_EARNING_INVALID_ACTION",
      },
      {
        status: 400,
      },
    );
  }

  if (action === "calculate") {
    const guard = await requireAdminPermission(
      "private_session_earning_calculate",
    );

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
      const earningId = requiredString(
        body.earningId,
        "PRIVATE_SESSION_EARNING_ID_REQUIRED",
      );

      const existing = await db.privateSessionEarning.findUnique({
        where: {
          id: earningId,
        },
        select: {
          id: true,
          status: true,
          privateSessionApplicationId: true,
        },
      });

      if (!existing) {
        throw new Error("PRIVATE_SESSION_EARNING_NOT_FOUND");
      }

      if (existing.status === "finalized") {
        throw new Error("PRIVATE_SESSION_EARNING_ALREADY_FINALIZED");
      }

      /*
       * No amount/rate/employee is accepted from the browser.
       * Recalculation uses only the authoritative paid source
       * and effective-dated HR configuration.
       */
      const earning = await db.$transaction(async (tx) =>
        accruePrivateSessionEarningTx(asDbTransactionClient(tx), {
          privateSessionApplicationId: existing.privateSessionApplicationId,
        }),
      );

      return NextResponse.json({
        action,
        earning,
      });
    } catch (error) {
      return mapError(error);
    }
  }

  const guard = await requireAdminPermission(
    "private_session_earning_finalize",
  );

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
    const earning = await finalizePrivateSessionEarning(
      {
        earningId: requiredString(
          body.earningId,
          "PRIVATE_SESSION_EARNING_ID_REQUIRED",
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
