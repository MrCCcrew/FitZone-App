import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import {
  applyMembershipBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";


describe(
  "Membership booking recurring-pattern uniqueness",
  { timeout: 90000 },
  () => {
    it("rejects two schedule rows that resolve to the same recurring class/weekday/time and leaves no frozen contract", async () => {
      let userId = "";
      let baseMembershipId = "";
      let userMembershipId = "";
      let trainerId = "";
      let classId = "";
      let scheduleAId = "";
      let scheduleBId = "";

      try {
        const user = await db.user.create({
          data: {
            phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
            name: "Duplicate Recurring Pattern Test",
            gender: "female",
          },
        });
        userId = user.id;

        const baseMembership = await db.membership.create({
          data: {
            name: "Duplicate Pattern Plan",
            nameEn: "Duplicate Pattern Plan",
            duration: 30,
            price: 100,
            sessionsCount: 2,
            walletBonus: 0,
            features: "[]",
          },
        });
        baseMembershipId = baseMembership.id;

        const trainer = await db.trainer.create({
          data: {
            name: "Duplicate Pattern Trainer",
            specialty: "fitness",
            bio: "integration test",
          },
        });
        trainerId = trainer.id;

        const classRecord = await db.class.create({
          data: {
            name: "Duplicate Pattern Class",
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });
        classId = classRecord.id;

        await db.membership.update({
          where: { id: baseMembershipId },
          data: {
            classSessions: JSON.stringify([
              {
                classId,
                classType: "fitness",
                sessions: 2,
              },
            ]),
          },
        });

        /*
         * Pick a future date, then create another Schedule exactly 7 days later.
         * Both therefore resolve to the same recurring weekday + time + class.
         */
        const dateA = new Date();
        dateA.setUTCDate(dateA.getUTCDate() + 14);
        dateA.setUTCHours(0, 0, 0, 0);

        const dateB = new Date(dateA);
        dateB.setUTCDate(dateB.getUTCDate() + 7);

        const scheduleA = await db.schedule.create({
          data: {
            classId,
            date: dateA,
            time: "18:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleAId = scheduleA.id;

        const scheduleB = await db.schedule.create({
          data: {
            classId,
            date: dateB,
            time: "18:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleBId = scheduleB.id;

        const membershipStart = new Date();
        const membershipEnd = new Date(membershipStart);
        membershipEnd.setUTCDate(
          membershipEnd.getUTCDate() + 30,
        );

        const userMembership =
          await db.userMembership.create({
            data: {
              userId,
              membershipId: baseMembershipId,
              status: "active",
              paymentAmount: 100,
              totalSessions: 2,
              snapshotDurationDays: 30,
              startDate: membershipStart,
              endDate: membershipEnd,
            },
          });

        userMembershipId = userMembership.id;

        let thrown: unknown = null;

        try {
          await db.$transaction(async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,
              selectedScheduleIds: [
                scheduleAId,
                scheduleBId,
              ],
              source: {
                type: "membership",
                id: baseMembershipId,
              },
              plan: {
                kind: "standard",
                sessionsCount: 2,
                duration: 30,
              },
            }),
          );
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(
          MembershipBookingPlanError,
        );

        const after =
          await db.userMembership.findUnique({
            where: { id: userMembershipId },
            select: {
              bookingPatternSnapshot: true,
            },
          });

        expect(after?.bookingPatternSnapshot).toBeNull();

        expect(
          await db.booking.count({
            where: {
              userMembershipId,
            },
          }),
        ).toBe(0);
      } finally {
        if (userMembershipId) {
          await db.booking.deleteMany({
            where: { userMembershipId },
          });

          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (scheduleAId || scheduleBId) {
          await db.schedule.deleteMany({
            where: {
              id: {
                in: [scheduleAId, scheduleBId].filter(Boolean),
              },
            },
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

        if (baseMembershipId) {
          await db.membership.deleteMany({
            where: { id: baseMembershipId },
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

describe(
  "Membership booking calendar-day boundary",
  { timeout: 90000 },
  () => {
    it("books a same-day schedule when its Cairo session instant is after membership activation", async () => {
      let userId = "";
      let baseMembershipId = "";
      let userMembershipId = "";
      let boundaryMembershipId = "";
      let trainerId = "";
      let classId = "";
      let scheduleId = "";
      let pastScheduleId = "";
      let addedClassId = "";
      let addedScheduleId = "";

      try {
        const user = await db.user.create({
          data: {
            phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
            name: "First Day Booking Boundary Test",
            gender: "female",
          },
        });
        userId = user.id;

        const baseMembership = await db.membership.create({
          data: {
            name: "First Day Boundary Plan",
            nameEn: "First Day Boundary Plan",
            duration: 30,
            price: 100,
            sessionsCount: 1,
            walletBonus: 0,
            features: "[]",
          },
        });
        baseMembershipId = baseMembership.id;

        const trainer = await db.trainer.create({
          data: {
            name: "First Day Boundary Trainer",
            specialty: "fitness",
            bio: "integration test",
          },
        });
        trainerId = trainer.id;

        const classRecord = await db.class.create({
          data: {
            name: "First Day Boundary Class",
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });
        classId = classRecord.id;

        // The booking planner validates the selected class against the exact
        // purchased membership source. Make this test membership explicitly
        // eligible for the test class, matching production rules.
        await db.membership.update({
          where: { id: baseMembershipId },
          data: {
            classSessions: JSON.stringify([
              {
                classId,
                classType: "fitness",
                sessions: 1,
              },
            ]),
          },
        });

        const scheduleDate = new Date();
        scheduleDate.setUTCDate(scheduleDate.getUTCDate() + 1);
        scheduleDate.setUTCHours(0, 0, 0, 0);

        const membershipStart = new Date(scheduleDate);
        membershipStart.setUTCHours(14, 0, 0, 0);

        const membershipEnd = new Date(membershipStart);
        membershipEnd.setUTCDate(membershipEnd.getUTCDate() + 30);

        const pastSchedule = await db.schedule.create({
          data: {
            classId,
            date: scheduleDate,
            time: "13:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        pastScheduleId = pastSchedule.id;

        const schedule = await db.schedule.create({
          data: {
            classId,
            date: scheduleDate,
            time: "16:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleId = schedule.id;

        const userMembership = await db.userMembership.create({
          data: {
            userId,
            membershipId: baseMembershipId,
            status: "active",
            paymentAmount: 100,
            totalSessions: 1,
            snapshotDurationDays: 30,
            startDate: membershipStart,
            endDate: membershipEnd,
          },
        });
        userMembershipId = userMembership.id;

        const boundaryMembership = await db.userMembership.create({
          data: {
            userId,
            membershipId: baseMembershipId,
            status: "active",
            paymentAmount: 100,
            totalSessions: 1,
            snapshotDurationDays: 30,
            startDate: membershipStart,
            endDate: membershipEnd,
          },
        });
        boundaryMembershipId = boundaryMembership.id;

        const sameCairoDayBeforeActivationClock =
          await db.$transaction(async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId: boundaryMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,
              source: {
                type: "membership",
                id: baseMembershipId,
              },
              selectedScheduleIds: [pastScheduleId],
              plan: {
                kind: "standard",
                sessionsCount: 1,
                duration: 30,
              },
            }),
          );

        // Membership coverage is by Africa/Cairo calendar day. A future slot
        // on the first membership day remains eligible even if its clock time
        // is earlier than the exact activation timestamp.
        expect(sameCairoDayBeforeActivationClock.createdCount).toBe(1);
        expect(
          await db.booking.count({
            where: {
              userMembershipId: boundaryMembershipId,
              scheduleId: pastScheduleId,
            },
          }),
        ).toBe(1);

        const first = await db.$transaction(async (tx) =>
          applyMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId,
            startDate: membershipStart,
            endDate: membershipEnd,
            source: {
              type: "membership",
              id: baseMembershipId,
            },
            selectedScheduleIds: [scheduleId],
            plan: {
              kind: "standard",
              sessionsCount: 1,
              duration: 30,
            },
          }),
        );

        expect(first.createdCount).toBe(1);
        expect(first.bookedSchedules).toHaveLength(1);

        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              scheduleId,
            },
          }),
        ).toBe(1);

        const afterFirst = await db.schedule.findUnique({
          where: { id: scheduleId },
          select: { availableSpots: true },
        });

        expect(afterFirst?.availableSpots).toBe(9);

        const second = await db.$transaction(async (tx) =>
          applyMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId,
            startDate: membershipStart,
            endDate: membershipEnd,
            source: {
              type: "membership",
              id: baseMembershipId,
            },
            selectedScheduleIds: [scheduleId],
            plan: {
              kind: "standard",
              sessionsCount: 1,
              duration: 30,
            },
          }),
        );

        expect(second.createdCount).toBe(0);

        expect(
          await db.booking.count({
            where: {
              userMembershipId,
              scheduleId,
            },
          }),
        ).toBe(1);

        const afterSecond = await db.schedule.findUnique({
          where: { id: scheduleId },
          select: { availableSpots: true },
        });

        expect(afterSecond?.availableSpots).toBe(9);

        // Freeze entitlement after the first successful booking plan.
        const frozenMembership = await db.userMembership.findUnique({
          where: { id: userMembershipId },
          select: { bookingPatternSnapshot: true },
        });

        expect(frozenMembership?.bookingPatternSnapshot).toBeTruthy();

        const frozenSnapshot = JSON.parse(
          frozenMembership!.bookingPatternSnapshot!,
        ) as {
          eligibility?: {
            mode: string;
            classIds?: string[];
            classTypes?: string[];
          };
        };

        expect(frozenSnapshot.eligibility?.mode).toBe("class_ids");
        expect(frozenSnapshot.eligibility?.classIds).toContain(classId);

        /*
         * CONTRACT-FIRST RECOVERY:
         * Once frozen, recovery must not require the original selectedScheduleIds
         * and must not recalculate entitlement from mutable plan arguments.
         */
        const snapshotBeforeContractOnlyRecovery =
          frozenMembership!.bookingPatternSnapshot!;

        const contractOnlyRecovery =
          await db.$transaction(async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,
              selectedScheduleIds: [],
              source: {
                type: "membership",
                id: baseMembershipId,
              },
              plan: {
                // Deliberately different from the purchase terms.
                // A frozen contract must ignore these mutable retry values.
                kind: "standard",
                sessionsCount: 999,
                duration: 1,
              },
            }),
          );

        expect(contractOnlyRecovery.createdCount).toBe(0);

        const afterContractOnlyRecovery =
          await db.userMembership.findUnique({
            where: { id: userMembershipId },
            select: { bookingPatternSnapshot: true },
          });

        expect(
          afterContractOnlyRecovery?.bookingPatternSnapshot,
        ).toBe(snapshotBeforeContractOnlyRecovery);

        // Admin changes the base membership after purchase and removes Class A.
        // The already-purchased UserMembership must keep its frozen entitlement.
        await db.membership.update({
          where: { id: baseMembershipId },
          data: {
            classSessions: JSON.stringify([]),
          },
        });

        const retryWithOldEntitlement = await db.$transaction(async (tx) =>
          applyMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId,
            startDate: membershipStart,
            endDate: membershipEnd,
            source: {
              type: "membership",
              id: baseMembershipId,
            },
            selectedScheduleIds: [scheduleId],
            plan: {
              kind: "standard",
              sessionsCount: 1,
              duration: 30,
            },
          }),
        );

        // It remains valid/idempotent because Class A was part of the
        // purchase-time entitlement snapshot.
        expect(retryWithOldEntitlement.createdCount).toBe(0);

        // Create a second class that was NOT part of the original purchase.
        const addedClass = await db.class.create({
          data: {
            name: "Post Purchase Added Class",
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });

        addedClassId = addedClass.id;

        const addedSchedule = await db.schedule.create({
          data: {
            classId: addedClass.id,
            date: scheduleDate,
            time: "17:00",
            availableSpots: 10,
            isActive: true,
          },
        });

        addedScheduleId = addedSchedule.id;

        // Admin now adds Class B to the live membership config.
        await db.membership.update({
          where: { id: baseMembershipId },
          data: {
            classSessions: JSON.stringify([
              {
                classId: addedClass.id,
                classType: "fitness",
                sessions: 1,
              },
            ]),
          },
        });

        /*
         * CONTRACT-FIRST GUARANTEE:
         *
         * After purchase, arbitrary retry seed IDs must NOT modify the frozen
         * booking contract. The newly-added Class B is therefore ignored.
         */
        const snapshotBeforeAddedClassRetry =
          (
            await db.userMembership.findUnique({
              where: { id: userMembershipId },
              select: { bookingPatternSnapshot: true },
            })
          )?.bookingPatternSnapshot;

        const retryWithNewLiveClass =
          await db.$transaction(async (tx) =>
            applyMembershipBookingPlanTx({
              tx,
              userId,
              userMembershipId,
              startDate: membershipStart,
              endDate: membershipEnd,
              source: {
                type: "membership",
                id: baseMembershipId,
              },
              selectedScheduleIds: [addedSchedule.id],
              plan: {
                kind: "standard",
                sessionsCount: 999,
                duration: 1,
              },
            }),
          );

        expect(retryWithNewLiveClass.createdCount).toBe(0);

        const bookingForAddedClass =
          await db.booking.findFirst({
            where: {
              userMembershipId,
              scheduleId: addedSchedule.id,
            },
            select: { id: true },
          });

        expect(bookingForAddedClass).toBeNull();

        const snapshotAfterAddedClassRetry =
          (
            await db.userMembership.findUnique({
              where: { id: userMembershipId },
              select: { bookingPatternSnapshot: true },
            })
          )?.bookingPatternSnapshot;

        expect(snapshotAfterAddedClassRetry).toBe(
          snapshotBeforeAddedClassRetry,
        );

      } finally {
        if (boundaryMembershipId) {
          await db.booking.deleteMany({
            where: { userMembershipId: boundaryMembershipId },
          });
          await db.userMembership.deleteMany({
            where: { id: boundaryMembershipId },
          });
        }

        if (userMembershipId) {
          await db.booking.deleteMany({
            where: { userMembershipId },
          });

          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (addedScheduleId) {
          await db.schedule.deleteMany({
            where: { id: addedScheduleId },
          });
        }

        if (scheduleId || pastScheduleId) {
          await db.schedule.deleteMany({
            where: {
              id: {
                in: [scheduleId, pastScheduleId].filter(Boolean),
              },
            },
          });
        }

        if (addedClassId) {
          await db.class.deleteMany({
            where: { id: addedClassId },
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

        if (baseMembershipId) {
          await db.membership.deleteMany({
            where: { id: baseMembershipId },
          });
        }

        if (userId) {
          await db.notification.deleteMany({
            where: { userId },
          });

          await db.user.deleteMany({
            where: { id: userId },
          });
        }
      }
    });
  },
);
