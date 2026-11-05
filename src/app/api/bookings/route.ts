import {
  BookingRescheduleDomainError,
  createBookingRescheduleRequest,
} from "@/lib/booking-reschedule-service";
import { NextResponse } from "next/server";
import { cairoCalendarDateKey, scheduleSlotInstant } from "@/lib/fitzone-time";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { isBookingOperational } from "@/lib/booking-operational";
import { assertUserCanBookClassByHealth } from "@/lib/booking/health-booking-policy";
import {
  getFrozenMaxSessionsPerDay,
  getFrozenRequireDistinctClassesPerDay,
} from "@/lib/booking/booking-policy";
import {
  resolveMembershipClassEligibility,
} from "@/lib/membership-class-eligibility";
import { sumMembershipBookingUnits } from "@/lib/membership-session-units";
import { reverseMembershipClassExchange } from "@/lib/membership-class-exchange";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }

    const { scheduleId } = (await req.json()) as { scheduleId?: string };
    if (!scheduleId) {
      return NextResponse.json({ error: "موعد الحجز مطلوب" }, { status: 400 });
    }

    const schedule = await db.schedule.findUnique({
      where: { id: scheduleId },
      include: { class: { include: { trainer: true } } },
    });

    if (!schedule || !schedule.isActive) {
      return NextResponse.json(
        { error: "هذا الموعد غير متاح" },
        { status: 404 },
      );
    }

    if (schedule.availableSpots <= 0) {
      return NextResponse.json(
        { error: "لا توجد أماكن متاحة لهذا الموعد" },
        { status: 400 },
      );
    }

    const existing = await db.booking.findFirst({
      where: {
        userId,
        scheduleId,
        status: { in: ["confirmed", "attended"] },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "تم حجز هذا الموعد مسبقًا" },
        { status: 409 },
      );
    }

    const now = new Date();
    const activeMemberships = await db.userMembership.findMany({
      where: {
        userId,
        status: "active",
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
      include: { membership: { select: { classSessions: true } } },
    });
    const eligibility = await resolveMembershipClassEligibility({
      userId,
      classes: [schedule.class],
      now,
      memberships: activeMemberships,
    });
    if (!eligibility.hasEligibleMembership) {
      return NextResponse.json(
        { error: "لا توجد عضوية فعالة للحجز.", code: "NO_ELIGIBLE_MEMBERSHIP" },
        { status: 400 },
      );
    }
    if (
      !eligibility.unrestricted &&
      !eligibility.allowedClassIds.includes(schedule.class.id)
    ) {
      return NextResponse.json(
        {
          error: "هذا الكلاس غير مشمول ضمن العرض المشترك به.",
          code: "CLASS_NOT_INCLUDED_IN_MEMBERSHIP",
        },
        { status: 400 },
      );
    }
    // The central entitlement engine tells us exactly which memberships grant
    // this class. Keep the existing earliest-expiring order, but skip an
    // exhausted membership when a later eligible membership still has credit.
    const grantingIds = new Set(
      eligibility.membershipIdsByClass[schedule.class.id] ?? [],
    );
    let activeMembership: (typeof activeMemberships)[number] | null = null;
    let hadEligibleButExhausted = false;

    for (const membership of activeMemberships) {
      if (!grantingIds.has(membership.id)) continue;

      if (membership.totalSessions !== null && membership.totalSessions > 0) {
        const entitlementBookings = await db.booking.findMany({
          where: {
            userMembershipId: membership.id,
            status: { in: ["confirmed", "attended"] },
          },
          select: {
            status: true,
            entitlementUnits: true,
          },
        });

        const usedEntitlementUnits =
          sumMembershipBookingUnits(
            entitlementBookings,
            ["confirmed", "attended"],
          );

        if (usedEntitlementUnits >= membership.totalSessions) {
          hadEligibleButExhausted = true;
          continue;
        }
      }

      activeMembership = membership;
      break;
    }

    if (!activeMembership) {
      return NextResponse.json(
        hadEligibleButExhausted
          ? { error: "لقد استنفدتِ جميع حصص اشتراكك.", code: "MEMBERSHIP_SESSIONS_EXHAUSTED" }
          : { error: "هذا الكلاس غير مشمول ضمن الاشتراك.", code: "CLASS_NOT_INCLUDED_IN_MEMBERSHIP" },
        { status: 400 },
      );
    }

    try {
      await assertUserCanBookClassByHealth(db, userId, schedule.class.type);
    } catch (error) {
      if (error instanceof Error && error.message === "HEALTH_RESTRICTION_BLOCKED") {
        return NextResponse.json(
          {
            error: "هذا الكلاس غير متاح وفقًا لإجابات الاستبيان الصحي الحالية.",
            code: "HEALTH_RESTRICTION_BLOCKED",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const targetInstant = scheduleSlotInstant(new Date(schedule.date), schedule.time);
    const targetDay = cairoCalendarDateKey(targetInstant);
    const membershipStartDay = cairoCalendarDateKey(activeMembership.startDate);
    const membershipEndDay = cairoCalendarDateKey(activeMembership.endDate);

    if (targetDay < membershipStartDay || targetDay > membershipEndDay) {
      return NextResponse.json(
        {
          error: "الموعد المختار خارج مدة الاشتراك.",
          code: "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD",
        },
        { status: 400 },
      );
    }

    const maxSessionsPerDay = getFrozenMaxSessionsPerDay(
      activeMembership.bookingPatternSnapshot,
      2,
    );
    const requireDistinctClassesPerDay = getFrozenRequireDistinctClassesPerDay(
      activeMembership.bookingPatternSnapshot,
    );
    const membershipBookings = await db.booking.findMany({
      where: {
        userMembershipId: activeMembership.id,
        status: { in: ["confirmed", "attended"] },
      },
      select: {
        schedule: { select: { date: true, time: true, classId: true } },
      },
    });
    const sameDayBookings = membershipBookings.filter((booking) =>
      cairoCalendarDateKey(
        scheduleSlotInstant(booking.schedule.date, booking.schedule.time),
      ) === targetDay,
    );

    if (sameDayBookings.length >= maxSessionsPerDay) {
      return NextResponse.json(
        {
          error: `وصلتِ للحد الأقصى للحصص في هذا اليوم (${maxSessionsPerDay}).`,
          code: "DAILY_SESSION_LIMIT_REACHED",
        },
        { status: 400 },
      );
    }

    if (
      requireDistinctClassesPerDay &&
      sameDayBookings.some((booking) => booking.schedule.classId === schedule.classId)
    ) {
      return NextResponse.json(
        {
          error: "يجب اختيار كلاس مختلف لكل حصة في هذه الباقة.",
          code: "DISTINCT_CLASS_REQUIRED",
        },
        { status: 400 },
      );
    }

    const bookingClaim =
      await db.$transaction(async (tx) => {
        /*
         * Shared entitlement lock.
         *
         * Normal membership booking and administrative class exchange
         * must acquire the same UserMembership row first.
         */
        const lockedMembershipRows =
          await tx.$queryRaw<any[]>`
            SELECT
              \`id\`,
              \`status\`,
              \`totalSessions\`,
              \`startDate\`,
              \`endDate\`
            FROM \`UserMembership\`
            WHERE \`id\` = ${activeMembership.id}
            FOR UPDATE
          `;

        const lockedMembership =
          lockedMembershipRows[0];

        if (
          !lockedMembership ||
          lockedMembership.status !== "active"
        ) {
          return {
            ok: false as const,
            code: "MEMBERSHIP_NOT_ACTIVE",
          };
        }

        const lockedStartDay =
          cairoCalendarDateKey(
            new Date(lockedMembership.startDate),
          );

        const lockedEndDay =
          cairoCalendarDateKey(
            new Date(lockedMembership.endDate),
          );

        if (
          targetDay < lockedStartDay ||
          targetDay > lockedEndDay
        ) {
          return {
            ok: false as const,
            code: "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD",
          };
        }

        const lockedEntitlementBookings =
          await tx.booking.findMany({
            where: {
              userMembershipId:
                activeMembership.id,
              status: {
                in: ["confirmed", "attended"],
              },
            },
            select: {
              status: true,
              entitlementUnits: true,
            },
          });

        const lockedUsedEntitlementUnits =
          sumMembershipBookingUnits(
            lockedEntitlementBookings,
            ["confirmed", "attended"],
          );

        const lockedTotalSessions =
          lockedMembership.totalSessions == null
            ? null
            : Number(
                lockedMembership.totalSessions,
              );

        if (
          lockedTotalSessions != null &&
          lockedTotalSessions > 0 &&
          lockedUsedEntitlementUnits >=
            lockedTotalSessions
        ) {
          return {
            ok: false as const,
            code: "MEMBERSHIP_SESSIONS_EXHAUSTED",
          };
        }

        /*
         * Daily limits remain PHYSICAL booking counts.
         */
        const lockedMembershipBookings =
          await tx.booking.findMany({
            where: {
              userMembershipId:
                activeMembership.id,
              status: {
                in: ["confirmed", "attended"],
              },
            },
            select: {
              schedule: {
                select: {
                  date: true,
                  time: true,
                  classId: true,
                },
              },
            },
          });

        const lockedSameDayBookings =
          lockedMembershipBookings.filter(
            (booking) =>
              cairoCalendarDateKey(
                scheduleSlotInstant(
                  booking.schedule.date,
                  booking.schedule.time,
                ),
              ) === targetDay,
          );

        if (
          lockedSameDayBookings.length >=
          maxSessionsPerDay
        ) {
          return {
            ok: false as const,
            code: "DAILY_SESSION_LIMIT_REACHED",
          };
        }

        if (
          requireDistinctClassesPerDay &&
          lockedSameDayBookings.some(
            (booking) =>
              booking.schedule.classId ===
              schedule.classId,
          )
        ) {
          return {
            ok: false as const,
            code: "DISTINCT_CLASS_REQUIRED",
          };
        }

        /*
         * Lock order:
         * UserMembership -> Schedule
         */
        const lockedScheduleRows =
          await tx.$queryRaw<any[]>`
            SELECT
              \`id\`,
              \`availableSpots\`,
              \`isActive\`
            FROM \`Schedule\`
            WHERE \`id\` = ${scheduleId}
            FOR UPDATE
          `;

        const lockedSchedule =
          lockedScheduleRows[0];

        if (
          !lockedSchedule ||
          !Boolean(lockedSchedule.isActive)
        ) {
          return {
            ok: false as const,
            code: "SCHEDULE_UNAVAILABLE",
          };
        }

        if (
          Number(
            lockedSchedule.availableSpots,
          ) <= 0
        ) {
          return {
            ok: false as const,
            code: "SCHEDULE_FULL",
          };
        }

        const lockedExisting =
          await tx.booking.findFirst({
            where: {
              userId,
              scheduleId,
              status: {
                in: ["confirmed", "attended"],
              },
            },
            select: {
              id: true,
            },
          });

        if (lockedExisting) {
          return {
            ok: false as const,
            code: "ALREADY_BOOKED",
          };
        }

        const created =
          await tx.booking.create({
            data: {
              userId,
              scheduleId,
              userMembershipId:
                activeMembership.id,
              status: "confirmed",
              paidAmount:
                schedule.class.price,
              paymentMethod: "membership",
            },
          });

        await tx.schedule.update({
          where: {
            id: scheduleId,
          },
          data: {
            availableSpots: {
              decrement: 1,
            },
          },
        });

        await tx.notification.create({
          data: {
            userId,
            title:
              `تم حجز ${schedule.class.name}`,
            body:
              `تم حجز موعد ${schedule.time} بتاريخ ` +
              `${schedule.date.toLocaleDateString("ar-EG")} بنجاح.`,
            type: "success",
          },
        });

        return {
          ok: true as const,
          booking: created,
        };
      });

    if (!bookingClaim.ok) {
      switch (bookingClaim.code) {
        case "MEMBERSHIP_NOT_ACTIVE":
          return NextResponse.json(
            {
              error: "الاشتراك لم يعد فعالًا.",
              code: "MEMBERSHIP_NOT_ACTIVE",
            },
            { status: 409 },
          );

        case "MEMBERSHIP_SESSIONS_EXHAUSTED":
          return NextResponse.json(
            {
              error: "لقد استنفدتِ جميع حصص اشتراكك.",
              code: "MEMBERSHIP_SESSIONS_EXHAUSTED",
            },
            { status: 409 },
          );

        case "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD":
          return NextResponse.json(
            {
              error: "الموعد المختار خارج مدة الاشتراك.",
              code: "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD",
            },
            { status: 409 },
          );

        case "DAILY_SESSION_LIMIT_REACHED":
          return NextResponse.json(
            {
              error:
                `وصلتِ للحد الأقصى للحصص في هذا اليوم (${maxSessionsPerDay}).`,
              code: "DAILY_SESSION_LIMIT_REACHED",
            },
            { status: 409 },
          );

        case "DISTINCT_CLASS_REQUIRED":
          return NextResponse.json(
            {
              error:
                "يجب اختيار كلاس مختلف لكل حصة في هذه الباقة.",
              code: "DISTINCT_CLASS_REQUIRED",
            },
            { status: 409 },
          );

        case "SCHEDULE_UNAVAILABLE":
          return NextResponse.json(
            { error: "هذا الموعد لم يعد متاحًا." },
            { status: 409 },
          );

        case "SCHEDULE_FULL":
          return NextResponse.json(
            { error: "لا توجد أماكن متاحة لهذا الموعد." },
            { status: 409 },
          );

        case "ALREADY_BOOKED":
          return NextResponse.json(
            { error: "تم حجز هذا الموعد مسبقًا" },
            { status: 409 },
          );
      }

      /*
       * Defensive exhaustive fallback.
       * Every known failure code returns above; this also gives
       * TypeScript an explicit control-flow boundary.
       */
      return NextResponse.json(
        {
          error:
            "تعذر تأكيد الحجز بسبب تغير حالة الاشتراك أو الموعد.",
          code: "BOOKING_CLAIM_FAILED",
        },
        { status: 409 },
      );
    }

    const booking = bookingClaim.booking;

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      message: "تم تأكيد الحجز بنجاح.",
    });
  } catch (error) {
    console.error("[BOOKINGS_POST]", error);
    return NextResponse.json({ error: "تعذر إتمام الحجز" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً" },
        { status: 401 },
      );
    }

    const {
      bookingId,
      scheduleId,
      requestType,
      absenceReason,
    } = (await req.json()) as {
      bookingId?: string;
      scheduleId?: string;
      requestType?:
        | "upcoming_change"
        | "past_absence_makeup";
      absenceReason?: string;
    };

    if (!bookingId) {
      return NextResponse.json(
        { error: "الحجز المطلوب غير محدد" },
        { status: 400 },
      );
    }

    // ─────────────────────────────────────────────────────────
    // RESCHEDULE / PAST-ABSENCE MAKE-UP
    //
    // All business validation and request creation now live in
    // BookingRescheduleService.
    // ─────────────────────────────────────────────────────────
    if (scheduleId) {
      try {
        const result =
          await createBookingRescheduleRequest({
            userId,
            bookingId,
            targetScheduleId: scheduleId,
            requestType,
            absenceReason,
          });

        return NextResponse.json(result);
      } catch (error) {
        if (
          error instanceof
          BookingRescheduleDomainError
        ) {
          const mapping: Record<
            string,
            {
              status: number;
              error: string;
              externalCode?: string;
            }
          > = {
            BOOKING_NOT_FOUND: {
              status: 404,
              error: "الحجز غير موجود",
            },
            BOOKING_NOT_OPERATIONAL: {
              status: 400,
              error:
                "لا يمكن تعديل حجز مرتبط باشتراك غير نشط",
            },
            BOOKING_NOT_ELIGIBLE: {
              status: 400,
              error: "لا يمكن تعديل هذا الحجز",
            },
            EXCHANGE_RESCHEDULE_NOT_ALLOWED: {
              status: 409,
              error:
                "هذا حجز استثنائي مقابل حصتين ولا يمكن تغييره أو طلب تعويض له من المسار العادي. يرجى التواصل مع الإدارة.",
              externalCode:
                "EXCHANGE_RESCHEDULE_NOT_ALLOWED",
            },
            CURRENT_SLOT_PASSED: {
              status: 400,
              error:
                "انتهى موعد هذا الحجز. يمكنك تقديم طلب تعويض حصة سابقة بدلًا من تغيير الموعد.",
            },
            CURRENT_SLOT_TOO_CLOSE: {
              status: 400,
              error:
                "لا يمكن تعديل الموعد قبل أقل من 4 ساعات من بدايته",
            },
            CURRENT_SLOT_NOT_PASSED: {
              status: 400,
              error:
                "هذا الحجز لم يحن موعده بعد، استخدمي طلب تغيير الموعد العادي.",
            },
            ABSENCE_REASON_REQUIRED: {
              status: 400,
              error:
                "يرجى كتابة سبب عدم الحضور قبل إرسال طلب التعويض.",
            },
            ABSENCE_REASON_TOO_LONG: {
              status: 400,
              error: "سبب عدم الحضور طويل جدًا.",
            },
            SAME_SCHEDULE: {
              status: 400,
              error:
                "هذا هو الموعد الحالي بالفعل",
            },
            TARGET_NOT_FOUND: {
              status: 404,
              error:
                "الموعد الجديد غير متاح",
            },
            TARGET_NOT_ACTIVE: {
              status: 404,
              error:
                "الموعد الجديد غير متاح",
            },
            TARGET_SLOT_PASSED: {
              status: 400,
              error:
                "لا يمكن طلب موعد انتهى بالفعل",
            },
            TARGET_FULL: {
              status: 400,
              error:
                "لا توجد أماكن متاحة لهذا الموعد",
            },
            NO_ELIGIBLE_MEMBERSHIP: {
              status: 400,
              error:
                "لا توجد عضوية فعالة للحجز.",
              externalCode:
                "NO_ELIGIBLE_MEMBERSHIP",
            },
            CLASS_NOT_INCLUDED: {
              status: 400,
              error:
                "هذا الكلاس غير مشمول ضمن العرض المشترك به.",
              externalCode:
                "CLASS_NOT_INCLUDED_IN_MEMBERSHIP",
            },
            HEALTH_RESTRICTION_BLOCKED: {
              status: 400,
              error:
                "هذا الكلاس غير متاح وفقًا لإجابات الاستبيان الصحي الحالية.",
              externalCode:
                "HEALTH_RESTRICTION_BLOCKED",
            },
            RESCHEDULE_ALREADY_PENDING: {
              status: 409,
              error:
                "يوجد بالفعل طلب تغيير موعد قيد مراجعة الإدارة.",
              externalCode:
                "RESCHEDULE_ALREADY_PENDING",
            },
          };

          const mapped = mapping[error.code];

          if (mapped) {
            return NextResponse.json(
              {
                error: mapped.error,
                ...(mapped.externalCode
                  ? {
                      code:
                        mapped.externalCode,
                    }
                  : {}),
                ...(error.details?.requestId
                  ? {
                      requestId:
                        error.details.requestId,
                    }
                  : {}),
              },
              { status: mapped.status },
            );
          }
        }

        throw error;
      }
    }

    // Customer self-cancellation is intentionally disabled.
    // Cancellation remains an administration-only business action
    // through the dedicated admin bookings API.
    return NextResponse.json(
      {
        error:
          "إلغاء الحجز متاح من خلال الإدارة فقط. يمكنك تقديم طلب تغيير الموعد من حسابك.",
        code: "CUSTOMER_CANCELLATION_DISABLED",
      },
      { status: 403 },
    );

  } catch (error) {
    console.error("[BOOKINGS_PATCH]", error);

    return NextResponse.json(
      {
        error:
          "تعذر تعديل الحجز",
      },
      { status: 500 },
    );
  }
}
