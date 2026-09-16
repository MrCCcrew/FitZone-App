import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";
import { scheduleSlotInstant } from "@/lib/fitzone-time";
import {
  ExchangeDomainError,
  type ExchangeErrorCode,
  executeClassExchange,
} from "@/lib/class-exchange-service";

export async function GET(req: Request): Promise<NextResponse> {
  let authorization =
    await requireAdminPermission("class_exchanges_execute");

  if ("error" in authorization) {
    authorization =
      await requireAdminPermission("class_exchanges_review");
  }

  if ("error" in authorization) {
    return authorization.error ??
      NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
  }

  const url = new URL(req.url);

  const userMembershipId =
    url.searchParams.get("userMembershipId")?.trim() ?? "";

  if (!userMembershipId) {
    return NextResponse.json(
      {
        error: "الاشتراك مطلوب.",
      },
      { status: 400 },
    );
  }

  const membership = await db.userMembership.findUnique({
    where: {
      id: userMembershipId,
    },
    select: {
      id: true,
      userId: true,
      status: true,
    },
  });

  if (!membership || membership.status !== "active") {
    return NextResponse.json(
      {
        error: "الاشتراك غير نشط.",
      },
      { status: 400 },
    );
  }

  /*
   * Keep two separate views:
   *
   * 1) sourceBookings:
   *    only ordinary future bookings that may finance
   *    the two-unit exchange.
   *
   * 2) physicalBookings:
   *    every confirmed future physical booking under
   *    the membership. This is used only for showing
   *    the real number of sessions already present
   *    on each target day.
   */
  const [bookings, physicalBookings] = await Promise.all([
    db.booking.findMany({
      where: {
        userMembershipId,
        userId: membership.userId,
        status: "confirmed",
        entitlementUnits: 1,
        isMakeup: false,
      },
      include: {
        schedule: {
          include: {
            class: true,
          },
        },
      },
    }),

    db.booking.findMany({
      where: {
        userMembershipId,
        userId: membership.userId,
        status: "confirmed",
      },
      include: {
        schedule: {
          include: {
            class: true,
          },
        },
      },
    }),
  ]);

  const now = new Date();

  const sourceBookings = bookings
    .filter((booking) => {
      const instant = scheduleSlotInstant(
        booking.schedule.date,
        booking.schedule.time,
      );

      return instant.getTime() > now.getTime();
    })
    .sort((a, b) => {
      const aInstant = scheduleSlotInstant(a.schedule.date, a.schedule.time);

      const bInstant = scheduleSlotInstant(b.schedule.date, b.schedule.time);

      return aInstant.getTime() - bInstant.getTime();
    })
    .map((booking) => ({
      id: booking.id,
      scheduleId: booking.scheduleId,
      date: booking.schedule.date.toISOString(),
      time: booking.schedule.time,
      className: booking.schedule.class.name,
    }));

  const dayBookings = physicalBookings
    .filter((booking) => {
      const instant = scheduleSlotInstant(
        booking.schedule.date,
        booking.schedule.time,
      );

      return instant.getTime() > now.getTime();
    })
    .sort((a, b) => {
      const aInstant = scheduleSlotInstant(a.schedule.date, a.schedule.time);

      const bInstant = scheduleSlotInstant(b.schedule.date, b.schedule.time);

      return aInstant.getTime() - bInstant.getTime();
    })
    .map((booking) => ({
      id: booking.id,
      scheduleId: booking.scheduleId,
      date: booking.schedule.date.toISOString(),
      time: booking.schedule.time,
      className: booking.schedule.class.name,
      entitlementUnits: booking.entitlementUnits,
      isMakeup: booking.isMakeup,
      eligibleAsExchangeSource:
        booking.entitlementUnits === 1 && booking.isMakeup === false,
    }));

  return NextResponse.json({
    sourceBookings,
    dayBookings,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const authorization =
    await requireAdminPermission("class_exchanges_execute");

  if ("error" in authorization) {
    return authorization.error ??
      NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
  }

  try {
    const payload = (await req.json()) as {
      userMembershipId?: string;
      scheduleId?: string;
      sourceBookingIds?: string[];
      reason?: string;
    };

    const userMembershipId = payload.userMembershipId?.trim() ?? "";

    const scheduleId = payload.scheduleId?.trim() ?? "";

    const sourceBookingIds = Array.isArray(payload.sourceBookingIds)
      ? Array.from(
          new Set(
            payload.sourceBookingIds
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        )
      : [];

    const reason = payload.reason?.trim() ?? "";

    if (!userMembershipId || !scheduleId) {
      return NextResponse.json(
        {
          error: "الاشتراك والموعد مطلوبان.",
        },
        { status: 400 },
      );
    }

    if (reason.length < 3) {
      return NextResponse.json(
        {
          error: "يرجى كتابة سبب الحجز الاستثنائي.",
        },
        { status: 400 },
      );
    }

    if (reason.length > 1000) {
      return NextResponse.json(
        {
          error: "سبب الحجز الاستثنائي طويل جدًا.",
        },
        { status: 400 },
      );
    }

    const result = await executeClassExchange({
      userMembershipId,
      scheduleId,
      sourceBookingIds,
      reason,
      createdByUserId: authorization.session.id,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ExchangeDomainError) {
      const responses: Record<
        ExchangeErrorCode,
        {
          status: number;
          message: string;
        }
      > = {
        MEMBERSHIP_NOT_FOUND: {
          status: 404,
          message: "الاشتراك غير موجود.",
        },
        MEMBERSHIP_NOT_ACTIVE: {
          status: 409,
          message: "الاشتراك غير فعال.",
        },
        MEMBERSHIP_SESSION_LIMIT_UNAVAILABLE: {
          status: 409,
          message:
            "هذا الاشتراك لا يحتوي على رصيد حصص محدد يمكن استخدامه في الاستبدال.",
        },
        INSUFFICIENT_SESSION_UNITS: {
          status: 409,
          message:
            "لا يوجد رصيد كافٍ. الحجز الاستثنائي يحتاج إلى حصتين متاحتين.",
        },
        SCHEDULE_NOT_FOUND: {
          status: 404,
          message: "الموعد غير موجود.",
        },
        SCHEDULE_NOT_ACTIVE: {
          status: 409,
          message: "الموعد غير فعال.",
        },
        SCHEDULE_PASSED: {
          status: 409,
          message: "لا يمكن إنشاء حجز استثنائي لموعد بدأ بالفعل.",
        },
        SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD: {
          status: 409,
          message: "الموعد المختار خارج مدة الاشتراك.",
        },
        CLASS_ALREADY_INCLUDED: {
          status: 409,
          message:
            "هذا الكلاس مشمول بالفعل في الاشتراك ولا يحتاج إلى حجز استثنائي.",
        },
        OTHER_MEMBERSHIP_CAN_BOOK_NORMALLY: {
          status: 409,
          message:
            "العميل لديه اشتراك آخر يسمح بهذا الكلاس ولديه رصيد متاح. استخدم الحجز العادي بدل خصم حصتين.",
        },
        HEALTH_RESTRICTION_BLOCKED: {
          status: 409,
          message: "هذا الكلاس غير متاح وفقًا لإجابات الاستبيان الصحي الحالية.",
        },
        SCHEDULE_FULL: {
          status: 409,
          message: "لا توجد أماكن متاحة لهذا الموعد.",
        },
        ALREADY_BOOKED: {
          status: 409,
          message: "العميل لديه حجز بالفعل لهذا الموعد.",
        },
        BOOKING_TIME_CONFLICT: {
          status: 409,
          message: "العميل لديه حجز آخر في نفس التاريخ والوقت.",
        },
        DAILY_SESSION_LIMIT_REACHED: {
          status: 409,
          message: "تم الوصول للحد الأقصى للحجوزات في هذا اليوم.",
        },
        DISTINCT_CLASS_REQUIRED: {
          status: 409,
          message: "سياسة الاشتراك تتطلب كلاسًا مختلفًا لكل حجز في اليوم.",
        },
      };

      const response = responses[error.code];

      return NextResponse.json(
        {
          error: response.message,
          code: error.code,
        },
        {
          status: response.status,
        },
      );
    }

    console.error("[ADMIN_CLASS_EXCHANGE_POST]", error);

    return NextResponse.json(
      {
        error: "تعذر إنشاء الحجز الاستثنائي.",
      },
      { status: 500 },
    );
  }
}
