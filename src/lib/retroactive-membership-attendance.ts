import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import {
  isClassAllowedByEligibilitySnapshot,
  parseEligibilityPolicySnapshot,
  type EligibilityPolicySnapshot,
} from "@/lib/get-eligible-classes";
import { scheduleSlotInstant } from "@/lib/fitzone-time";
import { getBookingEntitlementUnits } from "@/lib/membership-session-units";

export type RetroactiveAttendanceErrorCode =
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "FINITE_MEMBERSHIP_REQUIRED"
  | "ELIGIBILITY_SNAPSHOT_REQUIRED"
  | "NO_SCHEDULES_SELECTED"
  | "TOO_MANY_SCHEDULES"
  | "SCHEDULE_NOT_FOUND"
  | "FUTURE_SESSION"
  | "CLASS_NOT_ALLOWED"
  | "BOOKING_ALREADY_LINKED"
  | "TIME_CONFLICT"
  | "PAST_SESSION_FULL"
  | "NOT_ENOUGH_FUTURE_BOOKINGS"
  | "MEMBERSHIP_CHANGED";

export class RetroactiveAttendanceError extends Error {
  code: RetroactiveAttendanceErrorCode;

  constructor(
    code: RetroactiveAttendanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RetroactiveAttendanceError";
    this.code = code;
  }
}

type MembershipEligibilityRecord = {
  eligibilitySnapshot: string | null;
  bookingPatternSnapshot: string | null;
};

function resolveFrozenEligibility(
  membership: MembershipEligibilityRecord,
): EligibilityPolicySnapshot | null {
  const direct = parseEligibilityPolicySnapshot(
    membership.eligibilitySnapshot,
  );

  if (direct) return direct;

  if (!membership.bookingPatternSnapshot) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      membership.bookingPatternSnapshot,
    ) as {
      eligibility?: unknown;
    };

    if (!parsed?.eligibility) {
      return null;
    }

    return parseEligibilityPolicySnapshot(
      JSON.stringify(parsed.eligibility),
    );
  } catch {
    return null;
  }
}

function normalizeScheduleIds(values: string[]) {
  return [
    ...new Set(
      values
        .filter(
          (value) =>
            typeof value === "string" &&
            value.trim().length > 0,
        )
        .map((value) => value.trim()),
    ),
  ];
}

async function assertClassAllowed(
  snapshot: EligibilityPolicySnapshot,
  classId: string,
  client: any,
) {
  const allowed =
    await isClassAllowedByEligibilitySnapshot(
      snapshot,
      classId,
      client,
    );

  if (!allowed) {
    throw new RetroactiveAttendanceError(
      "CLASS_NOT_ALLOWED",
      "إحدى الحصص المختارة لا تتبع الكلاسات المسموحة لهذا الاشتراك.",
    );
  }
}

export async function listRetroactiveAttendanceCandidates(input: {
  userMembershipId: string;
  days?: number;
}) {
  const days = Math.min(
    365,
    Math.max(
      1,
      Math.floor(Number(input.days ?? 120)),
    ),
  );

  const membership =
    await db.userMembership.findUnique({
      where: {
        id: input.userMembershipId,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        totalSessions: true,
        eligibilitySnapshot: true,
        bookingPatternSnapshot: true,
      },
    });

  if (!membership) {
    throw new RetroactiveAttendanceError(
      "MEMBERSHIP_NOT_FOUND",
      "الاشتراك غير موجود.",
    );
  }

  if (membership.status !== "active") {
    throw new RetroactiveAttendanceError(
      "MEMBERSHIP_NOT_ACTIVE",
      "يمكن احتساب الحضور السابق على اشتراك فعال فقط.",
    );
  }

  if (
    membership.totalSessions == null ||
    membership.totalSessions <= 0
  ) {
    throw new RetroactiveAttendanceError(
      "FINITE_MEMBERSHIP_REQUIRED",
      "هذه العملية متاحة للاشتراكات محددة عدد الحصص فقط.",
    );
  }

  const eligibility =
    resolveFrozenEligibility(membership);

  if (!eligibility) {
    throw new RetroactiveAttendanceError(
      "ELIGIBILITY_SNAPSHOT_REQUIRED",
      "لا يمكن احتساب حضور سابق لهذا الاشتراك لعدم توفر بيانات الاستحقاق المجمدة.",
    );
  }

  const now = new Date();
  const from = new Date(
    now.getTime() -
      days * 24 * 60 * 60 * 1000,
  );

  const schedules =
    await db.schedule.findMany({
      where: {
        date: {
          gte: from,
          lte: now,
        },
      },
      include: {
        class: {
          include: {
            trainer: {
              select: {
                name: true,
              },
            },
          },
        },
        bookings: {
          where: {
            userId: membership.userId,
            status: {
              in: [
                "confirmed",
                "attended",
                "noshow",
              ],
            },
          },
          select: {
            id: true,
            status: true,
            userMembershipId: true,
          },
        },
      },
      orderBy: [
        {
          date: "desc",
        },
        {
          time: "desc",
        },
      ],
      take: 500,
    });

  const result: Array<{
    id: string;
    date: string;
    time: string;
    classId: string;
    className: string;
    trainerName: string;
    selectable: boolean;
    reason: string | null;
    hasStandaloneReservation: boolean;
  }> = [];

  for (const schedule of schedules) {
    const instant = scheduleSlotInstant(
      new Date(schedule.date),
      schedule.time,
    );

    if (instant.getTime() > now.getTime()) {
      continue;
    }

    const allowed =
      await isClassAllowedByEligibilitySnapshot(
        eligibility,
        schedule.classId,
      );

    if (!allowed) continue;

    const linkedBooking =
      schedule.bookings.find(
        (booking) =>
          booking.userMembershipId != null,
      );

    const standalone =
      schedule.bookings.find(
        (booking) =>
          booking.userMembershipId == null &&
          booking.status === "confirmed",
      );

    result.push({
      id: schedule.id,
      date: schedule.date.toISOString(),
      time: schedule.time,
      classId: schedule.classId,
      className: schedule.class.name,
      trainerName:
        schedule.class.trainer?.name ?? "",
      selectable: !linkedBooking,
      reason: linkedBooking
        ? "هذه الحصة مرتبطة بالفعل باشتراك للعميلة."
        : null,
      hasStandaloneReservation:
        Boolean(standalone),
    });
  }

  return {
    membershipId: membership.id,
    totalSessions:
      membership.totalSessions,
    schedules: result,
  };
}

export async function applyRetroactiveMembershipAttendance(input: {
  userMembershipId: string;
  scheduleIds: string[];
  adminUserId: string;
}) {
  const scheduleIds =
    normalizeScheduleIds(
      input.scheduleIds,
    );

  if (scheduleIds.length === 0) {
    throw new RetroactiveAttendanceError(
      "NO_SCHEDULES_SELECTED",
      "يجب اختيار حصة واحدة على الأقل.",
    );
  }

  if (scheduleIds.length > 20) {
    throw new RetroactiveAttendanceError(
      "TOO_MANY_SCHEDULES",
      "لا يمكن احتساب أكثر من 20 حصة في عملية واحدة.",
    );
  }

  const now = new Date();

  return db.$transaction(
    async (tx) => {
      /*
       * Serialize all entitlement changes for this membership.
       */
      const lockedMembershipRows =
        await tx.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT \`id\`
          FROM \`UserMembership\`
          WHERE \`id\` = ${input.userMembershipId}
          FOR UPDATE
        `;

      if (
        lockedMembershipRows.length !== 1
      ) {
        throw new RetroactiveAttendanceError(
          "MEMBERSHIP_NOT_FOUND",
          "الاشتراك غير موجود.",
        );
      }

      const membership =
        await tx.userMembership.findUnique({
          where: {
            id: input.userMembershipId,
          },
          include: {
            membership: {
              select: {
                name: true,
                sessionsCount: true,
              },
            },
          },
        });

      if (!membership) {
        throw new RetroactiveAttendanceError(
          "MEMBERSHIP_NOT_FOUND",
          "الاشتراك غير موجود.",
        );
      }

      if (membership.status !== "active") {
        throw new RetroactiveAttendanceError(
          "MEMBERSHIP_NOT_ACTIVE",
          "يمكن احتساب الحضور السابق على اشتراك فعال فقط.",
        );
      }

      const sessionLimit =
        membership.totalSessions ??
        membership.membership.sessionsCount ??
        null;

      if (
        sessionLimit == null ||
        sessionLimit <= 0
      ) {
        throw new RetroactiveAttendanceError(
          "FINITE_MEMBERSHIP_REQUIRED",
          "هذه العملية متاحة للاشتراكات محددة عدد الحصص فقط.",
        );
      }

      const eligibility =
        resolveFrozenEligibility(
          membership,
        );

      if (!eligibility) {
        throw new RetroactiveAttendanceError(
          "ELIGIBILITY_SNAPSHOT_REQUIRED",
          "لا يمكن احتساب حضور سابق لهذا الاشتراك لعدم توفر بيانات الاستحقاق المجمدة.",
        );
      }

      const selectedSchedules =
        await tx.schedule.findMany({
          where: {
            id: {
              in: scheduleIds,
            },
          },
          include: {
            class: true,
          },
        });

      if (
        selectedSchedules.length !==
        scheduleIds.length
      ) {
        throw new RetroactiveAttendanceError(
          "SCHEDULE_NOT_FOUND",
          "تعذر العثور على إحدى الحصص المختارة.",
        );
      }

      /*
       * Validate everything before the first business mutation.
       */
      const reusableStandaloneBookingIds =
        new Map<string, string>();

      for (
        const schedule of selectedSchedules
      ) {
        const instant =
          scheduleSlotInstant(
            new Date(schedule.date),
            schedule.time,
          );

        if (
          instant.getTime() >
          now.getTime()
        ) {
          throw new RetroactiveAttendanceError(
            "FUTURE_SESSION",
            "لا يمكن احتساب حصة لم يبدأ موعدها بعد كحضور سابق.",
          );
        }

        await assertClassAllowed(
          eligibility,
          schedule.classId,
          tx,
        );

        const existingLinked =
          await tx.booking.findFirst({
            where: {
              userId:
                membership.userId,
              scheduleId:
                schedule.id,
              userMembershipId: {
                not: null,
              },
            },
            select: {
              id: true,
            },
          });

        if (existingLinked) {
          throw new RetroactiveAttendanceError(
            "BOOKING_ALREADY_LINKED",
            "إحدى الحصص المختارة مرتبطة بالفعل باشتراك للعميلة.",
          );
        }

        const conflicts =
          await tx.booking.findMany({
            where: {
              userId:
                membership.userId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                  "noshow",
                ],
              },
              schedule: {
                date:
                  schedule.date,
                time:
                  schedule.time,
              },
            },
            select: {
              id: true,
              scheduleId: true,
              userMembershipId: true,
              status: true,
            },
          });

        const reusable =
          conflicts.find(
            (booking) =>
              booking.scheduleId ===
                schedule.id &&
              booking.userMembershipId ==
                null &&
              booking.status ===
                "confirmed",
          );

        const blocking =
          conflicts.find(
            (booking) =>
              !reusable ||
              booking.id !==
                reusable.id,
          );

        if (blocking) {
          throw new RetroactiveAttendanceError(
            "TIME_CONFLICT",
            "يوجد للعميلة حجز آخر محسوب في نفس اليوم والساعة.",
          );
        }

        if (reusable) {
          reusableStandaloneBookingIds.set(
            schedule.id,
            reusable.id,
          );
        } else if (
          schedule.availableSpots <= 0
        ) {
          throw new RetroactiveAttendanceError(
            "PAST_SESSION_FULL",
            "إحدى الحصص السابقة لا تحتوي على مقعد غير مسجل يمكن احتسابه بأمان.",
          );
        }
      }

      /*
       * Current entitlement occupancy.
       *
       * counted = confirmed + attended + noshow.
       * Adding historical attended bookings must never push this above
       * the purchased session entitlement.
       */
      const countedBookings =
        await tx.booking.findMany({
          where: {
            userMembershipId:
              membership.id,
            status: {
              in: [
                "confirmed",
                "attended",
                "noshow",
              ],
            },
          },
          select: {
            entitlementUnits: true,
          },
        });

      const currentEntitlementUnits =
        countedBookings.reduce(
          (sum, booking) =>
            sum +
            getBookingEntitlementUnits(
              booking,
            ),
          0,
        );

      const overflowToRelease =
        Math.max(
          0,
          currentEntitlementUnits +
            selectedSchedules.length -
            sessionLimit,
        );

      /*
       * Preserve the nearest future commitments and release the
       * furthest ordinary future bookings first.
       *
       * Make-up and class-exchange bookings are never silently touched.
       */
      const futureCandidates =
        await tx.booking.findMany({
          where: {
            userMembershipId:
              membership.id,
            status: "confirmed",
            isMakeup: false,
            classExchange: {
              is: null,
            },
          },
          include: {
            schedule: {
              include: {
                class: {
                  select: {
                    maxSpots: true,
                  },
                },
              },
            },
          },
          orderBy: [
            {
              schedule: {
                date: "desc",
              },
            },
            {
              schedule: {
                time: "desc",
              },
            },
            {
              createdAt: "desc",
            },
          ],
        });

      const cancellableFuture =
        futureCandidates.filter(
          (booking) =>
            scheduleSlotInstant(
              new Date(
                booking.schedule.date,
              ),
              booking.schedule.time,
            ).getTime() >
            now.getTime(),
        );

      if (
        cancellableFuture.length <
        overflowToRelease
      ) {
        throw new RetroactiveAttendanceError(
          "NOT_ENOUGH_FUTURE_BOOKINGS",
          "لا توجد حجوزات مستقبلية عادية كافية لمعادلة الحضور السابق بدون تجاوز عدد حصص الاشتراك.",
        );
      }

      const bookingsToCancel =
        cancellableFuture.slice(
          0,
          overflowToRelease,
        );

      /*
       * Ensure an attendance pass exists inside the same transaction.
       */
      let pass =
        await tx.attendancePass.findUnique({
          where: {
            userMembershipId:
              membership.id,
          },
        });

      if (!pass) {
        pass =
          await tx.attendancePass.create({
            data: {
              userId:
                membership.userId,
              userMembershipId:
                membership.id,
              code: randomBytes(18)
                .toString("base64url"),
              kind: "membership",
              status: "active",
              label:
                membership.offerTitle?.trim() ||
                membership.membership.name,
            },
          });
      } else if (
        pass.status !== "active"
      ) {
        pass =
          await tx.attendancePass.update({
            where: {
              id: pass.id,
            },
            data: {
              status: "active",
            },
          });
      }

      const cancelledBookingIds: string[] =
        [];

      for (
        const booking of bookingsToCancel
      ) {
        const claimed =
          await tx.booking.updateMany({
            where: {
              id: booking.id,
              status: "confirmed",
              userMembershipId:
                membership.id,
              isMakeup: false,
              classExchange: {
                is: null,
              },
            },
            data: {
              status: "cancelled",
            },
          });

        if (claimed.count !== 1) {
          throw new RetroactiveAttendanceError(
            "MEMBERSHIP_CHANGED",
            "تم تغيير أحد حجوزات الاشتراك أثناء العملية. حدّث الصفحة وحاول مرة أخرى.",
          );
        }

        const restored =
          await tx.schedule.update({
            where: {
              id: booking.scheduleId,
            },
            data: {
              availableSpots: {
                increment: 1,
              },
            },
            select: {
              availableSpots: true,
              class: {
                select: {
                  maxSpots: true,
                },
              },
            },
          });

        if (
          restored.availableSpots >
          restored.class.maxSpots
        ) {
          throw new Error(
            "RETROACTIVE_ATTENDANCE_CAPACITY_OVERFLOW",
          );
        }

        cancelledBookingIds.push(
          booking.id,
        );
      }

      const createdBookingIds: string[] =
        [];
      const reusedBookingIds: string[] =
        [];
      const checkInIds: string[] = [];

      for (
        const schedule of selectedSchedules
      ) {
        /*
         * Lock capacity immediately before consuming it.
         */
        const lockedRows =
          await tx.$queryRaw<
            Array<{
              id: string;
              availableSpots: number;
            }>
          >`
            SELECT \`id\`, \`availableSpots\`
            FROM \`Schedule\`
            WHERE \`id\` = ${schedule.id}
            FOR UPDATE
          `;

        if (
          lockedRows.length !== 1
        ) {
          throw new RetroactiveAttendanceError(
            "SCHEDULE_NOT_FOUND",
            "تعذر العثور على إحدى الحصص المختارة.",
          );
        }

        const reusableId =
          reusableStandaloneBookingIds.get(
            schedule.id,
          );

        let bookingId: string;

        if (reusableId) {
          const relinked =
            await tx.booking.updateMany({
              where: {
                id: reusableId,
                userId:
                  membership.userId,
                scheduleId:
                  schedule.id,
                userMembershipId:
                  null,
                status:
                  "confirmed",
              },
              data: {
                userMembershipId:
                  membership.id,
                status:
                  "attended",
                entitlementUnits: 1,
                isMakeup: false,
                makeupReason: null,
              },
            });

          if (
            relinked.count !== 1
          ) {
            throw new RetroactiveAttendanceError(
              "MEMBERSHIP_CHANGED",
              "تم تغيير الحجز السابق أثناء العملية. حدّث الصفحة وحاول مرة أخرى.",
            );
          }

          bookingId = reusableId;
          reusedBookingIds.push(
            reusableId,
          );
        } else {
          const availableSpots =
            Number(
              lockedRows[0]
                .availableSpots,
            );

          if (
            !Number.isFinite(
              availableSpots,
            ) ||
            availableSpots <= 0
          ) {
            throw new RetroactiveAttendanceError(
              "PAST_SESSION_FULL",
              "إحدى الحصص السابقة لم يعد بها مقعد يمكن احتسابه بأمان.",
            );
          }

          const created =
            await tx.booking.create({
              data: {
                userId:
                  membership.userId,
                scheduleId:
                  schedule.id,
                userMembershipId:
                  membership.id,
                status:
                  "attended",
                paidAmount:
                  schedule.class.price,
                paymentMethod:
                  membership.paymentMethod ??
                  "cash",
                entitlementUnits: 1,
                isMakeup: false,
                makeupReason: null,
              },
            });

          await tx.schedule.update({
            where: {
              id: schedule.id,
            },
            data: {
              availableSpots: {
                decrement: 1,
              },
            },
          });

          bookingId = created.id;
          createdBookingIds.push(
            created.id,
          );
        }

        const checkIn =
          await tx.attendanceCheckIn.create({
            data: {
              passId: pass.id,
              userId:
                membership.userId,
              userMembershipId:
                membership.id,
              bookingId,
              scheduleId:
                schedule.id,
              scannedByUserId:
                input.adminUserId,
              checkInType:
                "class",
              notes:
                "retroactive_admin_attendance",
            },
          });

        checkInIds.push(
          checkIn.id,
        );
      }

      /*
       * Match the normal attendance lifecycle:
       * if the newly recorded historical attendance consumes the complete
       * finite entitlement, expire the membership and its attendance pass.
       */
      const attendanceRows =
        await tx.attendanceCheckIn.findMany({
          where: {
            userMembershipId:
              membership.id,
          },
          select: {
            booking: {
              select: {
                entitlementUnits: true,
              },
            },
          },
        });

      const sessionsUsed =
        attendanceRows.reduce(
          (sum, row) =>
            sum +
            getBookingEntitlementUnits({
              entitlementUnits:
                row.booking
                  ?.entitlementUnits ??
                null,
            }),
          0,
        );

      const sessionsRemaining =
        Math.max(
          0,
          sessionLimit -
            sessionsUsed,
        );

      let membershipExpired =
        false;

      if (
        sessionsUsed >=
        sessionLimit
      ) {
        const expired =
          await tx.userMembership.updateMany({
            where: {
              id:
                membership.id,
              status:
                "active",
            },
            data: {
              status:
                "expired",
            },
          });

        membershipExpired =
          expired.count === 1;

        await tx.attendancePass.update({
          where: {
            id: pass.id,
          },
          data: {
            status:
              "expired",
            lastUsedAt:
              new Date(),
          },
        });
      } else {
        await tx.attendancePass.update({
          where: {
            id: pass.id,
          },
          data: {
            lastUsedAt:
              new Date(),
          },
        });
      }

      return {
        membershipId:
          membership.id,
        userId:
          membership.userId,
        addedAttendanceCount:
          selectedSchedules.length,
        sessionsUsed,
        sessionsRemaining,
        sessionLimit,
        membershipExpired,
        createdBookingIds,
        reusedBookingIds,
        cancelledFutureBookingIds:
          cancelledBookingIds,
        checkInIds,
        scheduleIds:
          selectedSchedules.map(
            (schedule) =>
              schedule.id,
          ),
      };
    },
    {
      isolationLevel:
        "Serializable",
    },
  );
}