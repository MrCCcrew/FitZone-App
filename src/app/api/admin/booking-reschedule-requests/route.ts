import {
  BookingRescheduleDomainError,
  reviewBookingRescheduleRequest,
} from "@/lib/booking-reschedule-service";
import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

export async function GET(req: Request) {
  const guard = await requireAdminPermission("bookings_view");
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const archivedOnly = url.searchParams.get("archived") === "1";

  const requests = await db.bookingRescheduleRequest.findMany({
    where: archivedOnly
      ? { archivedAt: { not: null } }
      : { archivedAt: null },
    include: {
      booking: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          schedule: {
            include: {
              class: {
                include: {
                  trainer: true,
                },
              },
            },
          },
          userMembership: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
      targetSchedule: {
        include: {
          class: {
            include: {
              trainer: true,
            },
          },
        },
      },
    },
    orderBy: { requestedAt: "desc" },
  });

  const reviewerIds = Array.from(
    new Set(
      requests
        .map((request) => request.reviewedByUserId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const reviewers = reviewerIds.length
    ? await db.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const reviewerMap = new Map(
    reviewers.map((reviewer) => [
      reviewer.id,
      reviewer.name || reviewer.email || reviewer.id,
    ]),
  );

  return NextResponse.json(
    requests.map((request) => ({
      id: request.id,
      status: request.status,
      requestType: request.requestType,
      absenceReason: request.absenceReason,
      requestedAt: request.requestedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: request.reviewedByUserId,
      reviewedByName: request.reviewedByUserId
        ? reviewerMap.get(request.reviewedByUserId) ?? request.reviewedByUserId
        : null,
      rejectionReason: request.rejectionReason,
      archivedAt: request.archivedAt?.toISOString() ?? null,
      archivedByUserId: request.archivedByUserId,

      booking: {
        id: request.booking.id,
        status: request.booking.status,
        userMembershipId: request.booking.userMembershipId,
        userMembershipStatus:
          request.booking.userMembership?.status ?? null,

        user: request.booking.user,

        currentSchedule: {
          id: request.booking.schedule.id,
          date: request.booking.schedule.date.toISOString(),
          time: request.booking.schedule.time,
          availableSpots: request.booking.schedule.availableSpots,
          class: {
            id: request.booking.schedule.class.id,
            name: request.booking.schedule.class.name,
            trainer:
              request.booking.schedule.class.trainer?.name ?? "",
          },
        },
      },

      targetSchedule: {
        id: request.targetSchedule.id,
        date: request.targetSchedule.date.toISOString(),
        time: request.targetSchedule.time,
        availableSpots: request.targetSchedule.availableSpots,
        isActive: request.targetSchedule.isActive,
        class: {
          id: request.targetSchedule.class.id,
          name: request.targetSchedule.class.name,
          trainer: request.targetSchedule.class.trainer?.name ?? "",
        },
      },
    })),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function PATCH(req: Request) {
  const guard =
    await requireAdminPermission(
      "bookings_reschedule",
    );

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const payload =
      (await req.json()) as {
        requestId?: string;
        decision?:
          | "approve"
          | "reject";
        rejectionReason?: string;
        action?:
          | "archive"
          | "restore";
      };

    if (!payload.requestId) {
      return NextResponse.json(
        {
          error:
            "طلب تغيير الموعد غير محدد.",
        },
        { status: 400 },
      );
    }

    // ─────────────────────────────────────────────────────────
    // Archive / restore is preserved as its existing
    // administrative metadata action.
    // ─────────────────────────────────────────────────────────
    if (
      payload.action === "archive" ||
      payload.action === "restore"
    ) {
      const existing =
        await db.bookingRescheduleRequest.findUnique(
          {
            where: {
              id: payload.requestId,
            },
            select: {
              id: true,
              status: true,
              archivedAt: true,
              bookingId: true,
            },
          },
        );

      if (!existing) {
        return NextResponse.json(
          {
            error:
              "طلب تغيير الموعد غير موجود.",
          },
          { status: 404 },
        );
      }

      if (existing.status === "pending") {
        return NextResponse.json(
          {
            error:
              "لا يمكن أرشفة طلب ما زال قيد المراجعة.",
          },
          { status: 409 },
        );
      }

      const archive =
        payload.action === "archive";

      await db.bookingRescheduleRequest.update({
        where: {
          id: existing.id,
        },
        data: archive
          ? {
              archivedAt: new Date(),
              archivedByUserId:
                guard.session.id,
            }
          : {
              archivedAt: null,
              archivedByUserId: null,
            },
      });

      void logAudit({
        action: archive
          ? "archive_reschedule_request"
          : "restore_reschedule_request",
        targetType: "booking",
        targetId:
          existing.bookingId,
        details: {
          requestId: existing.id,
        },
      });

      return NextResponse.json({
        success: true,
        archived: archive,
      });
    }

    if (!payload.decision) {
      return NextResponse.json(
        {
          error:
            "قرار مراجعة الطلب غير محدد.",
        },
        { status: 400 },
      );
    }

    const result =
      await reviewBookingRescheduleRequest({
        requestId: payload.requestId,
        decision: payload.decision,
        reviewedByUserId:
          guard.session.id,
        rejectionReason:
          payload.rejectionReason,
      });

    if (result.decision === "rejected") {
      void logAudit({
        action:
          "reject_reschedule_request",
        targetType: "booking",
        targetId:
          result.bookingId,
        details: {
          requestId:
            result.requestId,
        },
      });

      // Preserve the previous HTTP contract.
      return NextResponse.json({
        success: true,
      });
    }

    void logAudit({
      action:
        "approve_reschedule_request",
      targetType: "booking",
      targetId:
        result.bookingId,
      details: {
        requestId:
          result.requestId,
        scheduleId:
          result.scheduleId,
      },
    });

    // Preserve the previous HTTP contract:
    // do not expose the internal "decision" field.
    return NextResponse.json({
      success: true,
      bookingId:
        result.bookingId,
      makeupBookingId:
        result.makeupBookingId,
      requestId:
        result.requestId,
      scheduleId:
        result.scheduleId,
    });
  } catch (error) {
    const code =
      error instanceof
      BookingRescheduleDomainError
        ? error.code
        : error instanceof Error
          ? error.message
          : "UNKNOWN";

    const messages: Record<
      string,
      {
        status: number;
        error: string;
      }
    > = {
      REQUEST_NOT_FOUND: {
        status: 404,
        error:
          "طلب تغيير الموعد غير موجود.",
      },
      REQUEST_ALREADY_REVIEWED: {
        status: 409,
        error:
          "تمت مراجعة هذا الطلب بالفعل.",
      },
      BOOKING_NOT_CONFIRMED: {
        status: 409,
        error:
          "الحجز لم يعد مؤكدًا.",
      },
      BOOKING_NOT_ELIGIBLE: {
        status: 409,
        error:
          "الحجز لم يعد مؤهلًا لتنفيذ هذا الطلب.",
      },
      MEMBERSHIP_NOT_ACTIVE: {
        status: 409,
        error:
          "الاشتراك المرتبط بالحجز لم يعد فعالًا.",
      },
      SAME_SCHEDULE: {
        status: 400,
        error:
          "الموعد المطلوب هو نفس الموعد الحالي.",
      },
      TARGET_NOT_ACTIVE: {
        status: 409,
        error:
          "الموعد المطلوب لم يعد متاحًا.",
      },
      CURRENT_SLOT_PASSED: {
        status: 409,
        error:
          "موعد الحجز الحالي انتهى بالفعل.",
      },
      CURRENT_SLOT_TOO_CLOSE: {
        status: 409,
        error:
          "تبقى أقل من 4 ساعات على الموعد الحالي.",
      },
      CURRENT_SLOT_NOT_PASSED: {
        status: 409,
        error:
          "الحصة لم يمر موعدها بعد، لذلك لا يمكن اعتمادها كطلب تعويض حصة سابقة.",
      },
      ABSENCE_REASON_REQUIRED: {
        status: 400,
        error:
          "سبب عدم الحضور مطلوب لاعتماد طلب تعويض الحصة السابقة.",
      },
      TARGET_SLOT_PASSED: {
        status: 409,
        error:
          "الموعد المطلوب انتهى بالفعل.",
      },
      TARGET_ALREADY_BOOKED: {
        status: 409,
        error:
          "العميلة لديها حجز بالفعل في الموعد المطلوب.",
      },
      NO_ELIGIBLE_MEMBERSHIP: {
        status: 409,
        error:
          "لا توجد عضوية فعالة تسمح بالموعد المطلوب.",
      },
      CLASS_NOT_INCLUDED: {
        status: 409,
        error:
          "الكلاس المطلوب غير مشمول في عضوية العميلة.",
      },
      HEALTH_RESTRICTION_BLOCKED: {
        status: 409,
        error:
          "الكلاس المطلوب غير متاح وفقًا لإجابات الاستبيان الصحي الحالية.",
      },
      NO_TARGET_MEMBERSHIP: {
        status: 409,
        error:
          "تعذر تحديد العضوية المناسبة للموعد الجديد.",
      },
      TARGET_OUTSIDE_MEMBERSHIP_PERIOD: {
        status: 409,
        error:
          "الموعد المطلوب خارج مدة العضوية.",
      },
      DAILY_SESSION_LIMIT_REACHED: {
        status: 409,
        error:
          "سيؤدي تغيير الموعد إلى تجاوز الحد اليومي للحصص في العضوية.",
      },
      DISTINCT_CLASS_REQUIRED: {
        status: 409,
        error:
          "هذه الباقة تتطلب اختيار كلاس مختلف لكل حصة في اليوم.",
      },
      TARGET_FULL: {
        status: 409,
        error:
          "اكتمل العدد في الموعد المطلوب قبل الموافقة.",
      },
      BOOKING_CHANGED: {
        status: 409,
        error:
          "تم تعديل أو إلغاء الحجز أثناء مراجعة الطلب.",
      },
    };

    if (messages[code]) {
      return NextResponse.json(
        {
          error:
            messages[code].error,
          code,
        },
        {
          status:
            messages[code].status,
        },
      );
    }

    console.error(
      "[ADMIN_BOOKING_RESCHEDULE_REQUEST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر مراجعة طلب تغيير الموعد.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const guard =
    await requireAdminPermission(
      "bookings_reschedule",
    );

  if ("error" in guard) {
    return guard.error;
  }

  try {
    const payload =
      (await req.json()) as {
        requestId?: string;
      };

    const requestId =
      payload.requestId?.trim();

    if (!requestId) {
      return NextResponse.json(
        {
          error:
            "طلب تغيير الموعد غير محدد.",
        },
        { status: 400 },
      );
    }

    const existing =
      await db.bookingRescheduleRequest.findUnique({
        where: {
          id: requestId,
        },
        select: {
          id: true,
          bookingId: true,
          status: true,
          requestType: true,
          archivedAt: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "طلب تغيير الموعد غير موجود.",
        },
        { status: 404 },
      );
    }

    /*
     * Permanent deletion is intentionally restricted
     * to already-archived requests.
     *
     * Active / pending / reviewed requests must first
     * pass through the existing archive workflow.
     */
    if (!existing.archivedAt) {
      return NextResponse.json(
        {
          error:
            "لا يمكن حذف الطلب نهائيًا قبل أرشفته.",
        },
        { status: 409 },
      );
    }

    await db.bookingRescheduleRequest.delete({
      where: {
        id: existing.id,
      },
    });

    void logAudit({
      action:
        "delete_archived_reschedule_request",
      targetType: "booking",
      targetId: existing.bookingId,
      details: {
        requestId: existing.id,
        requestStatus: existing.status,
        requestType: existing.requestType,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    console.error(
      "[ADMIN_RESCHEDULE_REQUEST_DELETE]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر حذف الطلب المؤرشف.",
      },
      { status: 500 },
    );
  }
}

