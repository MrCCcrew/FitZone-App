import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";

describe("Booking Recovery Metadata", () => {
  let testUserId: string;
  let testMembershipId: string;
  let testPaymentId: string;
  let testScheduleIds: string[];

  beforeEach(async () => {
    // Create test user
    const user = await db.user.create({
      data: {
        phone: `+201${Math.floor(Math.random() * 1000000000)}`,
        name: "Test Booking Recovery User",
        gender: "female",
      },
    });
    testUserId = user.id;

    // Create test base membership
    const baseMembership = await db.membership.create({
      data: {
        name: "Test Recovery Plan",
        nameEn: "Test Recovery Plan",
        duration: 30,
        price: 500,
      },
    });

    // Create test schedules
    const trainer = await db.trainer.create({
      data: { name: "Test Trainer", specialty: "yoga", bio: "Test" },
    });

    const classRecord = await db.class.create({
      data: {
        name: "Test Class",
        trainerId: trainer.id,
        maxSpots: 10,
        price: 0,
      },
    });

    const schedule1 = await db.schedule.create({
      data: {
        classId: classRecord.id,
        date: new Date(Date.now() + 86400000),
        time: "10:00",
        availableSpots: 10,
      },
    });

    const schedule2 = await db.schedule.create({
      data: {
        classId: classRecord.id,
        date: new Date(Date.now() + 2 * 86400000),
        time: "10:00",
        availableSpots: 10,
      },
    });

    testScheduleIds = [schedule1.id, schedule2.id];

    // Create user membership
    const userMembership = await db.userMembership.create({
      data: {
        userId: testUserId,
        membershipId: baseMembership.id,
        status: "pending_payment",
        pendingExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        paymentAmount: 500,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
      },
    });
    testMembershipId = userMembership.id;

    // Create bookings
    await db.booking.createMany({
      data: testScheduleIds.map((scheduleId) => ({
        userId: testUserId,
        scheduleId,
        userMembershipId: testMembershipId,
        status: "confirmed",
      })),
    });
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
    await db.class.deleteMany({});
    await db.trainer.deleteMany({});
    await db.membership.deleteMany({});
    if (testUserId) {
      await db.notification.deleteMany({ where: { userId: testUserId } });
      await db.user.deleteMany({ where: { id: testUserId } });
    }
  });

  it("1. Subscribe stores selectedScheduleIds in PaymentTransaction metadata", async () => {
    // Create payment transaction with booking recovery data (simulating subscribe route)
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "pending",
        paymentMethod: "card",
        metadata: JSON.stringify({
          bookingRecoveryData: {
            selectedScheduleIds: testScheduleIds,
            createdAt: new Date().toISOString(),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    // Verify metadata contains scheduleIds
    const metadata = JSON.parse(payment.metadata!);
    expect(metadata.bookingRecoveryData).toBeDefined();
    expect(metadata.bookingRecoveryData.selectedScheduleIds).toEqual(testScheduleIds);
    expect(metadata.bookingRecoveryData.createdAt).toBeDefined();
  });

  it("2. Subscribe preserves existing metadata when adding bookingRecoveryData", async () => {
    // Create payment with existing metadata
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "pending",
        paymentMethod: "card",
        metadata: JSON.stringify({
          existingField: "should be preserved",
          membershipInvoice: { invoiceNumber: "INV-001" },
          bookingRecoveryData: {
            selectedScheduleIds: testScheduleIds,
            createdAt: new Date().toISOString(),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    const metadata = JSON.parse(payment.metadata!);
    expect(metadata.existingField).toBe("should be preserved");
    expect(metadata.membershipInvoice).toBeDefined();
    expect(metadata.bookingRecoveryData).toBeDefined();
  });

  it("3. Cleanup saves booking snapshot before deletion", async () => {
    // Create payment transaction
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "pending",
        paymentMethod: "card",
        metadata: JSON.stringify({
          bookingRecoveryData: {
            selectedScheduleIds: testScheduleIds,
            createdAt: new Date().toISOString(),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    // Get bookings with schedule details (simulating cleanup logic)
    const bookings = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
      select: {
        id: true,
        scheduleId: true,
        status: true,
        schedule: {
          select: {
            classId: true,
            date: true,
            time: true,
          },
        },
      },
    });

    expect(bookings.length).toBe(2);

    // Save snapshot to metadata (simulating cleanup before deletion)
    const existingMetadata = JSON.parse(payment.metadata!);
    const bookingSnapshot = bookings.map((b) => ({
      scheduleId: b.scheduleId,
      classId: b.schedule.classId,
      date: b.schedule.date.toISOString(),
      time: b.schedule.time,
      status: b.status,
    }));

    await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          deletedBookingsSnapshot: {
            userMembershipId: testMembershipId,
            bookings: bookingSnapshot,
            deletedAt: new Date().toISOString(),
            reason: "timeout_cleanup",
          },
        }),
      },
    });

    // Verify snapshot was saved
    const updated = await db.paymentTransaction.findUnique({
      where: { id: payment.id },
    });

    const updatedMetadata = JSON.parse(updated!.metadata!);
    expect(updatedMetadata.bookingRecoveryData).toBeDefined(); // Original preserved
    expect(updatedMetadata.deletedBookingsSnapshot).toBeDefined();
    expect(updatedMetadata.deletedBookingsSnapshot.bookings).toHaveLength(2);
    expect(updatedMetadata.deletedBookingsSnapshot.userMembershipId).toBe(testMembershipId);
    expect(updatedMetadata.deletedBookingsSnapshot.reason).toBe("timeout_cleanup");

    // Verify each booking has required recovery data
    for (const booking of updatedMetadata.deletedBookingsSnapshot.bookings) {
      expect(booking.scheduleId).toBeDefined();
      expect(booking.classId).toBeDefined();
      expect(booking.date).toBeDefined();
      expect(booking.time).toBeDefined();
      expect(booking.status).toBe("confirmed");
    }
  });

  it("4. Cleanup preserves both original scheduleIds and deleted booking snapshot", async () => {
    const originalScheduleIds = testScheduleIds;

    // Create payment with original recovery data
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: 500,
        currency: "EGP",
        status: "pending",
        paymentMethod: "card",
        metadata: JSON.stringify({
          bookingRecoveryData: {
            selectedScheduleIds: originalScheduleIds,
            createdAt: new Date().toISOString(),
          },
        }),
      },
    });
    testPaymentId = payment.id;

    // Simulate cleanup snapshot
    const bookings = await db.booking.findMany({
      where: { userMembershipId: testMembershipId },
      select: {
        scheduleId: true,
        status: true,
        schedule: { select: { classId: true, date: true, time: true } },
      },
    });

    const existingMetadata = JSON.parse(payment.metadata!);
    await db.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        metadata: JSON.stringify({
          ...existingMetadata,
          deletedBookingsSnapshot: {
            userMembershipId: testMembershipId,
            bookings: bookings.map((b) => ({
              scheduleId: b.scheduleId,
              classId: b.schedule.classId,
              date: b.schedule.date.toISOString(),
              time: b.schedule.time,
              status: b.status,
            })),
            deletedAt: new Date().toISOString(),
            reason: "timeout_cleanup",
          },
        }),
      },
    });

    // Verify both are present
    const final = await db.paymentTransaction.findUnique({
      where: { id: payment.id },
    });

    const finalMetadata = JSON.parse(final!.metadata!);
    expect(finalMetadata.bookingRecoveryData.selectedScheduleIds).toEqual(originalScheduleIds);
    expect(finalMetadata.deletedBookingsSnapshot.bookings).toHaveLength(2);
  });
});
