import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import {
  applyRetroactiveMembershipAttendance,
  listRetroactiveAttendanceCandidates,
  RetroactiveAttendanceError,
} from "@/lib/retroactive-membership-attendance";
import { logAudit } from "@/lib/audit-context";

function errorStatus(
  error: RetroactiveAttendanceError,
) {
  switch (error.code) {
    case "MEMBERSHIP_NOT_FOUND":
    case "SCHEDULE_NOT_FOUND":
      return 404;

    case "BOOKING_ALREADY_LINKED":
    case "TIME_CONFLICT":
    case "PAST_SESSION_FULL":
    case "NOT_ENOUGH_FUTURE_BOOKINGS":
    case "MEMBERSHIP_CHANGED":
      return 409;

    default:
      return 400;
  }
}

export async function GET(
  req: Request,
) {
  const guard =
    await requireAdminPermission(
      "manual_attendance",
    );

  if ("error" in guard) {
    return guard.error;
  }

  if (guard.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "هذه العملية متاحة للمدير فقط.",
      },
      {
        status: 403,
      },
    );
  }

  const url =
    new URL(req.url);

  const userMembershipId =
    url.searchParams.get(
      "userMembershipId",
    )?.trim();

  if (!userMembershipId) {
    return NextResponse.json(
      {
        error:
          "معرّف الاشتراك مطلوب.",
      },
      {
        status: 400,
      },
    );
  }

  const days =
    Number(
      url.searchParams.get(
        "days",
      ) ?? 120,
    );

  try {
    const result =
      await listRetroactiveAttendanceCandidates(
        {
          userMembershipId,
          days,
        },
      );

    return NextResponse.json(
      result,
    );
  } catch (error) {
    if (
      error instanceof
      RetroactiveAttendanceError
    ) {
      return NextResponse.json(
        {
          error:
            error.message,
          code:
            error.code,
        },
        {
          status:
            errorStatus(error),
        },
      );
    }

    console.error(
      "[RETROACTIVE_ATTENDANCE_GET]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر تحميل الحصص السابقة.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  req: Request,
) {
  const guard =
    await requireAdminPermission(
      "manual_attendance",
    );

  if ("error" in guard) {
    return guard.error;
  }

  if (guard.role !== "admin") {
    return NextResponse.json(
      {
        error:
          "هذه العملية متاحة للمدير فقط.",
      },
      {
        status: 403,
      },
    );
  }

  const body =
    (await req
      .json()
      .catch(() => ({}))) as {
      userMembershipId?: string;
      scheduleIds?: string[];
    };

  const userMembershipId =
    String(
      body.userMembershipId ??
        "",
    ).trim();

  if (!userMembershipId) {
    return NextResponse.json(
      {
        error:
          "معرّف الاشتراك مطلوب.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !Array.isArray(
      body.scheduleIds,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "يجب اختيار الحصص السابقة.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const result =
      await applyRetroactiveMembershipAttendance(
        {
          userMembershipId,
          scheduleIds:
            body.scheduleIds,
          adminUserId:
            guard.session.id,
        },
      );

    await logAudit({
      action:
        "retroactive_attendance",
      targetType:
        "userMembership",
      targetId:
        userMembershipId,
      details: {
        customerUserId:
          result.userId,
        scheduleIds:
          result.scheduleIds,
        checkInIds:
          result.checkInIds,
        createdBookingIds:
          result.createdBookingIds,
        reusedBookingIds:
          result.reusedBookingIds,
        cancelledFutureBookingIds:
          result.cancelledFutureBookingIds,
        addedAttendanceCount:
          result.addedAttendanceCount,
        sessionsUsed:
          result.sessionsUsed,
        sessionsRemaining:
          result.sessionsRemaining,
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (
      error instanceof
      RetroactiveAttendanceError
    ) {
      return NextResponse.json(
        {
          error:
            error.message,
          code:
            error.code,
        },
        {
          status:
            errorStatus(error),
        },
      );
    }

    console.error(
      "[RETROACTIVE_ATTENDANCE_POST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر احتساب الحضور السابق.",
      },
      {
        status: 500,
      },
    );
  }
}