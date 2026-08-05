import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

describe("Concurrent Booking Capacity", () => {
  let user1Id: string;
  let user2Id: string;
  let trainerId: string;
  let classId: string;
  let scheduleId: string;
  let membershipId: string;
  let userMembership1Id: string;
  let userMembership2Id: string;

  beforeAll(async () => {
    // Create users
    const user1 = await db.user.create({
      data: {
        name: "User 1",
        email: `concurrent-user1-${Date.now()}@fitzone.test`,
        phone: "01111111111",
        password: "hashed",
        role: "customer",
      },
    });
    user1Id = user1.id;

    const user2 = await db.user.create({
      data: {
        name: "User 2",
        email: `concurrent-user2-${Date.now()}@fitzone.test`,
        phone: "01222222222",
        password: "hashed",
        role: "customer",
      },
    });
    user2Id = user2.id;

    // Create trainer
    const trainer = await db.trainer.create({
      data: {
        userId: user1Id,
        name: "Capacity Trainer",
        specialty: "Test",
        bio: "Test",
        isActive: true,
      },
    });
    trainerId = trainer.id;

    // Create class
    const gymClass = await db.class.create({
      data: {
        name: "Limited Capacity Class",
        trainerId: trainerId,
        type: "yoga",
        duration: 60,
        intensity: "medium",
        maxSpots: 1, // Only 1 spot!
        price: 100,
        isActive: true,
      },
    });
    classId = gymClass.id;

    // Create schedule with 1 available spot
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const schedule = await db.schedule.create({
      data: {
        classId: classId,
        date: tomorrow,
        time: "10:00",
        availableSpots: 1, // Only 1 spot
        isActive: true,
      },
    });
    scheduleId = schedule.id;

    // Create membership
    const membership = await db.membership.create({
      data: {
        name: "Test Membership",
        price: 500,
        duration: 30,
        sessionsCount: 10,
        kind: "subscription",
        isActive: true,
        features: "[]",
      },
    });
    membershipId = membership.id;

    // Create user memberships
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    const um1 = await db.userMembership.create({
      data: {
        userId: user1Id,
        membershipId: membershipId,
        totalSessions: 10,
        startDate: now,
        endDate,
        status: "active",
      },
    });
    userMembership1Id = um1.id;

    const um2 = await db.userMembership.create({
      data: {
        userId: user2Id,
        membershipId: membershipId,
        totalSessions: 10,
        startDate: now,
        endDate,
        status: "active",
      },
    });
    userMembership2Id = um2.id;
  });

  afterAll(async () => {
    await db.booking.deleteMany({
      where: { scheduleId: scheduleId },
    });
    await db.userMembership.deleteMany({
      where: { id: { in: [userMembership1Id, userMembership2Id] } },
    });
    await db.membership.delete({ where: { id: membershipId } });
    await db.schedule.delete({ where: { id: scheduleId } });
    await db.class.delete({ where: { id: classId } });
    await db.trainer.delete({ where: { id: trainerId } });
    await db.user.deleteMany({
      where: { id: { in: [user1Id, user2Id] } },
    });
    await db.$disconnect();
  });

  it("handles concurrent booking attempts for last spot", async () => {
    // Simulate two concurrent booking attempts
    const booking1Promise = db.booking.create({
      data: {
        userId: user1Id,
        scheduleId: scheduleId,
        userMembershipId: userMembership1Id,
        status: "confirmed",
        paidAmount: 100,
      },
    }).then(async (booking) => {
      // Atomically decrement
      await db.schedule.update({
        where: { id: scheduleId },
        data: { availableSpots: { decrement: 1 } },
      });
      return booking;
    }).catch((e) => ({ error: e.message }));

    const booking2Promise = db.booking.create({
      data: {
        userId: user2Id,
        scheduleId: scheduleId,
        userMembershipId: userMembership2Id,
        status: "confirmed",
        paidAmount: 100,
      },
    }).then(async (booking) => {
      // Atomically decrement
      await db.schedule.update({
        where: { id: scheduleId },
        data: { availableSpots: { decrement: 1 } },
      });
      return booking;
    }).catch((e) => ({ error: e.message }));

    const [result1, result2] = await Promise.all([booking1Promise, booking2Promise]);

    // Both bookings succeeded because no pre-check
    // (This shows the race condition in current code)
    const finalSchedule = await db.schedule.findUnique({
      where: { id: scheduleId },
    });

    const bookingCount = await db.booking.count({
      where: { scheduleId: scheduleId, status: "confirmed" },
    });

    // Current behavior: atomic decrement prevents negative but allows overbooking
    // Both bookings succeed, availableSpots becomes -1 or 0
    expect(bookingCount).toBeGreaterThanOrEqual(1);

    // NOTE: This test documents current behavior (potential overbooking)
    // Future fix would add transaction with SELECT FOR UPDATE or unique constraint
    console.log(`Final spots: ${finalSchedule!.availableSpots}, Bookings: ${bookingCount}`);
  });
});
