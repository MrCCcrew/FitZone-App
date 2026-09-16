import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyMembershipBookingPlanTx } from "@/lib/payments/membership-booking-plan";
import {
  addCairoCalendarDays,
  cairoCalendarDateKey,
  scheduleWeekday,
} from "@/lib/fitzone-time";

describe(
  "Membership booking reconciliation",
  { timeout: 90000 },
  () => {
    it("counts rescheduled bookings and skips full matching schedules until entitlement is filled", async () => {
      let userId = "";
      let membershipId = "";
      let userMembershipId = "";
      let trainerId = "";
      let classId = "";

      const scheduleIds: string[] = [];

      try {
        const user = await db.user.create({
          data: {
            phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
            name: "Booking Reconciliation Test",
            gender: "female",
          },
        });
        userId = user.id;

        const trainer = await db.trainer.create({
          data: {
            name: "Reconciliation Trainer",
            specialty: "fitness",
            bio: "integration test",
          },
        });
        trainerId = trainer.id;

        const gymClass = await db.class.create({
          data: {
            name: "Reconciliation Fitness Class",
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });
        classId = gymClass.id;

        const membership = await db.membership.create({
          data: {
            name: "Reconciliation Plan",
            nameEn: "Reconciliation Plan",
            duration: 30,
            price: 100,
            sessionsCount: 2,
            walletBonus: 0,
            features: "[]",
            classSessions: JSON.stringify([
              {
                classId,
                classType: "fitness",
                sessions: 2,
              },
            ]),
          },
        });
        membershipId = membership.id;

        /*
         * Use a future Cairo calendar date so contract recovery uses the
         * normal "never recreate past sessions" rule without test-clock hacks.
         */
        const tomorrowCairoKey = cairoCalendarDateKey(
          addCairoCalendarDays(new Date(), 1),
        );

        const firstDate = new Date(
          `${tomorrowCairoKey}T00:00:00.000Z`,
        );

        const secondDate = new Date(firstDate);
        secondDate.setUTCDate(secondDate.getUTCDate() + 7);

        const thirdDate = new Date(firstDate);
        thirdDate.setUTCDate(thirdDate.getUTCDate() + 14);

        /*
         * Same frozen weekly pattern:
         * - first occurrence is FULL
         * - second occurrence is available
         * - third occurrence is also available
         */
        const fullSchedule = await db.schedule.create({
          data: {
            classId,
            date: firstDate,
            time: "16:00",
            availableSpots: 0,
            isActive: true,
          },
        });
        scheduleIds.push(fullSchedule.id);

        const secondSchedule = await db.schedule.create({
          data: {
            classId,
            date: secondDate,
            time: "16:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleIds.push(secondSchedule.id);

        const thirdSchedule = await db.schedule.create({
          data: {
            classId,
            date: thirdDate,
            time: "16:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleIds.push(thirdSchedule.id);

        /*
         * This booking represents a legitimate reschedule:
         * it belongs to the same UserMembership but is outside the frozen
         * recurring 16:00 pattern.
         */
        const rescheduledDate = new Date(firstDate);
        rescheduledDate.setUTCDate(
          rescheduledDate.getUTCDate() + 3,
        );

        const rescheduledSchedule =
          await db.schedule.create({
            data: {
              classId,
              date: rescheduledDate,
              time: "18:00",
              availableSpots: 9,
              isActive: true,
            },
          });
        scheduleIds.push(rescheduledSchedule.id);

        const membershipStart = new Date(
          Date.now() - 60 * 60 * 1000,
        );
        const membershipEnd = addCairoCalendarDays(
          membershipStart,
          30,
        );

        const bookingContract = {
          version: 1,
          timezone: "Africa/Cairo",
          source: {
            type: "membership",
            id: membershipId,
          },
          eligibility: {
            mode: "class_ids",
            classIds: [classId],
            classTypes: [],
          },
          seedScheduleIds: [],
          patterns: [
            {
              classId,
              time: "16:00",
              dayOfWeek: scheduleWeekday(firstDate),
            },
          ],
          policy: {
            durationDays: 30,
            totalSessions: 2,
            minSessionsPerWeek: 1,
            selectedSessionsPerWeek: 1,
            selectedDaysPerWeek: 1,
            maxSessionsPerDay: 2,
          },
        };

        const userMembership =
          await db.userMembership.create({
            data: {
              userId,
              membershipId,
              status: "active",
              paymentAmount: 100,
              totalSessions: 2,
              snapshotDurationDays: 30,
              startDate: membershipStart,
              endDate: membershipEnd,
              bookingPatternSnapshot:
                JSON.stringify(bookingContract),
            },
          });
        userMembershipId = userMembership.id;

        /*
         * One of the two entitlements has already been consumed/reserved by
         * the rescheduled booking.
         */
        await db.booking.create({
          data: {
            userId,
            userMembershipId,
            scheduleId: rescheduledSchedule.id,
            status: "confirmed",
            paidAmount: 100,
            paymentMethod: "cash",
          },
        });

        const result = await db.$transaction(
          async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,

              /*
               * Contract-first recovery must not need purchase seed IDs.
               */
              selectedScheduleIds: [],

              source: {
                type: "membership",
                id: membershipId,
              },

              /*
               * Deliberately wrong live values.
               * The frozen contract must remain authoritative.
               */
              plan: {
                kind: "standard",
                sessionsCount: 999,
                duration: 1,
              },
            }),
        );

        /*
         * totalSessions = 2
         * existing rescheduled booking = 1
         * therefore only ONE additional booking may be created.
         */
        expect(result.createdCount).toBe(1);

        /*
         * Full first occurrence must be skipped.
         */
        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              scheduleId: fullSchedule.id,
            },
          }),
        ).toBe(0);

        /*
         * Reconciliation must continue past the full occurrence and book the
         * next valid matching occurrence.
         */
        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              scheduleId: secondSchedule.id,
            },
          }),
        ).toBe(1);

        /*
         * Because the rescheduled booking already counted toward entitlement,
         * the engine must stop after filling the ONE missing session.
         */
        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              scheduleId: thirdSchedule.id,
            },
          }),
        ).toBe(0);

        const entitlementBookingCount =
          await db.booking.count({
            where: {
              userMembershipId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                  "noshow",
                ],
              },
            },
          });

        expect(entitlementBookingCount).toBe(2);

        /*
         * bookedSchedules must represent actual membership bookings,
         * including the previously rescheduled booking.
         */
        expect(result.bookedSchedules).toHaveLength(2);

        const secondAfter =
          await db.schedule.findUnique({
            where: { id: secondSchedule.id },
            select: { availableSpots: true },
          });

        const thirdAfter =
          await db.schedule.findUnique({
            where: { id: thirdSchedule.id },
            select: { availableSpots: true },
          });

        expect(secondAfter?.availableSpots).toBe(9);
        expect(thirdAfter?.availableSpots).toBe(10);

        /*
         * Idempotency: another reconciliation must not create anything else.
         */
        const secondRun = await db.$transaction(
          async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,
              selectedScheduleIds: [],
              source: {
                type: "membership",
                id: membershipId,
              },
              plan: {
                kind: "standard",
                sessionsCount: 500,
                duration: 2,
              },
            }),
        );

        expect(secondRun.createdCount).toBe(0);

        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              status: {
                in: [
                  "confirmed",
                  "attended",
                  "noshow",
                ],
              },
            },
          }),
        ).toBe(2);
      } finally {
        if (userMembershipId) {
          await db.booking.deleteMany({
            where: { userMembershipId },
          });

          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (scheduleIds.length > 0) {
          await db.schedule.deleteMany({
            where: {
              id: {
                in: scheduleIds,
              },
            },
          });
        }

        if (membershipId) {
          await db.membership.deleteMany({
            where: { id: membershipId },
          });
        }

        if (classId) {
          await db.class.deleteMany({
            where: { id: classId },
          });
        }

        if (trainerId) {
          await db.trainer.deleteMany({
            where: { id: trainerId },
          });
        }

        if (userId) {
          await db.user.deleteMany({
            where: { id: userId },
          });
        }
      }
    });
  },
);
