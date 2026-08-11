import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { recoverPaidMembershipActivation } from "@/lib/payments/recovery-service";

describe("Booking Restoration During Recovery", () => {
  let testUserId: string;
  let testMembershipId: string;
  let testBaseMembershipId: string;
  let testPaymentId: string;
  let testScheduleIds: string[];
  let testClassId: string;

  beforeEach(async () => {
    // Create test user
    const user = await db.user.create({
      data: {
        phone: `+201${Math.floor(Math.random() * 1000000000)}`,
        name: "Test Booking Restore User",
        gender: "female",
      },
    });
    testUserId = user.id;

    // Create test infrastructure
    const trainer = await db.trainer.create({
      data: { name: "Test Trainer", specialty: "yoga", bio: "Test" },
    });

    const classRecord = await db.class.create({
      data: {
        name: "Test Class",
        nameEn: "Test Class",
        trainerId: trainer.id,
        maxSpots: 10,
        price: 50,
        type: "group",
        duration: 60,
        intensity: "medium",
      },
    });
    testClassId = classRecord.id;

    // Create future schedules
    const schedule1 = await db.schedule.create({
      data: {
        classId: classRecord.id,
        date: new Date(Date.now() + 2 * 86400000), // 2 days future
        time: "10:00",
        availableSpots: 10,
      },
    });

    const schedule2 = await db.schedule.create({
      data: {
        classId: classRecord.id,
        date: new Date(Date.now() + 3 * 86400000), // 3 days future
        time: "10:00",
        availableSpots: 10,
      },
    });

    testScheduleIds = [schedule1.id, schedule2.id];

    // Create base membership
    const baseMembership = await db.membership.create({
      data: {
        name: "Test Recovery Plan",
        nameEn: "Test Recovery Plan",
        duration: 30,
        price: 500,
        kind: "subscription",
        features: JSON.stringify(["Test feature"]),
      },
    });
    testBaseMembershipId = baseMembership.id;

    // Create user membership
    const userMembership = await db.userMembership.create({
      data: {
        userId: testUserId,
        membershipId: testBaseMembershipId,
        status: "pending_payment",
        pendingExpiresAt: new Date(Date.now() - 1000), // Already expired
        paymentAmount: 500,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
      },
    });
    testMembershipId = userMembership.id;
  });

  afterEach(async () => {
    if (testPaymentId) {
      await db.paymentTransaction.deleteMany({ where: { id: testPaymentId } });
    }
    if (testMembershipId) {
      await db.booking.deleteMany({ where: { userMembershipId: testMembershipId } });
      await db.userMembership.deleteMany({ where: { id: testMembershipId } });
    }
    await db.schedule.deleteMany({ where: { id: { in: testScheduleIds } } });
    await db.class.deleteMany({ where: { id: testClassId } });
    await db.trainer.deleteMany({});
    await db.membership.deleteMany({ where: { id: testBaseMembershipId } });
    if (testUserId) {
      await db.notification.deleteMany({ where: { userId: testUserId } });
      await db.user.deleteMany({ where: { id: testUserId } });
    }
  });

  it("1. Restores bookings from deletedBookingsSnapshot", async () => {
    // Create payment with snapshot metadata
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          deletedBookingsSnapshot: {
            userMembershipId: testMembershipId,
            bookings: testScheduleIds.map((id) => ({
              scheduleId: id,
              classId: testClassId,
              date: new Date(Date.now() + 2 * 86400000).toISOString(),
              time: "10:00",
              status: "confirmed",
            })),
            deletedAt: new Date().toISOString(),
            reason: "timeout_cleanup",
          },
        }),
      },
    });
    testPaymentId = payment.id;

    // Verify no bookings initially
    const bookingsBefore = await db.booking.count({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookingsBefore).toBe(0);

    // Run recovery
    await recoverPaidMembershipActivation(testPaymentId);

    // Verify bookings restored
    const bookingsAfter = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookingsAfter.length).toBe(2);

    // Verify spots decremented
    for (const scheduleId of testScheduleIds) {
      const schedule = await db.schedule.findUnique({
        where: { id: scheduleId },
        select: { availableSpots: true },
      });
      expect(schedule?.availableSpots).toBe(9); // 10 - 1
    }

    // Verify membership activated
    const membership = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    expect(membership?.status).toBe("active");
  });

  it("2. Does nothing when bookings already exist", async () => {
    // Create existing booking
    await db.booking.create({
      data: {
        userId: testUserId,
        scheduleId: testScheduleIds[0],
        userMembershipId: testMembershipId,
        status: "confirmed",
      },
    });

    // Create payment with snapshot
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          deletedBookingsSnapshot: {
            bookings: [{ scheduleId: testScheduleIds[1], status: "confirmed" }],
          },
        }),
      },
    });
    testPaymentId = payment.id;

    await recoverPaidMembershipActivation(testPaymentId);

    // Verify still only 1 booking (no restoration)
    const bookings = await db.booking.count({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookings).toBe(1);
  });

  it("3. Skips full schedules safely", async () => {
    // Fill one schedule
    await db.schedule.update({
      where: { id: testScheduleIds[0] },
      data: { availableSpots: 0 },
    });

    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          deletedBookingsSnapshot: {
            bookings: testScheduleIds.map((id) => ({
              scheduleId: id,
              status: "confirmed",
            })),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    await recoverPaidMembershipActivation(testPaymentId);

    // Verify only 1 booking created (skipped full schedule)
    const bookings = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookings.length).toBe(1);
    expect(bookings[0].scheduleId).toBe(testScheduleIds[1]); // Only available one
  });

  it("4. Skips missing schedules safely", async () => {
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          deletedBookingsSnapshot: {
            bookings: [
              ...testScheduleIds.map((id) => ({ scheduleId: id, status: "confirmed" })),
              { scheduleId: "non-existent-schedule-id", status: "confirmed" },
            ],
          },
        }),
      },
    });
    testPaymentId = payment.id;

    await recoverPaidMembershipActivation(testPaymentId);

    // Verify only valid schedules booked
    const bookings = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookings.length).toBe(2); // Only existing schedules
  });

  it("5. Idempotent on second recovery", async () => {
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          deletedBookingsSnapshot: {
            bookings: testScheduleIds.map((id) => ({ scheduleId: id, status: "confirmed" })),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    // First recovery
    await recoverPaidMembershipActivation(testPaymentId);
    const bookingsAfterFirst = await db.booking.count({
      where: { userMembershipId: testMembershipId },
    });

    // Second recovery (membership already active)
    await recoverPaidMembershipActivation(testPaymentId);
    const bookingsAfterSecond = await db.booking.count({
      where: { userMembershipId: testMembershipId },
    });

    expect(bookingsAfterFirst).toBe(2);
    expect(bookingsAfterSecond).toBe(2); // No duplicates
  });

  it("6. Payment recovery succeeds even if booking restoration fails", async () => {
    // Create payment with no valid metadata
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: null, // No metadata
      },
    });
    testPaymentId = payment.id;

    // Should not throw
    await expect(recoverPaidMembershipActivation(testPaymentId)).resolves.toBeDefined();

    // Verify membership still activated
    const membership = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    expect(membership?.status).toBe("active");

    // No bookings created
    const bookings = await db.booking.count({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookings).toBe(0);
  });

  it("7. Fallback to bookingRecoveryData when snapshot unavailable", async () => {
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        metadata: JSON.stringify({
          bookingRecoveryData: {
            selectedScheduleIds: testScheduleIds,
            createdAt: new Date().toISOString(),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    await recoverPaidMembershipActivation(testPaymentId);

    // Verify bookings restored from fallback data
    const bookings = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
    });
    expect(bookings.length).toBe(2);
  });
});
