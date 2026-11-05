import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  cairoCalendarDateKey,
  scheduleSlotInstant,
} from "@/lib/fitzone-time";
import {
  resolveMembershipClassEligibility,
} from "@/lib/membership-class-eligibility";

export async function GET() {
  const currentUser = await getCurrentAppUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "غير مصرح" },
      { status: 401 },
    );
  }

  const requests =
    await db.classExchangeRequest.findMany({
      where: {
        userId: currentUser.id,
        archivedAt: null,
      },
      include: {
        userMembership: {
          include: {
            membership: {
              select: {
                name: true,
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
      orderBy: {
        requestedAt: "desc",
      },
    });

  return NextResponse.json(
    requests.map((request) => ({
      id: request.id,
      status: request.status,
      note: request.note,
      requestedAt:
        request.requestedAt.toISOString(),
      reviewedAt:
        request.reviewedAt?.toISOString() ??
        null,
      rejectionReason:
        request.rejectionReason,
      userMembershipId:
        request.userMembershipId,
      membershipName:
        request.userMembership.membership.name,
      targetSchedule: {
        id: request.targetSchedule.id,
        date:
          request.targetSchedule.date.toISOString(),
        time: request.targetSchedule.time,
        className:
          request.targetSchedule.class.name,
        trainerName:
          request.targetSchedule.class.trainer
            ?.name ?? "",
      },
    })),
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "غير مصرح" },
      { status: 401 },
    );
  }

  try {
    const payload = (await req.json()) as {
      userMembershipId?: string;
      targetScheduleId?: string;
      note?: string;
    };

    const userMembershipId =
      payload.userMembershipId?.trim() ?? "";

    const targetScheduleId =
      payload.targetScheduleId?.trim() ?? "";

    const note =
      payload.note?.trim() ?? "";

    if (
      !userMembershipId ||
      !targetScheduleId
    ) {
      return NextResponse.json(
        {
          error:
            "الاشتراك والموعد المطلوبان.",
        },
        { status: 400 },
      );
    }

    if (note.length > 1000) {
      return NextResponse.json(
        {
          error:
            "الملاحظة طويلة جدًا.",
        },
        { status: 400 },
      );
    }

    const membership =
      await db.userMembership.findFirst({
        where: {
          id: userMembershipId,
          userId: currentUser.id,
          status: "active",
        },
        include: {
          membership: {
            select: {
              classSessions: true,
            },
          },
        },
      });

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "الاشتراك غير متاح للاستبدال.",
        },
        { status: 400 },
      );
    }

    const targetSchedule =
      await db.schedule.findUnique({
        where: {
          id: targetScheduleId,
        },
        include: {
          class: true,
        },
      });

    if (
      !targetSchedule ||
      !targetSchedule.isActive
    ) {
      return NextResponse.json(
        {
          error:
            "الموعد المطلوب غير متاح.",
        },
        { status: 404 },
      );
    }

    const now = new Date();

    const targetInstant =
      scheduleSlotInstant(
        targetSchedule.date,
        targetSchedule.time,
      );

    if (
      targetInstant.getTime() <=
      now.getTime()
    ) {
      return NextResponse.json(
        {
          error:
            "لا يمكن طلب كلاس انتهى موعده.",
        },
        { status: 400 },
      );
    }

    const targetDay =
      cairoCalendarDateKey(
        targetSchedule.date,
      );

    const membershipStartDay =
      cairoCalendarDateKey(
        membership.startDate,
      );

    const membershipEndDay =
      cairoCalendarDateKey(
        membership.endDate,
      );

    if (
      targetDay < membershipStartDay ||
      targetDay > membershipEndDay
    ) {
      return NextResponse.json(
        {
          error:
            "الموعد المطلوب خارج فترة الاشتراك.",
          code:
            "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD",
        },
        { status: 400 },
      );
    }

    const eligibility =
      await resolveMembershipClassEligibility({
        userId: currentUser.id,
        classes: [
          {
            id: targetSchedule.class.id,
            type: targetSchedule.class.type,
            classTypeId:
              targetSchedule.class.classTypeId ??
              null,
          },
        ],
        now,
        memberships: [membership],
      });

    const normallyAllowed =
      eligibility.unrestricted ||
      eligibility.allowedClassIds.includes(
        targetSchedule.class.id,
      );

    if (normallyAllowed) {
      return NextResponse.json(
        {
          error:
            "هذا الكلاس مشمول بالفعل ضمن الاشتراك ولا يحتاج إلى استبدال.",
          code: "CLASS_ALREADY_INCLUDED",
        },
        { status: 400 },
      );
    }

    if (
      targetSchedule.availableSpots <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "لا توجد أماكن متاحة في الموعد المطلوب.",
          code: "SCHEDULE_FULL",
        },
        { status: 400 },
      );
    }

    /*
     * Customer-side exchange requests must never target a day
     * that already contains two physical sessions under the
     * same membership.
     *
     * Admin execution remains more flexible because the admin
     * may explicitly choose those same two sessions as the
     * exchange sources. executeClassExchange() cancels the
     * selected sources inside the transaction before applying
     * the frozen daily-session rule.
     */
    const sameDayPhysicalBookings =
      await db.booking.findMany({
        where: {
          userId: currentUser.id,
          userMembershipId:
            membership.id,
          status: {
            in: [
              "confirmed",
              "attended",
            ],
          },
        },
        select: {
          id: true,
          schedule: {
            select: {
              date: true,
            },
          },
        },
      });

    const sameDayBookingCount =
      sameDayPhysicalBookings.filter(
        (booking) =>
          cairoCalendarDateKey(
            booking.schedule.date,
          ) === targetDay,
      ).length;

    if (sameDayBookingCount >= 2) {
      return NextResponse.json(
        {
          error:
            "لا يمكن اختيار هذا اليوم لأن لديك حصتين بالفعل في نفس اليوم. اختاري يومًا آخر، أو تواصلي مع الإدارة إذا كنتِ تريدين استبدال حصتي هذا اليوم بالكلاس المطلوب.",
          code:
            "CUSTOMER_TARGET_DAY_FULL",
          sameDayBookingCount,
        },
        { status: 409 },
      );
    }

    const pendingKey =
      `membership:${membership.id}`;

    const existingPending =
      await db.classExchangeRequest.findUnique({
        where: {
          pendingKey,
        },
        select: {
          id: true,
        },
      });

    if (existingPending) {
      return NextResponse.json(
        {
          error:
            "يوجد بالفعل طلب استبدال قيد مراجعة الإدارة لهذا الاشتراك.",
          requestId:
            existingPending.id,
        },
        { status: 409 },
      );
    }

    const request =
      await db.classExchangeRequest.create({
        data: {
          userId: currentUser.id,
          userMembershipId:
            membership.id,
          targetScheduleId,
          note: note || null,
          status: "pending",
          pendingKey,
        },
      });

    return NextResponse.json(
      {
        success: true,
        requestId: request.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "[ME_CLASS_EXCHANGE_REQUEST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر إرسال طلب الاستبدال.",
      },
      { status: 500 },
    );
  }
}
