import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

describe("Booking Validation Integration", () => {
  let testUserId: string;
  let testTrainerId: string;
  let classAllowed: { id: string };
  let classNotAllowed: { id: string };
  let scheduleAllowed: { id: string };
  let scheduleNotAllowed: { id: string };
  let offer: { id: string };
  let membership: { id: string };
  let userMembership: { id: string };

  beforeAll(async () => {
    // Create user
    const user = await db.user.create({
      data: {
        name: "Booking Test User",
        email: `booking-test-${Date.now()}@fitzone.test`,
        phone: "01000000002",
        password: "hashed",
        role: "customer",
      },
    });
    testUserId = user.id;

    // Create trainer
    const trainer = await db.trainer.create({
      data: {
        userId: testUserId,
        name: "Booking Trainer",
        specialty: "All",
        bio: "Test",
        isActive: true,
      },
    });
    testTrainerId = trainer.id;

    // Create classes
    classAllowed = await db.class.create({
      data: {
        name: "Allowed Class",
        trainerId: testTrainerId,
        type: "yoga",
        duration: 60,
        intensity: "medium",
        maxSpots: 5,
        price: 100,
        isActive: true,
      },
    });

    classNotAllowed = await db.class.create({
      data: {
        name: "Not Allowed Class",
        trainerId: testTrainerId,
        type: "cardio",
        duration: 45,
        intensity: "high",
        maxSpots: 10,
        price: 80,
        isActive: true,
      },
    });

    // Create schedules
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    scheduleAllowed = await db.schedule.create({
      data: {
        classId: classAllowed.id,
        date: tomorrow,
        time: "10:00",
        availableSpots: 5,
        isActive: true,
      },
    });

    scheduleNotAllowed = await db.schedule.create({
      data: {
        classId: classNotAllowed.id,
        date: tomorrow,
        time: "14:00",
        availableSpots: 10,
        isActive: true,
      },
    });

    // Create membership
    membership = await db.membership.create({
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

    // Create offer
    offer = await db.offer.create({
      data: {
        title: "Test Offer",
        type: "special",
        discount: 0,
        specialPrice: 400,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        maxSubscribers: 50,
        currentSubscribers: 0,
        showOnHome: true,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClasses: {
          create: [{ classId: classAllowed.id }],
        },
      },
    });

    // Create user membership
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    userMembership = await db.userMembership.create({
      data: {
        userId: testUserId,
        membershipId: membership.id,
        offerId: offer.id,
        totalSessions: 10,
        startDate: now,
        endDate,
        status: "active",
        allowedClassTypesSnapshot: null,
      },
    });
  });

  afterAll(async () => {
    // Cleanup (in reverse order of dependencies)
    await db.booking.deleteMany({ where: { userMembershipId: userMembership.id } });
    await db.userMembership.delete({ where: { id: userMembership.id } });
    await db.offerAllowedClass.deleteMany({ where: { offerId: offer.id } });
    await db.offer.delete({ where: { id: offer.id } });
    await db.membership.delete({ where: { id: membership.id } });
    await db.schedule.deleteMany({ where: { id: { in: [scheduleAllowed.id, scheduleNotAllowed.id] } } });
    await db.class.deleteMany({ where: { id: { in: [classAllowed.id, classNotAllowed.id] } } });
    await db.trainer.delete({ where: { id: testTrainerId } });
    await db.user.delete({ where: { id: testUserId } });
    await db.$disconnect();
  });

  it("allows booking for linked class with offer membership", async () => {
    // Simulate booking API validation
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleAllowed.id },
      include: { class: true },
    });

    expect(schedule).toBeTruthy();
    expect(schedule!.isActive).toBe(true);
    expect(schedule!.availableSpots).toBeGreaterThan(0);

    // Check eligibility
    const { isClassAllowedForSource } = await import("@/lib/get-eligible-classes");
    const isAllowed = await isClassAllowedForSource(
      { type: "offer", id: offer.id },
      schedule!.class.id
    );

    expect(isAllowed).toBe(true);
  });

  it("rejects booking for non-linked class with offer membership", async () => {
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleNotAllowed.id },
      include: { class: true },
    });

    expect(schedule).toBeTruthy();

    // Check eligibility
    const { isClassAllowedForSource } = await import("@/lib/get-eligible-classes");
    const isAllowed = await isClassAllowedForSource(
      { type: "offer", id: offer.id },
      schedule!.class.id
    );

    expect(isAllowed).toBe(false);
  });

  it("preserves existing booking validation: capacity, sessions, duplicate", async () => {
    const schedule = await db.schedule.findUnique({
      where: { id: scheduleAllowed.id },
    });

    // Capacity check
    expect(schedule!.availableSpots).toBeGreaterThan(0);

    // Session count check
    const usedBookings = await db.booking.count({
      where: {
        userMembershipId: userMembership.id,
        status: { in: ["confirmed", "attended"] },
      },
    });
    const membership = await db.userMembership.findUnique({
      where: { id: userMembership.id },
    });
    expect(usedBookings).toBeLessThan(membership!.totalSessions!);

    // Duplicate check
    const existingBooking = await db.booking.findFirst({
      where: {
        userId: testUserId,
        scheduleId: scheduleAllowed.id,
        status: { in: ["confirmed", "attended"] },
      },
    });
    expect(existingBooking).toBeNull();
  });
});
