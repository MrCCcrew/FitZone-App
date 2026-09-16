import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { applyMembershipBookingPlanTx } from "@/lib/payments/membership-booking-plan";

const db = new PrismaClient();

describe("Concurrent Booking Capacity", () => {
  let user1Id = "";
  let user2Id = "";
  let trainerId = "";
  let classId = "";
  let scheduleId = "";
  let membershipId = "";
  let userMembership1Id = "";
  let userMembership2Id = "";
  let startDate: Date;
  let endDate: Date;

  beforeAll(async () => {
    const suffix = Date.now();

    const user1 = await db.user.create({
      data: {
        name: "Capacity User 1",
        email: `capacity-user1-${suffix}@fitzone.test`,
        phone: `011${String(suffix).slice(-8)}`,
        password: "hashed",
        role: "customer",
      },
    });
    user1Id = user1.id;

    const user2 = await db.user.create({
      data: {
        name: "Capacity User 2",
        email: `capacity-user2-${suffix}@fitzone.test`,
        phone: `012${String(suffix + 1).slice(-8)}`,
        password: "hashed",
        role: "customer",
      },
    });
    user2Id = user2.id;

    const trainer = await db.trainer.create({
      data: {
        userId: user1Id,
        name: "Capacity Trainer",
        specialty: "fitness",
        bio: "integration test",
        isActive: true,
      },
    });
    trainerId = trainer.id;

    const gymClass = await db.class.create({
      data: {
        name: "Single Spot Capacity Class",
        trainerId,
        type: "fitness",
        duration: 60,
        intensity: "medium",
        maxSpots: 1,
        price: 100,
        isActive: true,
      },
    });
    classId = gymClass.id;

    const scheduleDate = new Date();
    scheduleDate.setUTCDate(scheduleDate.getUTCDate() + 1);
    scheduleDate.setUTCHours(0, 0, 0, 0);

    const schedule = await db.schedule.create({
      data: {
        classId,
        date: scheduleDate,
        time: "18:00",
        availableSpots: 1,
        isActive: true,
      },
    });
    scheduleId = schedule.id;

    const membership = await db.membership.create({
      data: {
        name: "Single Session Capacity Membership",
        price: 100,
        duration: 30,
        sessionsCount: 1,
        kind: "subscription",
        isActive: true,
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

    startDate = new Date();
    endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 30);

    const um1 = await db.userMembership.create({
      data: {
        userId: user1Id,
        membershipId,
        totalSessions: 1,
        startDate,
        endDate,
        status: "active",
      },
    });
    userMembership1Id = um1.id;

    const um2 = await db.userMembership.create({
      data: {
        userId: user2Id,
        membershipId,
        totalSessions: 1,
        startDate,
        endDate,
        status: "active",
      },
    });
    userMembership2Id = um2.id;
  });

  afterAll(async () => {
    if (scheduleId) {
      await db.booking.deleteMany({ where: { scheduleId } });
    }
    if (userMembership1Id || userMembership2Id) {
      await db.userMembership.deleteMany({
        where: {
          id: {
            in: [userMembership1Id, userMembership2Id].filter(Boolean),
          },
        },
      });
    }
    if (membershipId) {
      await db.membership.deleteMany({ where: { id: membershipId } });
    }
    if (scheduleId) {
      await db.schedule.deleteMany({ where: { id: scheduleId } });
    }
    if (classId) {
      await db.class.deleteMany({ where: { id: classId } });
    }
    if (trainerId) {
      await db.trainer.deleteMany({ where: { id: trainerId } });
    }
    if (user1Id || user2Id) {
      await db.user.deleteMany({
        where: { id: { in: [user1Id, user2Id].filter(Boolean) } },
      });
    }
    await db.$disconnect();
  });

  it("allows only one real booking for the final available spot", async () => {
    const attempt = (userId: string, userMembershipId: string) =>
      db.$transaction(
        async (tx) =>
          applyMembershipBookingPlanTx({
            tx,
            userId,
            userMembershipId,
            startDate,
            endDate,
            source: {
              type: "membership",
              id: membershipId,
            },
            selectedScheduleIds: [scheduleId],
            plan: {
              kind: "standard",
              sessionsCount: 1,
              duration: 30,
            },
          }),
        { timeout: 15000 },
      );

    const results = await Promise.allSettled([
      attempt(user1Id, userMembership1Id),
      attempt(user2Id, userMembership2Id),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const finalSchedule = await db.schedule.findUniqueOrThrow({
      where: { id: scheduleId },
      select: { availableSpots: true },
    });

    const bookingCount = await db.booking.count({
      where: {
        scheduleId,
        status: { in: ["confirmed", "attended", "noshow"] },
      },
    });

    expect(bookingCount).toBe(1);
    expect(finalSchedule.availableSpots).toBe(0);
    expect(finalSchedule.availableSpots).toBeGreaterThanOrEqual(0);
  });
});
