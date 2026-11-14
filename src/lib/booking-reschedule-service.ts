import { asDbTransactionClient, db } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import {
  parseEligibilityPolicySnapshot,
  isClassAllowedByEligibilitySnapshot,
} from "@/lib/get-eligible-classes";
import { isBookingOperational } from "@/lib/booking-operational";
import {
  cairoCalendarDateKey,
  scheduleSlotInstant,
} from "@/lib/fitzone-time";
import {
  resolveMembershipClassEligibility,
} from "@/lib/membership-class-eligibility";
import {
  assertUserCanBookClassByHealth,
} from "@/lib/booking/health-booking-policy";
import {
  getFrozenMaxSessionsPerDay,
  getFrozenRequireDistinctClassesPerDay,
} from "@/lib/booking/booking-policy";

export type BookingRescheduleRequestType =
  | "upcoming_change"
  | "past_absence_makeup";

export type BookingRescheduleErrorCode =
  | "BOOKING_NOT_FOUND"
  | "BOOKING_NOT_OPERATIONAL"
  | "BOOKING_NOT_ELIGIBLE"
  | "EXCHANGE_RESCHEDULE_NOT_ALLOWED"
  | "CURRENT_SLOT_PASSED"
  | "CURRENT_SLOT_TOO_CLOSE"
  | "CURRENT_SLOT_NOT_PASSED"
  | "ABSENCE_REASON_REQUIRED"
  | "ABSENCE_REASON_TOO_LONG"
  | "SAME_SCHEDULE"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_ACTIVE"
  | "TARGET_SLOT_PASSED"
  | "TARGET_FULL"
  | "NO_ELIGIBLE_MEMBERSHIP"
  | "CLASS_NOT_INCLUDED"
  | "HEALTH_RESTRICTION_BLOCKED"
  | "RESCHEDULE_ALREADY_PENDING"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_REVIEWED"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "TARGET_ALREADY_BOOKED"
  | "NO_TARGET_MEMBERSHIP"
  | "TARGET_OUTSIDE_MEMBERSHIP_PERIOD"
  | "DAILY_SESSION_LIMIT_REACHED"
  | "DISTINCT_CLASS_REQUIRED"
  | "BOOKING_CHANGED";

export class BookingRescheduleDomainError extends Error {
  readonly code: BookingRescheduleErrorCode;
  readonly details?: {
    requestId?: string;
  };

  constructor(
    code: BookingRescheduleErrorCode,
    details?: {
      requestId?: string;
    },
  ) {
    super(code);
    this.name = "BookingRescheduleDomainError";
    this.code = code;
    this.details = details;
  }
}

function fail(
  code: BookingRescheduleErrorCode,
  details?: {
    requestId?: string;
  },
): never {
  throw new BookingRescheduleDomainError(code, details);
}

async function validateIndependentOfferReplacement(
  tx: ReturnType<typeof asDbTransactionClient>,
  input: {
    userId: string;
    bookingId: string;
    entitlementId: string;
    targetScheduleId: string;
    isPastAbsence: boolean;
    restoreCancelled?: boolean;
  },
) {
  const entitlement = await tx.offerBoxEntitlement.findUnique({
    where: { id: input.entitlementId },
    include: {
      purchase: {
        select: {
          userId: true,
          status: true,
          paidAt: true,
          redeemedUserMembershipId: true,
        },
      },
    },
  });

  if (
    !entitlement ||
    entitlement.userId !== input.userId ||
    entitlement.status !== "active" ||
    entitlement.purchase.userId !== input.userId ||
    entitlement.purchase.status !== "redeemed" ||
    !entitlement.purchase.paidAt ||
    entitlement.purchase.redeemedUserMembershipId !== null
  ) {
    fail("BOOKING_NOT_OPERATIONAL");
  }

  const original = await tx.booking.findUnique({
    where: { id: input.bookingId },
  });

  if (
    !original ||
    original.userId !== input.userId ||
    original.userMembershipId !== null ||
    original.offerBoxEntitlementId !== entitlement.id ||
    (input.restoreCancelled
      ? original.status !== "cancelled"
      : input.isPastAbsence
        ? !["confirmed", "noshow"].includes(original.status)
        : original.status !== "confirmed")
  ) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  if (
    original.scheduleId === input.targetScheduleId &&
    !input.restoreCancelled
  ) {
    fail("SAME_SCHEDULE");
  }

  if (
    input.restoreCancelled &&
    original.scheduleId !== input.targetScheduleId
  ) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  if (input.isPastAbsence) {
    const previous = await tx.bookingRescheduleRequest.findFirst({
      where: {
        bookingId: original.id,
        requestType: "past_absence_makeup",
        status: "approved",
      },
      select: { id: true },
    });

    if (previous) fail("BOOKING_NOT_ELIGIBLE");
  }

  const eligibility = parseEligibilityPolicySnapshot(
    entitlement.eligibilitySnapshot,
  );

  if (!eligibility || !entitlement.bookingPatternSnapshot) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  const target = await tx.schedule.findUnique({
    where: { id: input.targetScheduleId },
    include: { class: true },
  });

  if (!target) fail("TARGET_NOT_FOUND");

  if (!target.isActive || !target.class.isActive) {
    fail("TARGET_NOT_ACTIVE");
  }

  const now = new Date();
  const slot = scheduleSlotInstant(target.date, target.time);

  if (
    !Number.isFinite(slot.getTime()) ||
    slot.getTime() <= now.getTime()
  ) {
    fail("TARGET_SLOT_PASSED");
  }

  const day = cairoCalendarDateKey(slot);
  const start = cairoCalendarDateKey(entitlement.startDate);
  const end = cairoCalendarDateKey(entitlement.endDate);
  const today = cairoCalendarDateKey(now);

  if (
    today < start ||
    today > end ||
    day < start ||
    day > end
  ) {
    fail("TARGET_OUTSIDE_MEMBERSHIP_PERIOD");
  }

  if (!(await isClassAllowedByEligibilitySnapshot(
    eligibility,
    target.classId,
    tx,
  ))) {
    fail("CLASS_NOT_INCLUDED");
  }

  try {
    await assertUserCanBookClassByHealth(
      tx,
      input.userId,
      target.class.type,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "HEALTH_RESTRICTION_BLOCKED"
    ) {
      fail("HEALTH_RESTRICTION_BLOCKED");
    }

    throw error;
  }

  const conflict = await tx.booking.findFirst({
    where: {
      id: { not: original.id },
      userId: input.userId,
      status: { in: ["confirmed", "attended", "noshow"] },
      schedule: {
        date: target.date,
        time: target.time,
      },
    },
    select: { id: true },
  });

  if (conflict) fail("TARGET_ALREADY_BOOKED");

  const existing = await tx.booking.findMany({
    where: {
      id: { not: original.id },
      userId: input.userId,
      userMembershipId: null,
      offerBoxEntitlementId: entitlement.id,
      status: { in: ["confirmed", "attended", "noshow"] },
      NOT: {
        status: "noshow",
        rescheduleRequests: {
          some: {
            requestType: "past_absence_makeup",
            status: "approved",
          },
        },
      },
    },
    select: {
      entitlementUnits: true,
      schedule: {
        select: {
          date: true,
          time: true,
          classId: true,
        },
      },
    },
  });

  const units = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 1) {
      fail("BOOKING_NOT_ELIGIBLE");
    }
    return value;
  };

  const allocated = existing.reduce(
    (sum, row) => sum + units(row.entitlementUnits),
    0,
  );

  if (
    entitlement.totalSessions !== null &&
    allocated + units(original.entitlementUnits) >
      entitlement.totalSessions
  ) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  const sameDay = existing.filter((row) =>
    cairoCalendarDateKey(
      scheduleSlotInstant(
        row.schedule.date,
        row.schedule.time,
      ),
    ) === day,
  );

  const limit = getFrozenMaxSessionsPerDay(
    entitlement.bookingPatternSnapshot,
    2,
  );

  if (sameDay.length >= limit) {
    fail("DAILY_SESSION_LIMIT_REACHED");
  }

  if (
    getFrozenRequireDistinctClassesPerDay(
      entitlement.bookingPatternSnapshot,
    ) &&
    sameDay.some(
      (row) => row.schedule.classId === target.classId,
    )
  ) {
    fail("DISTINCT_CLASS_REQUIRED");
  }

  return {
    entitlementId: entitlement.id,
    originalUnits: units(original.entitlementUnits),
  };
}

function normalizeRequestType(
  value: BookingRescheduleRequestType | undefined,
): BookingRescheduleRequestType {
  return value === "past_absence_makeup"
    ? "past_absence_makeup"
    : "upcoming_change";
}

/**
 * CUSTOMER BUSINESS ACTION
 *
 * Creates a pending booking reschedule request only.
 *
 * No Booking or Schedule mutation is allowed here.
 * The target seat is NOT reserved until admin approval.
 */
export async function createBookingRescheduleRequest(input: {
  userId: string;
  bookingId: string;
  targetScheduleId: string;
  requestType?: BookingRescheduleRequestType;
  absenceReason?: string | null;
}) {
  const requestType = normalizeRequestType(input.requestType);
  const isPastAbsence =
    requestType === "past_absence_makeup";

  const booking = await db.booking.findFirst({
    where: {
      id: input.bookingId,
      userId: input.userId,
    },
    include: {
      classExchange: {
        select: {
          id: true,
          status: true,
        },
      },
      userMembership: {
        select: {
          status: true,
        },
      },
      schedule: {
        include: {
          class: true,
        },
      },
    },
  });

  if (!booking) {
    fail("BOOKING_NOT_FOUND");
  }

  /*
   * A class-exchange booking is a one-time administrative exception
   * outside the membership's ordinary eligibility.
   *
   * It must never enter the normal customer reschedule or
   * past-absence makeup workflow, because those flows may:
   * - re-resolve normal membership eligibility,
   * - move the booking to another membership,
   * - or create a new one-unit makeup booking.
   */
  if (booking.classExchange) {
    fail("EXCHANGE_RESCHEDULE_NOT_ALLOWED");
  }

  const isActiveMembershipNoshowMakeup =
    isPastAbsence &&
    booking.status === "noshow" &&
    (
      booking.userMembership?.status === "active" ||
      (
        booking.offerBoxEntitlementId !== null &&
        booking.userMembershipId === null
      )
    );

  if (
    !isBookingOperational(booking) &&
    !isActiveMembershipNoshowMakeup
  ) {
    fail("BOOKING_NOT_OPERATIONAL");
  }

  if (
    isPastAbsence
      ? !["confirmed", "noshow"].includes(booking.status)
      : booking.status !== "confirmed"
  ) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  /*
   * Authoritative schedule-time rule.
   *
   * Schedule.date is a calendar anchor and Schedule.time is Cairo local time.
   * Never derive a session instant with Date.setHours() because the server
   * process runs in UTC.
   */
  const currentSlot = scheduleSlotInstant(
    new Date(booking.schedule.date),
    booking.schedule.time,
  );

  const now = new Date();

  if (!isPastAbsence) {
    if (currentSlot.getTime() <= now.getTime()) {
      fail("CURRENT_SLOT_PASSED");
    }

    if (
      currentSlot.getTime() - now.getTime() <
      4 * 60 * 60 * 1000
    ) {
      fail("CURRENT_SLOT_TOO_CLOSE");
    }
  } else {
    if (currentSlot.getTime() > now.getTime()) {
      fail("CURRENT_SLOT_NOT_PASSED");
    }

    const reason = input.absenceReason?.trim() ?? "";

    if (reason.length < 3) {
      fail("ABSENCE_REASON_REQUIRED");
    }

    if (reason.length > 1000) {
      fail("ABSENCE_REASON_TOO_LONG");
    }
  }

  if (input.targetScheduleId === booking.scheduleId) {
    fail("SAME_SCHEDULE");
  }

  const targetSchedule = await db.schedule.findUnique({
    where: {
      id: input.targetScheduleId,
    },
    include: {
      class: true,
    },
  });

  if (!targetSchedule) {
    fail("TARGET_NOT_FOUND");
  }

  if (!targetSchedule.isActive) {
    fail("TARGET_NOT_ACTIVE");
  }

  try {
    await assertUserCanBookClassByHealth(
      db,
      input.userId,
      targetSchedule.class.type,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "HEALTH_RESTRICTION_BLOCKED"
    ) {
      fail("HEALTH_RESTRICTION_BLOCKED");
    }

    throw error;
  }

  const targetSlot = scheduleSlotInstant(
    new Date(targetSchedule.date),
    targetSchedule.time,
  );

  if (targetSlot.getTime() <= now.getTime()) {
    fail("TARGET_SLOT_PASSED");
  }

  /*
   * UX pre-check only.
   *
   * Capacity is authoritatively claimed during approval with an atomic
   * updateMany(availableSpots > 0). This read must never be treated as the
   * reservation guarantee.
   */
  if (targetSchedule.availableSpots <= 0) {
    fail("TARGET_FULL");
  }

  /*
   * Preserve the current business policy:
   * request creation requires a currently active membership.
   *
   * Whether past-absence make-up should be grantable after contractual
   * membership expiry is a separate, currently unproven business-policy
   * question and is deliberately NOT changed by this refactor.
   */
  if (booking.offerBoxEntitlementId) {
    if (booking.userMembershipId !== null) {
      fail("BOOKING_NOT_ELIGIBLE");
    }

    await db.$transaction(async (tx) => {
      await validateIndependentOfferReplacement(
        asDbTransactionClient(tx),
        {
          userId: input.userId,
          bookingId: booking.id,
          entitlementId: booking.offerBoxEntitlementId!,
          targetScheduleId: targetSchedule.id,
          isPastAbsence,
        },
      );
    });
  } else {
  const activeMemberships = await db.userMembership.findMany({
    where: {
      userId: input.userId,
      status: "active",
      startDate: {
        lte: now,
      },
      endDate: {
        gte: now,
      },
    },
    orderBy: [
      { endDate: "asc" },
      { startDate: "asc" },
    ],
    include: {
      membership: {
        select: {
          classSessions: true,
        },
      },
    },
  });

  const eligibility =
    await resolveMembershipClassEligibility({
      userId: input.userId,
      classes: [targetSchedule.class],
      now,
      memberships: activeMemberships,
    });

  if (!eligibility.hasEligibleMembership) {
    fail("NO_ELIGIBLE_MEMBERSHIP");
  }

  if (
    !eligibility.unrestricted &&
    !eligibility.allowedClassIds.includes(
      targetSchedule.class.id,
    )
  ) {
    fail("CLASS_NOT_INCLUDED");
  }


  }
  const existingRequest =
    await db.bookingRescheduleRequest.findUnique({
      where: {
        pendingKey: booking.id,
      },
      select: {
        id: true,
      },
    });

  if (existingRequest) {
    fail("RESCHEDULE_ALREADY_PENDING", {
      requestId: existingRequest.id,
    });
  }

  let request: {
    id: string;
  };

  try {
    request = await db.bookingRescheduleRequest.create({
      data: {
        bookingId: booking.id,
        targetScheduleId: targetSchedule.id,
        requestType,
        absenceReason:
          isPastAbsence
            ? input.absenceReason?.trim() || null
            : null,
        status: "pending",
        pendingKey: booking.id,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    /*
     * pendingKey is unique.
     * This is the race-safe duplicate-request guard.
     */
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const concurrentRequest =
        await db.bookingRescheduleRequest.findUnique({
          where: {
            pendingKey: booking.id,
          },
          select: {
            id: true,
          },
        });

      fail("RESCHEDULE_ALREADY_PENDING", {
        requestId: concurrentRequest?.id,
      });
    }

    throw error;
  }

  /*
   * Notifications are side effects of the successfully-created request.
   * Booking and Schedule remain untouched.
   */
  const [admins, member] = await Promise.all([
    db.user.findMany({
      where: {
        role: "admin",
      },
      select: {
        id: true,
      },
    }),
    db.user.findUnique({
      where: {
        id: input.userId,
      },
      select: {
        name: true,
      },
    }),
  ]);

  if (admins.length > 0) {
    await Promise.all(
      admins.map((admin) =>
        db.notification.create({
          data: {
            userId: admin.id,
            title:
              isPastAbsence
                ? "طلب تعويض حصة سابقة"
                : "طلب تغيير موعد جديد",
            body:
              isPastAbsence
                ? `${member?.name ?? "عضو"} طلب تعويض حصة سابقة "${booking.schedule.class.name}". ` +
                  `سبب عدم الحضور: ${input.absenceReason?.trim() || "-"}. ` +
                  `الموعد المطلوب ${targetSchedule.time} بتاريخ ${targetSchedule.date.toLocaleDateString("ar-EG")}.`
                : `${member?.name ?? "عضو"} طلب تغيير موعد ` +
                  `"${booking.schedule.class.name}" ` +
                  `إلى ${targetSchedule.time} بتاريخ ` +
                  `${targetSchedule.date.toLocaleDateString("ar-EG")}.`,
            type: "warning",
          },
        }),
      ),
    );
  }

  await db.notification.create({
    data: {
      userId: input.userId,
      title:
        isPastAbsence
          ? "تم إرسال طلب تعويض الحصة"
          : "تم إرسال طلب تغيير الموعد",
      body:
        isPastAbsence
          ? `تم إرسال طلب تعويض الحصة السابقة إلى الإدارة للمراجعة. ` +
            `الموعد المطلوب ${targetSchedule.time} بتاريخ ${targetSchedule.date.toLocaleDateString("ar-EG")}. ` +
            `إرسال الطلب لا يعني الموافقة عليه.`
          : `تم إرسال طلب تغيير الموعد إلى ` +
            `${targetSchedule.time} بتاريخ ` +
            `${targetSchedule.date.toLocaleDateString("ar-EG")} ` +
            `وسيتم تطبيقه بعد موافقة الإدارة.`,
      type: "info",
    },
  });

  return {
    success: true as const,
    pendingApproval: true as const,
    requestId: request.id,
  };
}

export type ReviewBookingRescheduleResult =
  | {
      success: true;
      decision: "rejected";
      bookingId: string;
      requestId: string;
    }
  | {
      success: true;
      decision: "approved";
      bookingId: string;
      makeupBookingId: string | null;
      requestId: string;
      scheduleId: string;
    };

/**
 * ADMIN BUSINESS ACTION
 *
 * Reviews one pending reschedule request.
 *
 * The request claim + target capacity + booking mutation + make-up creation
 * happen inside one transaction.
 */
export async function reviewBookingRescheduleRequest(input: {
  requestId: string;
  decision: "approve" | "reject";
  reviewedByUserId: string;
  rejectionReason?: string | null;
}): Promise<ReviewBookingRescheduleResult> {
  if (input.decision === "reject") {
    const request =
      await db.bookingRescheduleRequest.findUnique({
        where: {
          id: input.requestId,
        },
        include: {
          booking: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      });

    if (!request) {
      fail("REQUEST_NOT_FOUND");
    }

    const reviewedAt = new Date();

    const result = await db.$transaction(
      async (tx) => {
        const claimed =
          await tx.bookingRescheduleRequest.updateMany({
            where: {
              id: request.id,
              status: "pending",
              pendingKey: request.bookingId,
            },
            data: {
              status: "rejected",
              pendingKey: null,
              reviewedAt,
              reviewedByUserId:
                input.reviewedByUserId,
              rejectionReason:
                input.rejectionReason?.trim() || null,
            },
          });

        if (claimed.count !== 1) {
          fail("REQUEST_ALREADY_REVIEWED");
        }

        await tx.notification.create({
          data: {
            userId: request.booking.userId,
            title: "تم رفض طلب تغيير الموعد",
            body:
              input.rejectionReason?.trim()
                ? `تم رفض طلب تغيير الموعد. السبب: ${input.rejectionReason.trim()}`
                : "تم رفض طلب تغيير الموعد، وسيظل موعد الحجز الحالي كما هو.",
            type: "warning",
          },
        });

        return {
          success: true as const,
          decision: "rejected" as const,
          bookingId: request.booking.id,
          requestId: request.id,
        };
      },
    );

    return result;
  }

  const reviewedAt = new Date();

  const approvalIdentity =
    await db.bookingRescheduleRequest.findUnique({
      where: { id: input.requestId },
      select: {
        bookingId: true,
        targetScheduleId: true,
        booking: {
          select: {
            userId: true,
            scheduleId: true,
            offerBoxEntitlementId: true,
          },
        },
      },
    });

  return db.$transaction(async (tx) => {
    if (approvalIdentity?.booking.offerBoxEntitlementId) {
      await lockMembershipLifecycleUserTx(
        asDbTransactionClient(tx),
        approvalIdentity.booking.userId,
      );

      await tx.$queryRaw`
        SELECT id FROM OfferBoxEntitlement
        WHERE id = ${approvalIdentity.booking.offerBoxEntitlementId}
        FOR UPDATE
      `;

      const scheduleIds = [
        ...new Set([
          approvalIdentity.booking.scheduleId,
          approvalIdentity.targetScheduleId,
        ]),
      ].sort();

      for (const scheduleId of scheduleIds) {
        await tx.$queryRaw`
          SELECT id FROM Schedule
          WHERE id = ${scheduleId}
          FOR UPDATE
        `;
      }

      await tx.$queryRaw`
        SELECT id FROM Booking
        WHERE id = ${approvalIdentity.bookingId}
        FOR UPDATE
      `;
    }

    const request =
      await tx.bookingRescheduleRequest.findUnique({
        where: {
          id: input.requestId,
        },
        include: {
          booking: {
            include: {
              schedule: {
                include: {
                  class: true,
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
              class: true,
            },
          },
        },
      });

    if (!request) {
      fail("REQUEST_NOT_FOUND");
    }

    if (
      request.status !== "pending" ||
      request.pendingKey !== request.bookingId
    ) {
      fail("REQUEST_ALREADY_REVIEWED");
    }

    if (
      request.booking.offerBoxEntitlementId &&
      (
        request.booking.userMembershipId !== null ||
        request.booking.offerBoxEntitlementId !==
          approvalIdentity?.booking.offerBoxEntitlementId ||
        request.booking.userId !==
          approvalIdentity?.booking.userId ||
        request.booking.scheduleId !==
          approvalIdentity?.booking.scheduleId ||
        request.targetScheduleId !==
          approvalIdentity?.targetScheduleId
      )
    ) {
      fail("BOOKING_CHANGED");
    }

    const isPastAbsenceMakeup =
      request.requestType ===
      "past_absence_makeup";

    if (
      isPastAbsenceMakeup
        ? !["confirmed", "noshow"].includes(
            request.booking.status,
          )
        : request.booking.status !== "confirmed"
    ) {
      fail("BOOKING_NOT_ELIGIBLE");
    }

    /*
     * Preserve existing policy exactly:
     * the original membership must still be active at approval.
     */
    if (
      request.booking.userMembershipId &&
      request.booking.userMembership?.status !==
        "active"
    ) {
      fail("MEMBERSHIP_NOT_ACTIVE");
    }

    if (
      request.targetScheduleId ===
      request.booking.scheduleId
    ) {
      fail("SAME_SCHEDULE");
    }

    if (!request.targetSchedule.isActive) {
      fail("TARGET_NOT_ACTIVE");
    }

    const now = new Date();

    /*
     * Authoritative Cairo session instants.
     *
     * This intentionally replaces the old Date.setHours()-based helper,
     * which interpreted class times in the server's UTC timezone.
     */
    const currentSlot = scheduleSlotInstant(
      new Date(request.booking.schedule.date),
      request.booking.schedule.time,
    );

    if (!isPastAbsenceMakeup) {
      if (
        currentSlot.getTime() <= now.getTime()
      ) {
        fail("CURRENT_SLOT_PASSED");
      }

      if (
        currentSlot.getTime() - now.getTime() <
        4 * 60 * 60 * 1000
      ) {
        fail("CURRENT_SLOT_TOO_CLOSE");
      }
    } else {
      if (
        currentSlot.getTime() > now.getTime()
      ) {
        fail("CURRENT_SLOT_NOT_PASSED");
      }

      if (
        !request.absenceReason ||
        request.absenceReason.trim().length < 3
      ) {
        fail("ABSENCE_REASON_REQUIRED");
      }
    }

    const targetSlot = scheduleSlotInstant(
      new Date(request.targetSchedule.date),
      request.targetSchedule.time,
    );

    if (targetSlot.getTime() <= now.getTime()) {
      fail("TARGET_SLOT_PASSED");
    }

    const duplicate = await tx.booking.findFirst({
      where: {
        id: {
          not: request.booking.id,
        },
        userId: request.booking.userId,
        scheduleId: request.targetScheduleId,
        status: {
          in: ["confirmed", "attended"],
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      fail("TARGET_ALREADY_BOOKED");
    }

    /*
     * Preserve current policy: approval selects only a currently-active
     * membership and does not extend contractual endDate.
     */
    let targetMembershipId: string | null = null;
    let independentEntitlementId: string | null = null;
    let independentOriginalUnits = 1;

    if (request.booking.offerBoxEntitlementId) {
      const validated = await validateIndependentOfferReplacement(
        asDbTransactionClient(tx),
        {
          userId: request.booking.userId,
          bookingId: request.booking.id,
          entitlementId: request.booking.offerBoxEntitlementId,
          targetScheduleId: request.targetScheduleId,
          isPastAbsence: isPastAbsenceMakeup,
        },
      );

      independentEntitlementId = validated.entitlementId;
      independentOriginalUnits = validated.originalUnits;
    } else {
    const activeMemberships =
      await tx.userMembership.findMany({
        where: {
          userId: request.booking.userId,
          status: "active",
          startDate: {
            lte: now,
          },
          endDate: {
            gte: now,
          },
        },
        orderBy: [
          { endDate: "asc" },
          { startDate: "asc" },
        ],
        include: {
          membership: {
            select: {
              classSessions: true,
            },
          },
        },
      });

    const eligibility =
      await resolveMembershipClassEligibility({
        userId: request.booking.userId,
        classes: [request.targetSchedule.class],
        now,
        memberships: activeMemberships,
      });

    if (!eligibility.hasEligibleMembership) {
      fail("NO_ELIGIBLE_MEMBERSHIP");
    }

    if (
      !eligibility.unrestricted &&
      !eligibility.allowedClassIds.includes(
        request.targetSchedule.class.id,
      )
    ) {
      fail("CLASS_NOT_INCLUDED");
    }

    try {
      await assertUserCanBookClassByHealth(
        tx,
        request.booking.userId,
        request.targetSchedule.class.type,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "HEALTH_RESTRICTION_BLOCKED"
      ) {
        fail("HEALTH_RESTRICTION_BLOCKED");
      }

      throw error;
    }

    const currentMembership =
      activeMemberships.find(
        (membership) =>
          membership.id ===
          request.booking.userMembershipId,
      );

    const grantingIds = new Set(
      eligibility.membershipIdsByClass[
        request.targetSchedule.class.id
      ] ?? [],
    );

    let targetMembership:
      | (typeof activeMemberships)[number]
      | null = null;

    /*
     * Keep the original membership when possible.
     * Otherwise use the earliest-expiring granting membership.
     */
    if (
      currentMembership &&
      grantingIds.has(currentMembership.id)
    ) {
      targetMembership = currentMembership;
    }

    if (!targetMembership) {
      targetMembership =
        activeMemberships.find((membership) =>
          grantingIds.has(membership.id),
        ) ?? null;
    }

    if (!targetMembership) {
      fail("NO_TARGET_MEMBERSHIP");
    }

    const targetDay =
      cairoCalendarDateKey(targetSlot);

    const membershipStartDay =
      cairoCalendarDateKey(
        targetMembership.startDate,
      );

    const membershipEndDay =
      cairoCalendarDateKey(
        targetMembership.endDate,
      );

    if (
      targetDay < membershipStartDay ||
      targetDay > membershipEndDay
    ) {
      fail("TARGET_OUTSIDE_MEMBERSHIP_PERIOD");
    }

    const maxSessionsPerDay =
      getFrozenMaxSessionsPerDay(
        targetMembership.bookingPatternSnapshot,
        2,
      );

    const requireDistinctClassesPerDay =
      getFrozenRequireDistinctClassesPerDay(
        targetMembership.bookingPatternSnapshot,
      );

    const targetMembershipBookings =
      await tx.booking.findMany({
        where: {
          userMembershipId:
            targetMembership.id,
          id: {
            not: request.booking.id,
          },
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

    const sameDayBookings =
      targetMembershipBookings.filter(
        (booking) =>
          cairoCalendarDateKey(
            scheduleSlotInstant(
              booking.schedule.date,
              booking.schedule.time,
            ),
          ) === targetDay,
      );

    if (
      sameDayBookings.length >=
      maxSessionsPerDay
    ) {
      fail("DAILY_SESSION_LIMIT_REACHED");
    }

    if (
      requireDistinctClassesPerDay &&
      sameDayBookings.some(
        (booking) =>
          booking.schedule.classId ===
          request.targetSchedule.classId,
      )
    ) {
      fail("DISTINCT_CLASS_REQUIRED");
    }

      targetMembershipId = targetMembership.id;
    }
    /*
     * Atomic request claim.
     *
     * Only one reviewer may transition this request out of pending.
     */
    const claimed =
      await tx.bookingRescheduleRequest.updateMany({
        where: {
          id: request.id,
          status: "pending",
          pendingKey: request.bookingId,
        },
        data: {
          status: "approved",
          pendingKey: null,
          reviewedAt,
          reviewedByUserId:
            input.reviewedByUserId,
          rejectionReason: null,
        },
      });

    if (claimed.count !== 1) {
      fail("REQUEST_ALREADY_REVIEWED");
    }

    /*
     * Authoritative atomic seat reservation.
     *
     * The customer-side availableSpots check is only advisory.
     */
    const targetSeat =
      await tx.schedule.updateMany({
        where: {
          id: request.targetScheduleId,
          isActive: true,
          availableSpots: {
            gt: 0,
          },
        },
        data: {
          availableSpots: {
            decrement: 1,
          },
        },
      });

    if (targetSeat.count !== 1) {
      fail("TARGET_FULL");
    }

    let makeupBookingId: string | null =
      null;

    if (isPastAbsenceMakeup) {
      /*
       * Historical absence:
       *
       * - preserve the historical booking
       * - classify confirmed historical booking as noshow
       * - do NOT release the historical seat because the class already passed
       * - create one zero-value marked replacement booking
       */
      const historicalBookingStillValid =
        await tx.booking.findFirst({
          where: {
            ...(independentEntitlementId
              ? {
                  userMembershipId: null,
                  offerBoxEntitlementId: independentEntitlementId,
                }
              : {}),
            id: request.booking.id,
            userId: request.booking.userId,
            scheduleId:
              request.booking.scheduleId,
            status: {
              in: ["confirmed", "noshow"],
            },
          },
          select: {
            id: true,
            status: true,
            paymentMethod: true,
          },
        });

      if (!historicalBookingStillValid) {
        fail("BOOKING_CHANGED");
      }

      if (
        historicalBookingStillValid.status ===
        "confirmed"
      ) {
        const markedNoShow =
          await tx.booking.updateMany({
            where: {
                ...(independentEntitlementId
                  ? {
                      userMembershipId: null,
                      offerBoxEntitlementId: independentEntitlementId,
                      scheduleId: request.booking.scheduleId,
                    }
                  : {}),
              id:
                historicalBookingStillValid.id,
              status: "confirmed",
            },
            data: {
              status: "noshow",
            },
          });

        if (markedNoShow.count !== 1) {
          fail("BOOKING_CHANGED");
        }
      }

      const makeupBooking =
        await tx.booking.create({
          data: {
            userId: request.booking.userId,
            scheduleId:
              request.targetScheduleId,
            userMembershipId: targetMembershipId,
            ...(independentEntitlementId
              ? {
                  offerBoxEntitlementId: independentEntitlementId,
                  entitlementUnits: independentOriginalUnits,
                }
              : {}),
            status: "confirmed",

            /*
             * Past-absence make-up invariant.
             *
             * This is an entitlement replacement, never a second sale.
             */
            isMakeup: true,
            makeupReason:
              "past_absence_makeup",
            paidAmount: 0,
            paymentMethod:
              historicalBookingStillValid.paymentMethod,
          },
          select: {
            id: true,
          },
        });

      makeupBookingId = makeupBooking.id;
    } else {
      /*
       * Upcoming reschedule:
       * move the SAME booking and release its old future seat.
       */
      const movedBooking =
        await tx.booking.updateMany({
          where: {
            ...(independentEntitlementId
              ? {
                  userMembershipId: null,
                  offerBoxEntitlementId: independentEntitlementId,
                }
              : {}),
            id: request.booking.id,
            status: "confirmed",
            scheduleId:
              request.booking.scheduleId,
          },
          data: {
            scheduleId:
              request.targetScheduleId,
            userMembershipId: targetMembershipId,
            ...(independentEntitlementId
              ? { offerBoxEntitlementId: independentEntitlementId }
              : {}),
          },
        });

      if (movedBooking.count !== 1) {
        fail("BOOKING_CHANGED");
      }

      await tx.schedule.update({
        where: {
          id: request.booking.scheduleId,
        },
        data: {
          availableSpots: {
            increment: 1,
          },
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: request.booking.userId,
        title:
          isPastAbsenceMakeup
            ? `تمت الموافقة على تعويض حصة ${request.targetSchedule.class.name}`
            : `تمت الموافقة على تغيير موعد ${request.targetSchedule.class.name}`,
        body:
          isPastAbsenceMakeup
            ? `تمت الموافقة على طلب تعويض الحصة السابقة، وتم تحديد الموعد الجديد ` +
              `${request.targetSchedule.time} بتاريخ ` +
              `${request.targetSchedule.date.toLocaleDateString("ar-EG")}.`
            : `تم تغيير موعد الحجز إلى ` +
              `${request.targetSchedule.time} بتاريخ ` +
              `${request.targetSchedule.date.toLocaleDateString("ar-EG")}.`,
        type: "success",
      },
    });

    return {
      success: true as const,
      decision: "approved" as const,
      bookingId: request.booking.id,
      makeupBookingId,
      requestId: request.id,
      scheduleId:
        request.targetScheduleId,
    };
  });
}

/**
 * Explicit administrative action on an independent Offer Box booking.
 * Never creates a membership, payment, sale or commission.
 */
export async function applyIndependentOfferAdminBookingAction(
  input: {
    bookingId: string;
    action: "confirm" | "reschedule";
    targetScheduleId?: string;
    reviewedByUserId: string;
  },
) {
  const initial = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      userId: true,
      scheduleId: true,
      offerBoxEntitlementId: true,
      userMembershipId: true,
    },
  });

  if (!initial) fail("BOOKING_NOT_FOUND");

  if (
    !initial.offerBoxEntitlementId ||
    initial.userMembershipId !== null
  ) {
    fail("BOOKING_NOT_ELIGIBLE");
  }

  const entitlementId = initial.offerBoxEntitlementId;
  const restore = input.action === "confirm";

  const targetId = restore
    ? initial.scheduleId
    : input.targetScheduleId;

  if (!targetId) fail("TARGET_NOT_FOUND");

  return db.$transaction(async (tx) => {
    await lockMembershipLifecycleUserTx(
      asDbTransactionClient(tx),
      initial.userId,
    );

    await tx.$queryRaw`
      SELECT id FROM OfferBoxEntitlement
      WHERE id = ${entitlementId}
      FOR UPDATE
    `;

    const scheduleIds = [
      ...new Set([initial.scheduleId, targetId]),
    ].sort();

    for (const scheduleId of scheduleIds) {
      await tx.$queryRaw`
        SELECT id FROM Schedule
        WHERE id = ${scheduleId}
        FOR UPDATE
      `;
    }

    await tx.$queryRaw`
      SELECT id FROM Booking
      WHERE id = ${initial.id}
      FOR UPDATE
    `;

    const booking = await tx.booking.findUnique({
      where: { id: initial.id },
      include: {
        schedule: { include: { class: true } },
        classExchange: { select: { id: true } },
      },
    });

    if (!booking) fail("BOOKING_NOT_FOUND");

    if (
      booking.userId !== initial.userId ||
      booking.scheduleId !== initial.scheduleId ||
      booking.offerBoxEntitlementId !== entitlementId ||
      booking.userMembershipId !== null ||
      booking.classExchange
    ) {
      fail("BOOKING_CHANGED");
    }

    if (restore && booking.status === "confirmed") {
      return {
        success: true as const,
        alreadyConfirmed: true as const,
      };
    }

    if (
      !restore &&
      booking.status === "confirmed" &&
      booking.scheduleId === targetId
    ) {
      return {
        success: true as const,
        alreadySameSchedule: true as const,
      };
    }

    if (
      restore
        ? booking.status !== "cancelled"
        : booking.status !== "confirmed"
    ) {
      fail("BOOKING_NOT_ELIGIBLE");
    }

    const target = await tx.schedule.findUnique({
      where: { id: targetId },
      include: { class: true },
    });

    if (!target) fail("TARGET_NOT_FOUND");

    // Preserve the existing direct admin reschedule policy.
    // Cross-class customer requests remain a separate workflow.
    if (target.classId !== booking.schedule.classId) {
      fail("CLASS_NOT_INCLUDED");
    }

    if (!restore) {
      const oldSlot = scheduleSlotInstant(
        booking.schedule.date,
        booking.schedule.time,
      );

      if (
        !Number.isFinite(oldSlot.getTime()) ||
        oldSlot.getTime() <= Date.now()
      ) {
        fail("CURRENT_SLOT_PASSED");
      }
    }

    await validateIndependentOfferReplacement(
      asDbTransactionClient(tx),
      {
        userId: booking.userId,
        bookingId: booking.id,
        entitlementId,
        targetScheduleId: targetId,
        isPastAbsence: false,
        restoreCancelled: restore,
      },
    );

    const seat = await tx.schedule.updateMany({
      where: {
        id: targetId,
        isActive: true,
        availableSpots: { gt: 0 },
      },
      data: {
        availableSpots: { decrement: 1 },
      },
    });

    if (seat.count !== 1) fail("TARGET_FULL");

    const claimed = await tx.booking.updateMany({
      where: {
        id: booking.id,
        userId: booking.userId,
        offerBoxEntitlementId: entitlementId,
        userMembershipId: null,
        scheduleId: booking.scheduleId,
        status: restore ? "cancelled" : "confirmed",
      },
      data: {
        status: "confirmed",
        scheduleId: targetId,
      },
    });

    if (claimed.count !== 1) fail("BOOKING_CHANGED");

    if (!restore) {
      await tx.schedule.update({
        where: { id: booking.scheduleId },
        data: {
          availableSpots: { increment: 1 },
        },
      });
    }

    // A direct admin action supersedes pending requests
    // for this exact booking. Do not leave stale approvals.
    await tx.bookingRescheduleRequest.updateMany({
      where: {
        bookingId: booking.id,
        status: "pending",
      },
      data: {
        status: "cancelled",
        pendingKey: null,
        reviewedAt: new Date(),
        reviewedByUserId: input.reviewedByUserId,
      },
    });

    await tx.notification.create({
      data: {
        userId: booking.userId,
        title: restore
          ? `تمت إعادة تفعيل حجز ${target.class.name}`
          : `تم تغيير موعد ${target.class.name}`,
        body: restore
          ? "تمت إعادة تفعيل الحجز من حقوق العرض المستقل."
          : `تم تعديل موعد حجز العرض إلى ${target.time} بتاريخ ${target.date.toLocaleDateString("ar-EG")}.`,
        type: "success",
      },
    });

    return {
      success: true as const,
      bookingId: booking.id,
      offerBoxEntitlementId: entitlementId,
      scheduleId: targetId,
    };
  });
}
