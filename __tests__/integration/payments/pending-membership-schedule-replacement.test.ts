import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  applyMembershipBookingPlanTx,
  replacePendingMembershipBookingPlanTx,
} from "@/lib/payments/membership-booking-plan";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const testDbUrl = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  testDbUrl.protocol !== "mysql:" ||
  testDbUrl.hostname !== "127.0.0.1" ||
  decodeURIComponent(testDbUrl.username) !== "fitzone_test_user" ||
  testDbUrl.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: Pending membership schedule replacement tests require fitzone_test",
  );
}

describe(
  "Pending membership schedule replacement lifecycle",
  { timeout: 90000 },
  () => {
    it("replaces the pending schedule atomically and preserves capacity", async () => {
      let userId = "";
      let membershipId = "";
      let pendingMembershipId = "";
      let trainerId = "";
      let classId = "";
      let oldScheduleId = "";
      let newScheduleId = "";

      try {
        const user = await db.user.create({
          data: {
            phone:
              "+201" +
              Math.floor(Math.random() * 1_000_000_000),
            name: "Pending Schedule Replacement Test",
            gender: "female",
          },
        });
        userId = user.id;

        const trainer = await db.trainer.create({
          data: {
            name: "Pending Schedule Replacement Trainer",
            specialty: "fitness",
            bio: "integration test",
          },
        });
        trainerId = trainer.id;

        const classRecord = await db.class.create({
          data: {
            name: "Pending Schedule Replacement Class",
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });
        classId = classRecord.id;

        const membership = await db.membership.create({
          data: {
            name: "Pending Schedule Replacement Plan",
            nameEn: "Pending Schedule Replacement Plan",
            duration: 30,
            price: 100,
            sessionsCount: 1,
            walletBonus: 0,
            features: "[]",
            classSessions: JSON.stringify([
              {
                classId,
                classType: "fitness",
                sessions: 1,
              },
            ]),
          },
        });
        membershipId = membership.id;

        const startDate = new Date();

        const endDate = new Date(startDate);
        endDate.setUTCDate(endDate.getUTCDate() + 30);

        const oldDate = new Date(startDate);
        oldDate.setUTCDate(oldDate.getUTCDate() + 14);
        oldDate.setUTCHours(0, 0, 0, 0);

        const newDate = new Date(startDate);
        newDate.setUTCDate(newDate.getUTCDate() + 15);
        newDate.setUTCHours(0, 0, 0, 0);

        const oldSchedule = await db.schedule.create({
          data: {
            classId,
            date: oldDate,
            time: "18:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        oldScheduleId = oldSchedule.id;

        const newSchedule = await db.schedule.create({
          data: {
            classId,
            date: newDate,
            time: "19:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        newScheduleId = newSchedule.id;

        const pending = await db.userMembership.create({
          data: {
            userId,
            membershipId,
            status: "pending_payment",
            paymentAmount: 100,
            paymentMethod: "card",
            totalSessions: 1,
            snapshotDurationDays: 30,
            startDate,
            endDate,
            pendingExpiresAt: new Date(
              Date.now() + 60 * 60 * 1000,
            ),
          },
        });
        pendingMembershipId = pending.id;

        const initial = await db.$transaction(async (tx) =>
          applyMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId: pendingMembershipId,
            startDate,
            endDate,
            selectedScheduleIds: [oldScheduleId],
            source: {
              type: "membership",
              id: membershipId,
            },
            plan: {
              kind: "standard",
              sessionsCount: 1,
              duration: 30,
            },
          }),
        );

        expect(initial.createdCount).toBe(1);

        const oldBefore = await db.schedule.findUnique({
          where: { id: oldScheduleId },
          select: { availableSpots: true },
        });

        expect(oldBefore?.availableSpots).toBe(9);

        const replaced = await db.$transaction(async (tx) =>
          replacePendingMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId: pendingMembershipId,
            selectedScheduleIds: [newScheduleId],
          }),
        );

        expect(replaced.createdCount).toBe(1);

        const oldBooking = await db.booking.findFirst({
          where: {
            userMembershipId: pendingMembershipId,
            scheduleId: oldScheduleId,
            status: "confirmed",
          },
        });

        const newBooking = await db.booking.findFirst({
          where: {
            userMembershipId: pendingMembershipId,
            scheduleId: newScheduleId,
            status: "confirmed",
          },
        });

        expect(oldBooking).toBeNull();
        expect(newBooking).not.toBeNull();

        const oldAfter = await db.schedule.findUnique({
          where: { id: oldScheduleId },
          select: { availableSpots: true },
        });

        const newAfter = await db.schedule.findUnique({
          where: { id: newScheduleId },
          select: { availableSpots: true },
        });

        expect(oldAfter?.availableSpots).toBe(10);
        expect(newAfter?.availableSpots).toBe(9);

        const pendingAfter =
          await db.userMembership.findUnique({
            where: { id: pendingMembershipId },
            select: {
              status: true,
              bookingPatternSnapshot: true,
            },
          });

        expect(pendingAfter?.status).toBe(
          "pending_payment",
        );
        expect(
          pendingAfter?.bookingPatternSnapshot,
        ).toBeTruthy();

        const contract = JSON.parse(
          pendingAfter!.bookingPatternSnapshot!,
        ) as {
          seedScheduleIds?: string[];
        };

        expect(contract.seedScheduleIds).toEqual([
          newScheduleId,
        ]);
      } finally {
        if (userId) {
          await db.booking.deleteMany({
            where: { userId },
          });
        }

        if (pendingMembershipId) {
          await db.userMembership.deleteMany({
            where: { id: pendingMembershipId },
          });
        }

        if (oldScheduleId || newScheduleId) {
          await db.schedule.deleteMany({
            where: {
              id: {
                in: [
                  oldScheduleId,
                  newScheduleId,
                ].filter(Boolean),
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

        if (membershipId) {
          await db.membership.deleteMany({
            where: { id: membershipId },
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
