import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import { finalizeCoachMembershipEarning } from "@/lib/employees/coach-membership-earning-service";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["calculated", "finalized"] as const;

type CoachMembershipEarningStatus = (typeof ALLOWED_STATUSES)[number];

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
    throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_JSON");
  }
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "COACH_MEMBERSHIP_EARNING_UNKNOWN_ERROR";

  if (message === "COACH_MEMBERSHIP_EARNING_NOT_FOUND") {
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (message === "COACH_MEMBERSHIP_EARNING_NOT_CALCULATED") {
    return NextResponse.json({ error: message }, { status: 409 });
  }

  if (message.startsWith("COACH_MEMBERSHIP_EARNING_")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  console.error("coach-membership-earnings API error", error);

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminPermission("coach_membership_earning_view");

  if ("error" in guard) {
    return (
      guard.error ??
      NextResponse.json(
        {
          error: "ADMIN_PERMISSION_GUARD_INVALID_RESPONSE",
        },
        { status: 500 },
      )
    );
  }

  try {
    const url = new URL(req.url);

    const month = url.searchParams.get("month")?.trim() || null;

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    const trainerId = url.searchParams.get("trainerId")?.trim() || null;

    const status = url.searchParams.get("status")?.trim() || null;

    const membershipId = url.searchParams.get("membershipId")?.trim() || null;

    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_MONTH");
    }

    let parsedStatus: CoachMembershipEarningStatus | null = null;

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as CoachMembershipEarningStatus)) {
        throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_STATUS");
      }

      parsedStatus = status as CoachMembershipEarningStatus;
    }

    const earnings = await db.coachMembershipEarning.findMany({
      where: {
        ...(month ? { monthKey: month } : {}),

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

        ...(membershipId
          ? {
              userMembershipId: membershipId,
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

  if (action !== "finalize") {
    return NextResponse.json(
      {
        error: "COACH_MEMBERSHIP_EARNING_INVALID_ACTION",
      },
      {
        status: 400,
      },
    );
  }

  const guard = await requireAdminPermission(
    "coach_membership_earning_finalize",
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
    const earning = await finalizeCoachMembershipEarning(
      {
        earningId: requiredString(
          body.earningId,
          "COACH_MEMBERSHIP_EARNING_ID_REQUIRED",
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
