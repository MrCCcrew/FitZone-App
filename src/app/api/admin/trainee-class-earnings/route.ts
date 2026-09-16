import { NextRequest, NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import {
  calculateTraineeClassEarning,
  finalizeTraineeClassEarning,
} from "@/lib/employees/trainee-class-earning-service";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["blocked", "calculated", "finalized"] as const;

type TraineeClassEarningStatus = (typeof ALLOWED_STATUSES)[number];

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
    throw new Error("TRAINEE_CLASS_EARNING_INVALID_JSON");
  }
}

function mapError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "TRAINEE_CLASS_EARNING_UNKNOWN_ERROR";

  if (
    message === "TRAINEE_CLASS_EARNING_NOT_FOUND" ||
    message === "TRAINEE_CLASS_EARNING_ATTENDANCE_NOT_FOUND"
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
    message === "TRAINEE_CLASS_EARNING_FINALIZED" ||
    message === "TRAINEE_CLASS_EARNING_NOT_CALCULATED"
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

  if (message.startsWith("TRAINEE_CLASS_EARNING_")) {
    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 400,
      },
    );
  }

  console.error("trainee-class-earnings API error", error);

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
  const guard = await requireAdminPermission("trainee_class_earning_view");

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

    const includeAttendanceCandidates =
      url.searchParams.get("includeAttendanceCandidates") === "1";

    const employeeId = url.searchParams.get("employeeId")?.trim() || null;

    const status = url.searchParams.get("status")?.trim() || null;

    const membershipId = url.searchParams.get("membershipId")?.trim() || null;

    const bookingId = url.searchParams.get("bookingId")?.trim() || null;

    const scheduleId = url.searchParams.get("scheduleId")?.trim() || null;

    if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error("TRAINEE_CLASS_EARNING_INVALID_MONTH");
    }

    if (includeAttendanceCandidates) {
      let monthStart: Date | null = null;
      let nextMonthStart: Date | null = null;

      if (month) {
        const [yearText, monthText] = month.split("-");
        const year = Number(yearText);
        const monthIndex = Number(monthText) - 1;

        monthStart = new Date(Date.UTC(year, monthIndex, 1));
        nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1));
      }

      const checkIns = await db.attendanceCheckIn.findMany({
        where: {
          checkInType: "class",
          bookingId: {
            not: null,
          },
          ...(monthStart && nextMonthStart
            ? {
                booking: {
                  is: {
                    schedule: {
                      date: {
                        gte: monthStart,
                        lt: nextMonthStart,
                      },
                    },
                  },
                },
              }
            : {}),
        },

        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },

          userMembership: {
            select: {
              id: true,
            },
          },

          booking: {
            include: {
              schedule: {
                include: {
                  class: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },

        take: 300,
      });

      const scheduleIds = Array.from(
        new Set(
          checkIns
            .map((checkIn) => checkIn.booking?.schedule?.id)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const attendanceIds = checkIns.map((checkIn) => checkIn.id);

      const [coachAttendances, existingEarnings] = await Promise.all([
        scheduleIds.length
          ? db.coachClassAttendance.findMany({
              where: {
                scheduleId: {
                  in: scheduleIds,
                },
              },

              select: {
                scheduleId: true,
                status: true,
                actualTrainerId: true,
                actualTrainerNameSnapshot: true,
                actualEmployeeId: true,
                actualEmployeeCodeSnapshot: true,
                actualEmployeeNameSnapshot: true,
              },
            })
          : Promise.resolve([]),

        attendanceIds.length
          ? db.traineeClassEarning.findMany({
              where: {
                attendanceCheckInId: {
                  in: attendanceIds,
                },
              },

              select: {
                attendanceCheckInId: true,
                status: true,
                blockReason: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const coachAttendanceByScheduleId = new Map(
        coachAttendances.map((row) => [row.scheduleId, row]),
      );

      const earningByAttendanceId = new Map(
        existingEarnings.map((row) => [row.attendanceCheckInId, row]),
      );

      const attendanceCandidates = checkIns
        .filter((checkIn) => Boolean(checkIn.booking))
        .map((checkIn) => {
          const booking = checkIn.booking!;
          const schedule = booking.schedule;
          const coachAttendance = coachAttendanceByScheduleId.get(schedule.id);
          const existingEarning = earningByAttendanceId.get(checkIn.id);

          let readiness:
            | "ready"
            | "already_calculated"
            | "finalized"
            | "blocked"
            | "coach_attendance_missing"
            | "coach_not_payable"
            | "membership_missing"
            | "membership_mismatch";

          if (existingEarning?.status === "finalized") {
            readiness = "finalized";
          } else if (existingEarning?.status === "calculated") {
            readiness = "already_calculated";
          } else if (existingEarning?.status === "blocked") {
            readiness = "blocked";
          } else if (!checkIn.userMembership || !checkIn.userMembershipId) {
            readiness = "membership_missing";
          } else if (
            booking.userMembershipId !== checkIn.userMembershipId
          ) {
            readiness = "membership_mismatch";
          } else if (!coachAttendance) {
            readiness = "coach_attendance_missing";
          } else if (
            !["present", "substitute"].includes(coachAttendance.status) ||
            !coachAttendance.actualTrainerId ||
            !coachAttendance.actualEmployeeId
          ) {
            readiness = "coach_not_payable";
          } else {
            readiness = "ready";
          }

          return {
            id: checkIn.id,
            createdAt: checkIn.createdAt.toISOString(),

            customerId: checkIn.user.id,
            customerName: checkIn.user.name ?? "بدون اسم",

            bookingId: checkIn.bookingId,
            scheduleId: schedule.id,
            scheduleDate: schedule.date.toISOString(),
            scheduleTime: schedule.time,

            classId: schedule.class.id,
            className: schedule.class.name,

            actualTrainerName:
              coachAttendance?.actualTrainerNameSnapshot ?? null,

            actualEmployeeCode:
              coachAttendance?.actualEmployeeCodeSnapshot ?? null,

            actualEmployeeName:
              coachAttendance?.actualEmployeeNameSnapshot ?? null,

            coachAttendanceStatus:
              coachAttendance?.status ?? null,

            earningStatus:
              existingEarning?.status ?? null,

            blockReason:
              existingEarning?.blockReason ?? null,

            readiness,
          };
        });

      return NextResponse.json({
        attendanceCandidates,
      });
    }

    let parsedStatus: TraineeClassEarningStatus | null = null;

    if (status) {
      if (!ALLOWED_STATUSES.includes(status as TraineeClassEarningStatus)) {
        throw new Error("TRAINEE_CLASS_EARNING_INVALID_STATUS");
      }

      parsedStatus = status as TraineeClassEarningStatus;
    }

    const earnings = await db.traineeClassEarning.findMany({
      where: {
        ...(month
          ? {
              monthKey: month,
            }
          : {}),
        ...(employeeId
          ? {
              actualEmployeeId: employeeId,
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
        ...(bookingId
          ? {
              bookingId,
            }
          : {}),
        ...(scheduleId
          ? {
              scheduleId,
            }
          : {}),
      },

      orderBy: [
        {
          attendanceDate: "desc",
        },
        {
          attendanceTime: "desc",
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

  if (action === "calculate") {
    const guard = await requireAdminPermission(
      "trainee_class_earning_calculate",
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
      const earning = await calculateTraineeClassEarning(
        {
          attendanceCheckInId: requiredString(
            body.attendanceCheckInId,
            "TRAINEE_CLASS_EARNING_ATTENDANCE_REQUIRED",
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
    const guard = await requireAdminPermission(
      "trainee_class_earning_finalize",
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
      const earning = await finalizeTraineeClassEarning(
        {
          earningId: requiredString(
            body.earningId,
            "TRAINEE_CLASS_EARNING_ID_REQUIRED",
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
      error: "TRAINEE_CLASS_EARNING_INVALID_ACTION",
    },
    {
      status: 400,
    },
  );
}
