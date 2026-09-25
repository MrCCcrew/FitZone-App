import { db } from "@/lib/db";
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

  if (!isBookingOperational(booking)) {
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

  return db.$transaction(async (tx) => {
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
            userMembershipId:
              targetMembership.id,
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
            id: request.booking.id,
            status: "confirmed",
            scheduleId:
              request.booking.scheduleId,
          },
          data: {
            scheduleId:
              request.targetScheduleId,
            userMembershipId:
              targetMembership.id,
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
