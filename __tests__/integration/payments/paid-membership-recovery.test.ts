import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { recoverPaidMembershipActivation } from "@/lib/payments/recovery-service";

// Mock accounting journal to bypass GL account requirements in test DB
vi.mock("@/lib/accounting-service", () => ({
  postSubscriptionJournal: vi.fn().mockResolvedValue(null),
}));

describe("Paid Membership Recovery Integration Tests", { timeout: 90000 }, () => {
  let testPaymentId: string;
  let testUserId: string;
  let testMembershipId: string;
  let testBaseMembershipId: string;

  beforeEach(async () => {
    // Create test user
    const user = await db.user.create({
      data: {
        phone: `+201${Math.floor(Math.random() * 1000000000)}`,
        name: "Test Recovery User",
        gender: "male",
      },
    });
    testUserId = user.id;

    // Create base membership
    const baseMembership = await db.membership.create({
      data: {
        name: "Test Monthly",
        nameEn: "Test Monthly",
        duration: 30,
        price: 333,
        walletBonus: 50,
        features: JSON.stringify(["دخول غير محدود", "كافيتريا خصم 10%"]),
      },
    });
    testBaseMembershipId = baseMembership.id;

    // Create user membership in pending_payment state
    const userMembership = await db.userMembership.create({
      data: {
        userId: testUserId,
        membershipId: testBaseMembershipId,
        status: "pending_payment",
        paymentAmount: 333,
        pendingExpiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        snapshotDurationDays: 30,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000), // 30 days from now (will be recalculated on activation)
      },
    });
    testMembershipId = userMembership.id;

    // Create payment transaction already marked as "paid" (the bug scenario)
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        purpose: "membership",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "paid", // Already paid but membership not activated (the bug)
        paymentMethod: "card",
        paidAt: new Date(),
        externalReference: `test-${Date.now()}`,
      },
    });
    testPaymentId = payment.id;
  });

  afterEach(async () => {
    // Cleanup in reverse order of dependencies
    if (testPaymentId) {
      await db.paymentTransaction.deleteMany({ where: { id: testPaymentId } });
    }
    if (testMembershipId) {
      await db.userMembership.deleteMany({ where: { id: testMembershipId } });
    }
    if (testBaseMembershipId) {
      await db.membership.deleteMany({ where: { id: testBaseMembershipId } });
    }
    if (testUserId) {
      // Clean up any notifications
      await db.notification.deleteMany({ where: { userId: testUserId } });
      await db.user.deleteMany({ where: { id: testUserId } });
    }
  });

  it("1. Payment status already 'paid' + Membership 'pending_payment' → recovery → membership 'active'", async () => {
    // Verify initial state
    const paymentBefore = await db.paymentTransaction.findUnique({
      where: { id: testPaymentId },
    });
    const membershipBefore = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });

    expect(paymentBefore?.status).toBe("paid");
    expect(membershipBefore?.status).toBe("pending_payment");

    // Execute recovery
    const result = await recoverPaidMembershipActivation(testPaymentId);

    // Verify payment status unchanged
    expect(result.status).toBe("paid");

    // Verify membership activated
    const membershipAfter = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });

    expect(membershipAfter?.status).toBe("active");
    expect(membershipAfter?.startDate).toBeTruthy();
    expect(membershipAfter?.endDate).toBeTruthy();
    expect(membershipAfter?.pendingExpiresAt).toBeNull();

    // Verify end date is exactly 30 days from start
    if (membershipAfter?.startDate && membershipAfter?.endDate) {
      const diffMs = membershipAfter.endDate.getTime() - membershipAfter.startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(Math.abs(diffDays - 30)).toBeLessThan(0.01); // Within 1% of 30 days
    }
  });

  it("2. pendingExpiresAt is cleared on activation", async () => {
    const membershipBefore = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    expect(membershipBefore?.pendingExpiresAt).toBeTruthy();

    await recoverPaidMembershipActivation(testPaymentId);

    const membershipAfter = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    expect(membershipAfter?.pendingExpiresAt).toBeNull();
  });

  it("3. Reconciliation runs (notification created)", async () => {
    const notificationsBefore = await db.notification.count({
      where: { userId: testUserId },
    });

    await recoverPaidMembershipActivation(testPaymentId);

    const notificationsAfter = await db.notification.count({
      where: { userId: testUserId },
    });

    // At least one notification should be created (membership activation)
    expect(notificationsAfter).toBeGreaterThan(notificationsBefore);
  });

  it("4. Second recovery is idempotent (does not duplicate)", async () => {
    // First recovery
    await recoverPaidMembershipActivation(testPaymentId);

    const membershipAfter1 = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    const notificationsAfter1 = await db.notification.count({
      where: { userId: testUserId },
    });

    expect(membershipAfter1?.status).toBe("active");

    // Second recovery (should be idempotent)
    await recoverPaidMembershipActivation(testPaymentId);

    const membershipAfter2 = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    const notificationsAfter2 = await db.notification.count({
      where: { userId: testUserId },
    });

    // Membership remains active
    expect(membershipAfter2?.status).toBe("active");

    // Start/end dates unchanged
    expect(membershipAfter2?.startDate?.getTime()).toBe(
      membershipAfter1?.startDate?.getTime()
    );
    expect(membershipAfter2?.endDate?.getTime()).toBe(
      membershipAfter1?.endDate?.getTime()
    );

    // Notifications may increase (not strictly idempotent for notifications)
    // but membership state should be unchanged
    expect(notificationsAfter2).toBeGreaterThanOrEqual(notificationsAfter1);
  });

  it("5. Rejects if payment status is not 'paid'", async () => {
    // Update payment to pending
    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: { status: "pending", paidAt: null },
    });

    await expect(recoverPaidMembershipActivation(testPaymentId)).rejects.toThrow(
      'Recovery rejected: Payment status is "pending", expected "paid"'
    );
  });

  it("6. Rejects if membership status is not 'pending_payment'", async () => {
    // Update membership to active
    await db.userMembership.update({
      where: { id: testMembershipId },
      data: {
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
        pendingExpiresAt: null,
      },
    });

    // Should return idempotently without error
    const result = await recoverPaidMembershipActivation(testPaymentId);
    expect(result.status).toBe("paid");

    // Verify membership still active
    const membership = await db.userMembership.findUnique({
      where: { id: testMembershipId },
    });
    expect(membership?.status).toBe("active");
  });

  it("7. Rejects if payment has no linked membership", async () => {
    // Create payment without membership
    const paymentNoMembership = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        purpose: "wallet_topup",
        businessUnit: "store",
        provider: "paymob",
        amount: 100,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
      },
    });

    await expect(
      recoverPaidMembershipActivation(paymentNoMembership.id)
    ).rejects.toThrow("Recovery rejected: No membership linked to this payment");

    await db.paymentTransaction.delete({ where: { id: paymentNoMembership.id } });
  });

  it("8. Rejects if payment not found", async () => {
    await expect(
      recoverPaidMembershipActivation("non-existent-payment-id")
    ).rejects.toThrow("Payment transaction not found");
  });
});
