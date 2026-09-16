import { assertUserCanBookClassByHealth } from "@/lib/booking/health-booking-policy";
import {
  getFrozenMaxSessionsPerDay,
  getFrozenRequireDistinctClassesPerDay,
} from "@/lib/booking/booking-policy";
import { db } from "@/lib/db";
import {
  cairoCalendarDateKey,
  scheduleSlotInstant,
} from "@/lib/fitzone-time";
import { resolveMembershipClassEligibility } from "@/lib/membership-class-eligibility";
import { sumMembershipBookingUnits } from "@/lib/membership-session-units";

export const EXCHANGE_UNITS = 2;

export type ExchangeErrorCode =
  | "MEMBERSHIP_NOT_FOUND"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "MEMBERSHIP_SESSION_LIMIT_UNAVAILABLE"
  | "INSUFFICIENT_SESSION_UNITS"
  | "SCHEDULE_NOT_FOUND"
  | "SCHEDULE_NOT_ACTIVE"
  | "SCHEDULE_PASSED"
  | "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD"
  | "CLASS_ALREADY_INCLUDED"
  | "OTHER_MEMBERSHIP_CAN_BOOK_NORMALLY"
  | "HEALTH_RESTRICTION_BLOCKED"
  | "SCHEDULE_FULL"
  | "ALREADY_BOOKED"
  | "BOOKING_TIME_CONFLICT"
  | "DAILY_SESSION_LIMIT_REACHED"
  | "DISTINCT_CLASS_REQUIRED";

export class ExchangeDomainError extends Error {
  readonly code: ExchangeErrorCode;

  constructor(code: ExchangeErrorCode) {
    super(code);
    this.name = "ExchangeDomainError";
    this.code = code;
  }
}

function fail(code: ExchangeErrorCode): never {
  throw new ExchangeDomainError(code);
}

export async function executeClassExchange(input: {
  userMembershipId: string;
  scheduleId: string;
  sourceBookingIds: string[];
  reason: string;
  createdByUserId: string;
  classExchangeRequestId?: string;
}) {
  const {
    userMembershipId,
    scheduleId,
    sourceBookingIds,
    reason,
    createdByUserId,
    classExchangeRequestId,
  } = input;

  const result =
      await db.$transaction(async (tx) => {
        /*
         * Canonical lock order shared with normal membership booking:
         *
         * 1. UserMembership
         * 2. Schedule
         *
         * This serializes normal-vs-normal,
         * normal-vs-exchange and exchange-vs-exchange entitlement claims.
         */
        const membershipLockRows =
          await tx.$queryRaw<any[]>`
            SELECT
              \`id\`,
              \`userId\`,
              \`status\`,
              \`totalSessions\`,
              \`startDate\`,
              \`endDate\`
            FROM \`UserMembership\`
            WHERE \`id\` = ${userMembershipId}
            FOR UPDATE
          `;

        const membershipLock =
          membershipLockRows[0];

        if (!membershipLock) {
          fail("MEMBERSHIP_NOT_FOUND");
        }

        if (membershipLock.status !== "active") {
          fail("MEMBERSHIP_NOT_ACTIVE");
        }

        const membership =
          await tx.userMembership.findUnique({
            where: {
              id: userMembershipId,
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
          fail("MEMBERSHIP_NOT_FOUND");
        }

        /*
         * This business action is specifically a two-session exchange.
         * A finite contractual session balance is therefore mandatory.
         */
        if (
          membership.totalSessions == null ||
          membership.totalSessions <= 0
        ) {
          fail(
            "MEMBERSHIP_SESSION_LIMIT_UNAVAILABLE",
          );
        }

        const scheduleLockRows =
          await tx.$queryRaw<any[]>`
            SELECT
              \`id\`,
              \`availableSpots\`,
              \`isActive\`
            FROM \`Schedule\`
            WHERE \`id\` = ${scheduleId}
            FOR UPDATE
          `;

        const scheduleLock =
          scheduleLockRows[0];

        if (!scheduleLock) {
          fail("SCHEDULE_NOT_FOUND");
        }

        if (!Boolean(scheduleLock.isActive)) {
          fail("SCHEDULE_NOT_ACTIVE");
        }

        if (classExchangeRequestId) {
          const requestRows =
            await tx.$queryRaw<any[]>`
              SELECT
                \`id\`,
                \`userId\`,
                \`userMembershipId\`,
                \`targetScheduleId\`,
                \`status\`
              FROM \`ClassExchangeRequest\`
              WHERE \`id\` = ${classExchangeRequestId}
              FOR UPDATE
            `;

          const requestLock = requestRows[0];

          if (!requestLock) {
            throw new Error("CLASS_EXCHANGE_REQUEST_NOT_FOUND");
          }

          if (requestLock.status !== "pending") {
            throw new Error("CLASS_EXCHANGE_REQUEST_ALREADY_REVIEWED");
          }

          if (
            requestLock.userId !== membershipLock.userId ||
            requestLock.userMembershipId !== userMembershipId ||
            requestLock.targetScheduleId !== scheduleId
          ) {
            throw new Error("CLASS_EXCHANGE_REQUEST_MISMATCH");
          }
        }

        const schedule =
          await tx.schedule.findUnique({
            where: {
              id: scheduleId,
            },
            include: {
              class: true,
            },
          });

        if (!schedule) {
          fail("SCHEDULE_NOT_FOUND");
        }

        const now = new Date();

        const targetInstant =
          scheduleSlotInstant(
            schedule.date,
            schedule.time,
          );

        if (
          targetInstant.getTime() <=
          now.getTime()
        ) {
          fail("SCHEDULE_PASSED");
        }

        const targetDay =
          cairoCalendarDateKey(
            targetInstant,
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
          fail(
            "SCHEDULE_OUTSIDE_MEMBERSHIP_PERIOD",
          );
        }

        /*
         * The exchange is only for a class that the selected membership
         * does NOT already grant.
         *
         * We intentionally do not mutate eligibilitySnapshot,
         * bookingPatternSnapshot or allowed classes.
         */
        const normalEligibility =
          await resolveMembershipClassEligibility({
            userId: membership.userId,
            classes: [schedule.class],
            now,
            memberships: [membership],
          });

        if (
          normalEligibility.hasEligibleMembership &&
          (
            normalEligibility.unrestricted ||
            normalEligibility.allowedClassIds.includes(
              schedule.classId,
            )
          )
        ) {
          fail("CLASS_ALREADY_INCLUDED");
        }

        /*
         * Do not spend two units from the selected membership when
         * another currently-active membership can book this class
         * normally and still has usable entitlement.
         *
         * This mirrors the ordinary booking route's membership
         * selection semantics without mutating any frozen snapshot.
         */
        const otherMemberships =
          await tx.userMembership.findMany({
            where: {
              userId: membership.userId,
              id: {
                not: userMembershipId,
              },
              status: "active",
              startDate: {
                lte: now,
              },
              endDate: {
                gte: now,
              },
            },
            orderBy: [
              {
                endDate: "asc",
              },
              {
                startDate: "asc",
              },
            ],
            include: {
              membership: {
                select: {
                  classSessions: true,
                },
              },
            },
          });

        if (otherMemberships.length > 0) {
          const otherEligibility =
            await resolveMembershipClassEligibility({
              userId: membership.userId,
              classes: [schedule.class],
              now,
              memberships:
                otherMemberships,
            });

          const grantingIds =
            new Set(
              otherEligibility
                .membershipIdsByClass[
                  schedule.class.id
                ] ?? [],
            );

          for (
            const otherMembership
            of otherMemberships
          ) {
            if (
              !grantingIds.has(
                otherMembership.id,
              )
            ) {
              continue;
            }

            const otherStartDay =
              cairoCalendarDateKey(
                new Date(
                  otherMembership.startDate,
                ),
              );

            const otherEndDay =
              cairoCalendarDateKey(
                new Date(
                  otherMembership.endDate,
                ),
              );

            const scheduleDay =
              cairoCalendarDateKey(
                targetInstant,
              );

            if (
              scheduleDay <
                otherStartDay ||
              scheduleDay >
                otherEndDay
            ) {
              continue;
            }

            /*
             * Match normal-booking semantics:
             * null / non-positive totalSessions is not treated
             * as an exhausted finite balance.
             */
            if (
              otherMembership.totalSessions !==
                null &&
              otherMembership.totalSessions >
                0
            ) {
              const otherBookings =
                await tx.booking.findMany({
                  where: {
                    userMembershipId:
                      otherMembership.id,
                    status: {
                      in: [
                        "confirmed",
                        "attended",
                      ],
                    },
                  },
                  select: {
                    status: true,
                    entitlementUnits: true,
                  },
                });

              const otherUsedUnits =
                sumMembershipBookingUnits(
                  otherBookings,
                  [
                    "confirmed",
                    "attended",
                  ],
                );

              if (
                otherUsedUnits >=
                otherMembership.totalSessions
              ) {
                continue;
              }
            }

            fail(
              "OTHER_MEMBERSHIP_CAN_BOOK_NORMALLY",
            );
          }
        }

        try {
          await assertUserCanBookClassByHealth(
            tx,
            membership.userId,
            schedule.class.type,
          );
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              "HEALTH_RESTRICTION_BLOCKED"
          ) {
            fail(
              "HEALTH_RESTRICTION_BLOCKED",
            );
          }

          throw error;
        }

        /*
         * Weighted membership balance.
         *
         * confirmed + attended consume entitlement.
         * cancelled does not.
         */
        const entitlementBookings =
          await tx.booking.findMany({
            where: {
              userMembershipId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                ],
              },
            },
            select: {
              status: true,
              entitlementUnits: true,
            },
          });

        const usedUnits =
          sumMembershipBookingUnits(
            entitlementBookings,
            ["confirmed", "attended"],
          );

        /*
         * Every Class Exchange is funded by exactly two future
         * ordinary bookings explicitly selected by the administrator.
         * Free/unallocated entitlement is never used here.
         */
        const requiredSourceUnits =
          EXCHANGE_UNITS;

        if (
          sourceBookingIds.length !==
          requiredSourceUnits
        ) {
          fail(
            "INSUFFICIENT_SESSION_UNITS",
          );
        }

        const sourceBookings =
          await tx.booking.findMany({
            where: {
              id: {
                in: sourceBookingIds,
              },
              userId: membership.userId,
              userMembershipId,
              status: "confirmed",
              entitlementUnits: 1,
              isMakeup: false,
            },
            include: {
              schedule: true,
            },
          });

          if (
            sourceBookings.length !==
            requiredSourceUnits
          ) {
            fail(
              "INSUFFICIENT_SESSION_UNITS",
            );
          }

          for (
            const sourceBooking
            of sourceBookings
          ) {
            const sourceInstant =
              scheduleSlotInstant(
                sourceBooking.schedule.date,
                sourceBooking.schedule.time,
              );

            if (
              sourceInstant.getTime() <=
              now.getTime()
            ) {
              fail(
                "INSUFFICIENT_SESSION_UNITS",
              );
            }
          }

          /*
           * Release the future ordinary bookings that finance
           * the exchange. Everything remains in one transaction.
           */
          if (
            requiredSourceUnits > 0
          ) {
            const released =
              await tx.booking.updateMany({
                where: {
                  id: {
                    in:
                      sourceBookingIds,
                  },
                  userId:
                    membership.userId,
                  userMembershipId,
                  status:
                    "confirmed",
                  entitlementUnits: 1,
                  isMakeup: false,
                },
                data: {
                  status:
                    "cancelled",
                },
              });

            if (
              released.count !==
              requiredSourceUnits
            ) {
              fail(
                "INSUFFICIENT_SESSION_UNITS",
              );
            }

            for (
              const sourceBooking
              of sourceBookings
            ) {
              await tx.schedule.update({
                where: {
                  id:
                    sourceBooking.scheduleId,
                },
                data: {
                  availableSpots: {
                    increment: 1,
                  },
                },
              });
            }
          }

        /*
         * Duplicate and time-conflict protection remain physical.
         */
        const sameSchedule =
          await tx.booking.findFirst({
            where: {
              userId: membership.userId,
              scheduleId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                ],
              },
            },
            select: {
              id: true,
            },
          });

        if (sameSchedule) {
          fail("ALREADY_BOOKED");
        }

        const timeConflict =
          await tx.booking.findFirst({
            where: {
              userId: membership.userId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                  "noshow",
                ],
              },
              schedule: {
                date: schedule.date,
                time: schedule.time,
              },
            },
            select: {
              id: true,
            },
          });

        if (timeConflict) {
          fail(
            "BOOKING_TIME_CONFLICT",
          );
        }

        const maxSessionsPerDay =
          getFrozenMaxSessionsPerDay(
            membership.bookingPatternSnapshot,
            2,
          );

        const requireDistinctClassesPerDay =
          getFrozenRequireDistinctClassesPerDay(
            membership.bookingPatternSnapshot,
          );

        const physicalBookings =
          await tx.booking.findMany({
            where: {
              userMembershipId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                ],
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
          physicalBookings.filter(
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
          fail(
            "DAILY_SESSION_LIMIT_REACHED",
          );
        }

        if (
          requireDistinctClassesPerDay &&
          sameDayBookings.some(
            (booking) =>
              booking.schedule.classId ===
              schedule.classId,
          )
        ) {
          fail(
            "DISTINCT_CLASS_REQUIRED",
          );
        }

        if (
          Number(
            scheduleLock.availableSpots,
          ) <= 0
        ) {
          fail("SCHEDULE_FULL");
        }

        /*
         * Exactly ONE physical booking / ONE seat,
         * but exactly TWO membership entitlement units.
         */
        const booking =
          await tx.booking.create({
            data: {
              userId: membership.userId,
              scheduleId,
              userMembershipId,
              status: "confirmed",
              entitlementUnits:
                EXCHANGE_UNITS,
              paidAmount: 0,
              paymentMethod:
                "membership",
              isMakeup: false,
              makeupReason: null,
            },
          });

        const exchange =
          await tx.membershipClassExchange.create({
            data: {
              userMembershipId,
              bookingId: booking.id,
              entitlementUnits:
                EXCHANGE_UNITS,
              status: "active",
              reason,
              createdByUserId:
                createdByUserId,
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

        if (classExchangeRequestId) {
          const approvedRequest =
            await tx.classExchangeRequest.updateMany({
              where: {
                id: classExchangeRequestId,
                status: "pending",
              },
              data: {
                status: "approved",
                pendingKey: null,
                reviewedAt: new Date(),
                reviewedByUserId: createdByUserId,
                sourceBookingIds:
                  JSON.stringify(sourceBookingIds),
              },
            });

          if (approvedRequest.count !== 1) {
            throw new Error(
              "CLASS_EXCHANGE_REQUEST_ALREADY_REVIEWED",
            );
          }
        }

        await tx.notification.create({
          data: {
            userId: membership.userId,
            title:
              `تم تأكيد حجز استثنائي: ${schedule.class.name}`,
            body:
              `تم حجز ${schedule.class.name} بواسطة الإدارة مقابل خصم حصتين من رصيد الاشتراك.`,
            type: "success",
          },
        });

        return {
          bookingId: booking.id,
          exchangeId: exchange.id,
          entitlementUnits:
            EXCHANGE_UNITS,
          remainingUnitsAfter:
            membership.totalSessions -
            usedUnits,
            replacedBookingIds:
              sourceBookingIds,
        };
      });

  return result;
}
