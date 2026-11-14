import "server-only";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { asDbTransactionClient, db } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import { cairoCalendarDateKey, scheduleSlotInstant } from "@/lib/fitzone-time";
import { isClassAllowedByEligibilitySnapshot, parseEligibilityPolicySnapshot } from "@/lib/get-eligible-classes";
import { assertUserCanBookClassByHealth } from "@/lib/booking/health-booking-policy";
import { getFrozenMaxSessionsPerDay, getFrozenRequireDistinctClassesPerDay } from "@/lib/booking/booking-policy";
import { sumMembershipBookingUnits } from "@/lib/membership-session-units";

/** Only independently settled rights may be consumed. No membership lifecycle updates. */
export async function bookIndependentFriendOfferClass(
  userId: string,
  entitlementId: string,
  scheduleId: string,
) {
  const result = await db.$transaction(async (tx) => {
    await lockMembershipLifecycleUserTx(asDbTransactionClient(tx), userId);
    await tx.$queryRaw`SELECT id FROM FriendOfferEntitlement WHERE id = ${entitlementId} FOR UPDATE`;
    const right = await tx.friendOfferEntitlement.findUnique({ where: { id: entitlementId } });
    if (!right || right.userId !== userId) {
      return { ok: false as const, code: "FRIEND_RIGHT_NOT_FOUND", status: 404 };
    }
    // Critical: pending_settlement must never book a seat, even if the provider paid.
    if (right.status !== "active") {
      return { ok: false as const, code: "FRIEND_RIGHT_NOT_SETTLED", status: 409 };
    }
    const participant = await tx.friendOfferParticipant.findUnique({
      where: { id: right.participantId },
      select: { userId: true, status: true, paymentTransactionId: true, userMembershipId: true },
    });
    const payment = await tx.paymentTransaction.findUnique({
      where: { id: right.paymentTransactionId },
      select: { userId: true, status: true, provider: true, membershipId: true },
    });
    if (!participant || participant.userId !== userId ||
        participant.paymentTransactionId !== right.paymentTransactionId ||
        participant.userMembershipId !== null ||
        !["paid", "activated"].includes(participant.status) ||
        !payment || payment.userId !== userId || payment.status !== "paid" ||
        payment.provider !== "paymob" || payment.membershipId !== null) {
      return { ok: false as const, code: "FRIEND_RIGHT_PAYMENT_MISMATCH", status: 409 };
    }
    const eligibility = parseEligibilityPolicySnapshot(right.eligibilitySnapshot);
    if (!eligibility) {
      return { ok: false as const, code: "FRIEND_RIGHT_ELIGIBILITY_MISSING", status: 409 };
    }
    let terms: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(right.frozenTermsSnapshot);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      terms = parsed as Record<string, unknown>;
    } catch {
      return { ok: false as const, code: "FRIEND_RIGHT_TERMS_INVALID", status: 409 };
    }
    // Missing frozen booking policy is a blocker, never an implicit permissive default.
    const policy = terms.bookingPatternSnapshot;
    if (typeof policy !== "string" || !policy.trim()) {
      return { ok: false as const, code: "FRIEND_RIGHT_BOOKING_POLICY_MISSING", status: 409 };
    }
    await tx.$queryRaw`SELECT id FROM Schedule WHERE id = ${scheduleId} FOR UPDATE`;
    const schedule = await tx.schedule.findUnique({ where: { id: scheduleId }, include: { class: true } });
    if (!schedule || !schedule.isActive || !schedule.class.isActive) {
      return { ok: false as const, code: "SCHEDULE_UNAVAILABLE", status: 404 };
    }
    const instant = scheduleSlotInstant(schedule.date, schedule.time);
    const today = new Date();
    const sessionDay = cairoCalendarDateKey(instant);
    if (!Number.isFinite(instant.getTime()) || instant.getTime() <= today.getTime() ||
        cairoCalendarDateKey(today) < cairoCalendarDateKey(right.startDate) ||
        cairoCalendarDateKey(today) > cairoCalendarDateKey(right.endDate) ||
        sessionDay < cairoCalendarDateKey(right.startDate) ||
        sessionDay > cairoCalendarDateKey(right.endDate)) {
      return { ok: false as const, code: "FRIEND_RIGHT_DATE_OUT_OF_RANGE", status: 409 };
    }
    if (!(await isClassAllowedByEligibilitySnapshot(eligibility, schedule.classId, tx))) {
      return { ok: false as const, code: "FRIEND_CLASS_NOT_ELIGIBLE", status: 409 };
    }
    try {
      await assertUserCanBookClassByHealth(tx, userId, schedule.class.type);
    } catch (error) {
      if (error instanceof Error && error.message === "HEALTH_RESTRICTION_BLOCKED") {
        return { ok: false as const, code: "HEALTH_RESTRICTION_BLOCKED", status: 409 };
      }
      throw error;
    }
    const existing = await tx.booking.findMany({
      where: {
        userId, friendOfferEntitlementId: right.id, userMembershipId: null,
        status: { in: ["confirmed", "attended", "noshow"] },
        NOT: {
          status: "noshow",
          rescheduleRequests: { some: { requestType: "past_absence_makeup", status: "approved" } },
        },
      },
      select: { status: true, entitlementUnits: true, schedule: { select: { date: true, time: true, classId: true } } },
    });
    if (right.totalSessions !== null &&
        sumMembershipBookingUnits(existing, ["confirmed", "attended", "noshow"]) >= right.totalSessions) {
      return { ok: false as const, code: "FRIEND_RIGHT_SESSIONS_EXHAUSTED", status: 409 };
    }
    const sameDay = existing.filter(b => cairoCalendarDateKey(scheduleSlotInstant(b.schedule.date,b.schedule.time)) === sessionDay);
    if (sameDay.length >= getFrozenMaxSessionsPerDay(policy, 2)) {
      return { ok: false as const, code: "DAILY_SESSION_LIMIT_REACHED", status: 409 };
    }
    if (getFrozenRequireDistinctClassesPerDay(policy) && sameDay.some(b => b.schedule.classId === schedule.classId)) {
      return { ok: false as const, code: "DISTINCT_CLASS_REQUIRED", status: 409 };
    }
    const conflict = await tx.booking.findFirst({
      where: { userId, status: { in: ["confirmed", "attended", "noshow"] },
        schedule: { date: schedule.date, time: schedule.time } },
      select: { id: true },
    });
    if (conflict) return { ok: false as const, code: "BOOKING_TIME_CONFLICT", status: 409 };
    const seat = await tx.schedule.updateMany({
      where: { id: scheduleId, isActive: true, availableSpots: { gt: 0 } },
      data: { availableSpots: { decrement: 1 } },
    });
    if (seat.count !== 1) return { ok: false as const, code: "SCHEDULE_FULL", status: 409 };
    const booked = await tx.booking.create({
      data: {
        userId, scheduleId, userMembershipId: null,
        friendOfferEntitlementId: right.id, status: "confirmed", paidAmount: 0,
        paymentMethod: "friend_offer", entitlementUnits: 1,
      }, select: { id: true },
    });
    await tx.notification.create({
      data: { userId, title: `تم حجز ${schedule.class.name}`, body: "تم تأكيد الحجز من حصص عرض الصحاب.", type: "success" },
    });
    return { ok: true as const, bookingId: booked.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (!result.ok) {
    return NextResponse.json({
      error: "تعذر استخدام حق عرض الصحاب لهذا الحجز.", code: result.code,
    }, { status: result.status });
  }
  return NextResponse.json({ success: true, bookingId: result.bookingId,
    friendOfferEntitlementId: entitlementId, message: "تم تأكيد الحجز من عرض الصحاب." });
}
