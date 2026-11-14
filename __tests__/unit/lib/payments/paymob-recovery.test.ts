/**
 * Paymob Payment Recovery Tests
 *
 * Tests for recoverVerifiedPaymobPayment() - atomic verified payment recovery
 * with remote Paymob verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { recoverVerifiedPaymobPayment, updatePaymentTransactionStatus, type VerifiedPaymobRecoveryInput } from "@/lib/payments/service";
import * as paymobProvider from "@/lib/payments/providers/paymob";

// Mock Paymob remote verification
// Prevent real email delivery during isolated financial tests.
vi.mock("@/lib/email", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(original).map(([key, value]) => [
      key,
      typeof value === "function" && /^(send|notify)/i.test(key)
        ? vi.fn().mockResolvedValue(undefined)
        : value,
    ]),
  );
});

vi.mock("@/lib/payments/providers/paymob", async () => {
  const actual = await vi.importActual("@/lib/payments/providers/paymob");
  return {
    ...actual,
    verifyPaymobTransactionForRecovery: vi.fn(),
    confirmPaymobOrderPaidForRecovery: vi.fn(),
  };
});

function uniqueTestReference(prefix = "FZ-Offers") {
  const suffix = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${Date.now()}${suffix}`;
}

describe("Paymob Payment Recovery", () => {
  let testUserId: string;
  let testMembershipPlanId: string;
  let testUserMembershipId: string;
  let testPaymentId: string;
  let testReferenceCode: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    testReferenceCode = uniqueTestReference();
    testUserId = `paymob-recovery-user-${timestamp}`;

    // Create test user
    await db.user.create({
      data: {
        id: testUserId,
        email: `recovery-${timestamp}@test.local`,
        name: "Gana Ehab",
        phone: "01012345678",
      },
    });

    // Create test membership plan
    testMembershipPlanId = `plan-${timestamp}`;
    await db.membership.create({
      data: {
        id: testMembershipPlanId,
        name: "باقة التعافي",
        nameEn: "Recovery Plan",
        price: 333,
        duration: 30,
        kind: "subscription",
        sessionsCount: 12,
        features: JSON.stringify(["تدريب جماعي", "تمارين متنوعة"]),
      },
    });

    // Create pending user membership
    testUserMembershipId = `usermem-${timestamp}`;
    await db.userMembership.create({
      data: {
        id: testUserMembershipId,
        userId: testUserId,
        membershipId: testMembershipPlanId,
        status: "pending_payment",
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pendingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        snapshotDurationDays: 30,
        paymentAmount: 333,
      },
    });

    // Create pending payment transaction with intention ID
    testPaymentId = `payment-${timestamp}`;
    await db.paymentTransaction.create({
      data: {
        id: testPaymentId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        referenceCode: testReferenceCode,
        purpose: "subscription",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "pending",
        paymentMethod: "wallet",
        providerReference: "pi_live_test_intention_123",
      },
    });

    // PAYMOB_RECOVERY_LIVE_ORDER_AUTHORITY_V1
    // Existing successful recovery fixtures also require Order proof.
    vi.mocked(
      paymobProvider.confirmPaymobOrderPaidForRecovery,
    ).mockReset();
    vi.mocked(
      paymobProvider.confirmPaymobOrderPaidForRecovery,
    ).mockResolvedValue(true);

    // Mock successful Paymob verification for all tests by default
    // LIVE PAYMOB RESPONSE: merchant_order_id (not special_reference) proves linkage
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockImplementation(
      async (paymobTxId, localTxId) => ({
        verified: true,
        transactionId: "512944958",
        success: true,
        pending: false,
        amountCents: 33300,
        currency: "EGP",
        paymobOrderId: 584723754,
        specialReference: null, // LIVE PAYMOB: special_reference is NULL
        sourceType: "wallet",
        isRefunded: false,
        isVoided: false,
        errorOccured: false,
      })
    );
  });

  afterEach(async () => {
    await db.paymentTransaction.deleteMany({ where: { id: testPaymentId } });
    await db.userMembership.deleteMany({ where: { id: testUserMembershipId } });
    await db.membership.deleteMany({ where: { id: testMembershipPlanId } });
    await db.user.deleteMany({ where: { id: testUserId } });
  });

  // P0_R195_SUBSCRIPTION_FAILURE_GUARD
  it.each(["subscription", "membership"] as const)(
    "preserves the original pending reservation after a failed %s Paymob attempt inside the hold",
    async (purpose) => {
      const originalDeadline = new Date(Date.now() + 30 * 60 * 1000);

      await db.paymentTransaction.update({
        where: { id: testPaymentId },
        data: {
          purpose,
          status: "pending",
          expiresAt: originalDeadline,
        },
      });

      await db.userMembership.update({
        where: { id: testUserMembershipId },
        data: {
          status: "pending_payment",
          pendingExpiresAt: originalDeadline,
        },
      });

      await updatePaymentTransactionStatus(testPaymentId, "failed");

      const payment = await db.paymentTransaction.findUniqueOrThrow({
        where: { id: testPaymentId },
      });

      const membership = await db.userMembership.findUniqueOrThrow({
        where: { id: testUserMembershipId },
      });

      expect(payment.status).toBe("pending");
      expect(payment.failedAt).toBeNull();
      expect(membership.status).toBe("pending_payment");
      expect(membership.pendingExpiresAt?.getTime()).toBe(
        originalDeadline.getTime(),
      );
    },
  );

  it("rejects recovery without live Paymob Order proof before DB mutation", async () => {
    vi.mocked(
      paymobProvider.confirmPaymobOrderPaidForRecovery,
    ).mockResolvedValueOnce(false);

    await expect(
      recoverVerifiedPaymobPayment({
        paymentTransactionId: testPaymentId,
        paymobTransactionId: "512944958",
        expectedAmount: 333,
        expectedCurrency: "EGP",
        expectedFitZoneReference: testReferenceCode,
        expectedIntentionId: "pi_live_test_intention_123",
      }),
    ).rejects.toThrow("PAYMOB_ORDER_PAID_PROOF_REQUIRED");

    const payment = await db.paymentTransaction.findUniqueOrThrow({
      where: { id: testPaymentId },
    });
    const membership = await db.userMembership.findUniqueOrThrow({
      where: { id: testUserMembershipId },
    });

    expect(payment.status).toBe("pending");
    expect(payment.externalReference).toBeNull();
    expect(membership.status).toBe("pending_payment");
  });

  it("recovers a verified successful Paymob Order after a local failed attempt while membership is pending", async () => {
    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: { status: "failed", failedAt: new Date() },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    const result = await recoverVerifiedPaymobPayment(input);
    expect(result.status).toBe("paid");

    const membership = await db.userMembership.findUniqueOrThrow({
      where: { id: testUserMembershipId },
    });
    expect(membership.status).toBe("active");

    const repeated = await recoverVerifiedPaymobPayment(input);
    expect(repeated.status).toBe("paid");

    const payments = await db.paymentTransaction.count({
      where: { membershipId: testUserMembershipId, status: "paid" },
    });
    expect(payments).toBe(1);
  });

  it("does not automatically reopen a failed and cancelled membership without cancellation evidence", async () => {
    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: { status: "failed", failedAt: new Date() },
    });

    await db.userMembership.update({
      where: { id: testUserMembershipId },
      data: { status: "cancelled", pendingExpiresAt: null },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input))
      .rejects.toThrow("not recoverable");

    const payment = await db.paymentTransaction.findUniqueOrThrow({
      where: { id: testPaymentId },
    });
    const membership = await db.userMembership.findUniqueOrThrow({
      where: { id: testUserMembershipId },
    });

    expect(payment.status).toBe("failed");
    expect(membership.status).toBe("cancelled");
  });

  it("1. successful verified recovery", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    const result = await recoverVerifiedPaymobPayment(input);

    expect(result.status).toBe("paid");
    expect(result.externalReference).toBe("512944958");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("paid");
    expect(payment?.externalReference).toBe("512944958");
    expect(payment?.metadata).toContain("verifiedPaymobRecovery");

    const membership = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });
    expect(membership?.status).toBe("active");
    expect(membership?.startDate).toBeTruthy();
    expect(membership?.endDate).toBeTruthy();
  }, 20000);

  it("2. amount mismatch rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 500, // Wrong amount
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("amount or currency mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");

    const membership = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });
    expect(membership?.status).toBe("pending_payment");
  });

  it("3. currency mismatch rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "USD", // Wrong currency
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("amount or currency mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("4. FitZone reference mismatch rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-9999999", // Wrong reference
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("FitZone reference mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("5. intention ID mismatch rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_wrong_intention", // Wrong intention
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("intention mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("6. duplicate paid payment rejected", async () => {
    // Create a duplicate paid payment for same user and membership
    const duplicatePaidId = `dup-paid-${Date.now()}`;
    const duplicatePaidReferenceCode = uniqueTestReference();
    await db.paymentTransaction.create({
      data: {
        id: duplicatePaidId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        referenceCode: duplicatePaidReferenceCode,
        purpose: "subscription",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "paid",
        paymentMethod: "paymob",
        paidAt: new Date(),
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("duplicate paid payment");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");

    await db.paymentTransaction.deleteMany({ where: { id: duplicatePaidId } });
  });

  it("7. single active membership is used as carryover source and superseded", async () => {
    await db.userMembership.update({
      where: { id: testUserMembershipId },
      data: {
        totalSessions: 12,
        baseSessions: 12,
      },
    });

    const sourceMembershipId = `carryover-source-${Date.now()}`;

    await db.userMembership.create({
      data: {
        id: sourceMembershipId,
        userId: testUserId,
        membershipId: testMembershipPlanId,
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        snapshotDurationDays: 30,
        paymentAmount: 333,
        totalSessions: 12,
        baseSessions: 12,
      },
    });

    try {
      const input: VerifiedPaymobRecoveryInput = {
        paymentTransactionId: testPaymentId,
        paymobTransactionId: "512944958",
        expectedAmount: 333,
        expectedCurrency: "EGP",
        expectedFitZoneReference: testReferenceCode,
        expectedIntentionId: "pi_live_test_intention_123",
      };

      const result = await recoverVerifiedPaymobPayment(input);

      expect(result.status).toBe("paid");

      const payment = await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      });

      expect(payment?.status).toBe("paid");

      const targetMembership = await db.userMembership.findUnique({
        where: { id: testUserMembershipId },
      });

      expect(targetMembership?.status).toBe("active");
      expect(targetMembership?.baseSessions).toBe(12);
      expect(targetMembership?.carryoverSessions).toBe(12);
      expect(targetMembership?.totalSessions).toBe(24);
      expect(targetMembership?.carryoverFromMembershipId).toBe(sourceMembershipId);
      expect(targetMembership?.carryoverAppliedAt).toBeTruthy();

      const sourceMembership = await db.userMembership.findUnique({
        where: { id: sourceMembershipId },
      });

      expect(sourceMembership?.status).toBe("expired");
    } finally {
      await db.userMembership.deleteMany({
        where: { id: sourceMembershipId },
      });
    }
  }, 20000);

  it("8. exact retry idempotent", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    // First recovery
    const result1 = await recoverVerifiedPaymobPayment(input);
    expect(result1.status).toBe("paid");

    const payment1 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const membership1 = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });

    // Exact retry (idempotent)
    const result2 = await recoverVerifiedPaymobPayment(input);
    expect(result2.status).toBe("paid");

    const payment2 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const membership2 = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });

    // Should be identical
    expect(payment2?.status).toBe(payment1?.status);
    expect(payment2?.externalReference).toBe(payment1?.externalReference);
    expect(membership2?.status).toBe(membership1?.status);
    expect(membership2?.startDate?.getTime()).toBe(membership1?.startDate?.getTime());
    expect(membership2?.endDate?.getTime()).toBe(membership1?.endDate?.getTime());
  }, 20000);

  it("9. conflicting Paymob transaction ID rejected", async () => {
    // Set a different externalReference
    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: { externalReference: "999888777" },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958", // Different from existing
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("conflicts with existing evidence");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
    expect(payment?.externalReference).toBe("999888777"); // Unchanged
  });

  it("10. activation failure rolls back payment AND membership", async () => {
    // Mark membership as cancelled (non-recoverable)
    await db.userMembership.update({
      where: { id: testUserMembershipId },
      data: { status: "cancelled" },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("not recoverable");

    // Verify rollback: payment still pending, membership still cancelled
    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
    expect(payment?.externalReference).toBeNull(); // Not set due to rollback

    const membership = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });
    expect(membership?.status).toBe("cancelled"); // Unchanged
  });


  // PAYMOB_PRE_EXPIRY_CANCELLED_RECOVERY_CHARACTERIZATION
  it("10a. recovers verified paid-before-expiry membership cancelled by an earlier failed attempt", async () => {
    const failedAt = new Date("2026-10-07T15:51:00.000Z");
    const paidAt = new Date("2026-10-07T15:59:52.462Z");
    const expiresAt = new Date("2026-10-07T16:20:48.553Z");

    await db.userMembership.update({
      where: { id: testUserMembershipId },
      data: {
        status: "cancelled",
        pendingExpiresAt: null,
        activatedAt: null,
      },
    });

    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: {
        status: "paid",
        failedAt,
        paidAt,
        expiresAt,
        externalReference: "512944958",
        metadata: JSON.stringify({
          latePaymentWarning: true,
          membershipStatus: "cancelled",
          paymentReceivedAt: paidAt.toISOString(),
        }),
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    const result = await recoverVerifiedPaymobPayment(input);

    expect(result.status).toBe("paid");

    const membership = await db.userMembership.findUnique({
      where: { id: testUserMembershipId },
    });

    expect(membership?.status).toBe("active");
    expect(membership?.activatedAt).not.toBeNull();
    expect(membership?.pendingExpiresAt).toBeNull();
  }, 20000);

  it("10b. does not recover a cancelled membership when payment succeeded after checkout expiry", async () => {
    const failedAt = new Date("2026-10-07T15:51:00.000Z");
    const expiresAt = new Date("2026-10-07T16:20:48.553Z");
    const paidAt = new Date("2026-10-07T16:21:00.000Z");

    await db.userMembership.update({
      where: { id: testUserMembershipId },
      data: {
        status: "cancelled",
        pendingExpiresAt: null,
        activatedAt: null,
      },
    });

    await db.paymentTransaction.update({
      where: { id: testPaymentId },
      data: {
        status: "paid",
        failedAt,
        paidAt,
        expiresAt,
        externalReference: "512944958",
        metadata: JSON.stringify({
          latePaymentWarning: true,
          membershipStatus: "cancelled",
          paymentReceivedAt: paidAt.toISOString(),
        }),
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(
      recoverVerifiedPaymobPayment(input),
    ).rejects.toThrow("not recoverable");

    const membership = await db.userMembership.findUnique({
      where: { id: testUserMembershipId },
    });

    expect(membership?.status).toBe("cancelled");
    expect(membership?.activatedAt).toBeNull();
  }, 20000);

  it("11. wrong intention ID rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_wrong_intention", // Wrong intention
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("intention mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("12. merchant_order_id mismatch rejected", async () => {
    // Mock Paymob returning wrong merchant_order_id (belongs to different payment)
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: true,
      pending: false,
      amountCents: 33300,
      currency: "EGP",
      paymobOrderId: 584723754,
      specialReference: null, // LIVE PAYMOB: null
      sourceType: "wallet",
      isRefunded: false,
      isVoided: false,
      errorOccured: false,
      failureReason: `merchant_order_id=different-payment-id (expected ${testPaymentId} to prove transaction linkage)`,
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    // Verify NO local mutations occurred
    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
    expect(payment?.externalReference).toBeNull();
  });

  it("13. remote verification failure prevents recovery", async () => {
    // Mock failed remote verification (transaction not successful)
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: false,
      pending: true,
      amountCents: 33300,
      currency: "EGP",
      paymobOrderId: 584723754,
      specialReference: testReferenceCode,
      sourceType: "wallet",
      isRefunded: false,
      isVoided: false,
      errorOccured: false,
      failureReason: "success=false, pending=true",
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    // Verify NO local mutations occurred
    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
    expect(payment?.externalReference).toBeNull();

    const membership = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });
    expect(membership?.status).toBe("pending_payment");
  });

  it("13. refunded transaction rejected", async () => {
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: true,
      pending: false,
      amountCents: 33300,
      currency: "EGP",
      paymobOrderId: 584723754,
      specialReference: testReferenceCode,
      sourceType: "wallet",
      isRefunded: true, // Refunded
      isVoided: false,
      errorOccured: false,
      failureReason: "refunded",
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("14. voided transaction rejected", async () => {
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: true,
      pending: false,
      amountCents: 33300,
      currency: "EGP",
      paymobOrderId: 584723754,
      specialReference: testReferenceCode,
      sourceType: "wallet",
      isRefunded: false,
      isVoided: true, // Voided
      errorOccured: false,
      failureReason: "voided",
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("15. remote amount mismatch rejected", async () => {
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: true,
      pending: false,
      amountCents: 50000, // Wrong amount (500 instead of 333)
      currency: "EGP",
      paymobOrderId: 584723754,
      specialReference: testReferenceCode,
      sourceType: "wallet",
      isRefunded: false,
      isVoided: false,
      errorOccured: false,
      failureReason: "amount=500 (expected 333)",
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("16. remote currency mismatch rejected", async () => {
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockResolvedValueOnce({
      verified: false,
      transactionId: "512944958",
      success: true,
      pending: false,
      amountCents: 33300,
      currency: "USD", // Wrong currency
      paymobOrderId: 584723754,
      specialReference: testReferenceCode,
      sourceType: "wallet",
      isRefunded: false,
      isVoided: false,
      errorOccured: false,
      failureReason: "currency=USD (expected EGP)",
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: testReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("17. missing provider reference (intention ID) rejected", async () => {
    // Create payment without providerReference
    const noIntentionPaymentId = `payment-no-intention-${Date.now()}`;
    const noIntentionReferenceCode = uniqueTestReference("FZ-Test");
    await db.paymentTransaction.create({
      data: {
        id: noIntentionPaymentId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        referenceCode: noIntentionReferenceCode,
        purpose: "subscription",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "pending",
        paymentMethod: "wallet",
        providerReference: null, // No intention ID
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: noIntentionPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: noIntentionReferenceCode,
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("intention mismatch");

    await db.paymentTransaction.deleteMany({ where: { id: noIntentionPaymentId } });
  });

  it("18. verified late payment recovers timeout-cancelled membership and booking exactly once", async () => {
    const timestamp = Date.now();
    const trainerId = `timeout-recovery-trainer-${timestamp}`;
    const classId = `timeout-recovery-class-${timestamp}`;
    const scheduleId = `timeout-recovery-schedule-${timestamp}`;

    try {
      await db.trainer.create({
        data: {
          id: trainerId,
          name: "Timeout Recovery Trainer",
          specialty: "fitness",
          bio: "Test",
          isActive: true,
        },
      });

      await db.class.create({
        data: {
          id: classId,
          name: "Timeout Recovery Class",
          trainerId,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 10,
          price: 100,
          isActive: true,
        },
      });

      await db.schedule.create({
        data: {
          id: scheduleId,
          classId,
          date: new Date(Date.now() + 24 * 60 * 60 * 1000),
          time: "10:00",
          availableSpots: 10,
          isActive: true,
        },
      });

      // Reproduce the exact local state left by timeout cleanup:
      // payment cancelled + membership cancelled + deleted booking snapshot.
      await db.userMembership.update({
        where: { id: testUserMembershipId },
        data: {
          status: "cancelled",
          pendingExpiresAt: null,
        },
      });

      await db.paymentTransaction.update({
        where: { id: testPaymentId },
        data: {
          status: "cancelled",
          metadata: JSON.stringify({
            deletedBookingsSnapshot: {
              userMembershipId: testUserMembershipId,
              reason: "timeout_cleanup",
              deletedAt: new Date().toISOString(),
              bookings: [
                {
                  scheduleId,
                  classId,
                  date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                  time: "10:00",
                  status: "confirmed",
                },
              ],
            },
          }),
        },
      });

      const input: VerifiedPaymobRecoveryInput = {
        paymentTransactionId: testPaymentId,
        paymobTransactionId: "512944958",
        expectedAmount: 333,
        expectedCurrency: "EGP",
        expectedFitZoneReference: testReferenceCode,
        expectedIntentionId: "pi_live_test_intention_123",
      };

      const before = await db.schedule.findUnique({
        where: { id: scheduleId },
        select: { availableSpots: true },
      });

      expect(before?.availableSpots).toBe(10);

      // First late-payment recovery.
      const first = await recoverVerifiedPaymobPayment(input);

      expect(first.status).toBe("paid");

      const paymentAfterFirst = await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      });

      const membershipAfterFirst = await db.userMembership.findUnique({
        where: { id: testUserMembershipId },
      });

      const bookingsAfterFirst = await db.booking.findMany({
        where: {
          userMembershipId: testUserMembershipId,
          scheduleId,
        },
      });

      const scheduleAfterFirst = await db.schedule.findUnique({
        where: { id: scheduleId },
        select: { availableSpots: true },
      });

      expect(paymentAfterFirst?.status).toBe("paid");
      expect(paymentAfterFirst?.externalReference).toBe("512944958");
      expect(membershipAfterFirst?.status).toBe("active");

      expect(bookingsAfterFirst).toHaveLength(1);
      expect(bookingsAfterFirst[0]?.status).toBe("confirmed");
      expect(bookingsAfterFirst[0]?.paidAmount).toBe(100);

      expect(scheduleAfterFirst?.availableSpots).toBe(9);

      // Exact retry must be idempotent:
      // no second booking and no second seat decrement.
      const second = await recoverVerifiedPaymobPayment(input);

      expect(second.status).toBe("paid");

      const bookingsAfterSecond = await db.booking.findMany({
        where: {
          userMembershipId: testUserMembershipId,
          scheduleId,
        },
      });

      const scheduleAfterSecond = await db.schedule.findUnique({
        where: { id: scheduleId },
        select: { availableSpots: true },
      });

      expect(bookingsAfterSecond).toHaveLength(1);
      expect(scheduleAfterSecond?.availableSpots).toBe(9);
    } finally {
      await db.booking.deleteMany({
        where: {
          userMembershipId: testUserMembershipId,
          scheduleId,
        },
      });

      await db.schedule.deleteMany({ where: { id: scheduleId } });
      await db.class.deleteMany({ where: { id: classId } });
      await db.trainer.deleteMany({ where: { id: trainerId } });
    }
  }, 30000);


  // P0_PURCHASED_DURATION_REGRESSION_R15
  // Actual isolated DB recovery: a later plan edit must never alter
  // the purchased 90-day or 180-day entitlement.
  for (const purchasedDays of [90, 180] as const) {
    it(
      `P0 purchased ${purchasedDays} days survives plan edit and payment replay`,
      async () => {
        const changedPlanDays = purchasedDays === 90 ? 180 : 90;

        // The customer has already purchased this duration.
        await db.userMembership.update({
          where: { id: testUserMembershipId },
          data: {
            snapshotDurationDays: purchasedDays,
            endDate: new Date(
              Date.now() + purchasedDays * 86400000,
            ),
          },
        });

        // The admin subsequently changes the catalog plan.
        await db.membership.update({
          where: { id: testMembershipPlanId },
          data: { duration: changedPlanDays },
        });

        const input: VerifiedPaymobRecoveryInput = {
          paymentTransactionId: testPaymentId,
          paymobTransactionId: "512944958",
          expectedAmount: 333,
          expectedCurrency: "EGP",
          expectedFitZoneReference: testReferenceCode,
          expectedIntentionId: "pi_live_test_intention_123",
        };

        const first = await recoverVerifiedPaymobPayment(input);
        expect(first.status).toBe("paid");

        const activated = await db.userMembership.findUniqueOrThrow({
          where: { id: testUserMembershipId },
        });

        expect(activated.status).toBe("active");
        expect(activated.snapshotDurationDays).toBe(purchasedDays);
        expect(activated.startDate).toBeInstanceOf(Date);
        expect(activated.endDate).toBeInstanceOf(Date);

        const expectedMilliseconds = purchasedDays * 86400000;
        const actualMilliseconds =
          activated.endDate.getTime() -
          activated.startDate.getTime();

        expect(Math.abs(actualMilliseconds - expectedMilliseconds))
          .toBeLessThanOrEqual(1000);

        // Repeat the verified recovery: no extra duration or new start.
        const second = await recoverVerifiedPaymobPayment(input);
        expect(second.status).toBe("paid");

        const repeated = await db.userMembership.findUniqueOrThrow({
          where: { id: testUserMembershipId },
        });

        expect(repeated.startDate.getTime()).toBe(
          activated.startDate.getTime(),
        );
        expect(repeated.endDate.getTime()).toBe(
          activated.endDate.getTime(),
        );
        expect(repeated.snapshotDurationDays).toBe(purchasedDays);

        const plan = await db.membership.findUniqueOrThrow({
          where: { id: testMembershipPlanId },
        });

        expect(plan.duration).toBe(changedPlanDays);

        console.log(
          `P0_PURCHASE_${purchasedDays}_PLAN_${changedPlanDays}=PASS`,
        );
        console.log(
          `P0_PURCHASE_${purchasedDays}_EXACT_RETRY=PASS`,
        );
      },
      20000,
    );
  }

  // P0_LEGACY_INVOICE_REGRESSION_R19
  // All cases use the existing Paymob verification and Order-proof mocks.
  for (const purchasedDays of [90, 180] as const) {
    it(`P0 legacy invoice ${purchasedDays} days survives changed plan`, async () => {
      const purchasedStart = new Date("2026-11-08T22:00:00.000Z");
      const purchasedEnd = new Date(
        purchasedStart.getTime() + purchasedDays * 86400000,
      );
      const currentPlanDays = purchasedDays === 90 ? 180 : 90;

      await db.userMembership.update({
        where: { id: testUserMembershipId },
        data: {
          snapshotDurationDays: null,
          startDate: purchasedStart,
          endDate: purchasedEnd,
        },
      });

      await db.membership.update({
        where: { id: testMembershipPlanId },
        data: { duration: currentPlanDays },
      });

      const existingPayment = await db.paymentTransaction.findUniqueOrThrow({
        where: { id: testPaymentId },
      });
      const existingMetadata = existingPayment.metadata
        ? JSON.parse(existingPayment.metadata)
        : {};

      await db.paymentTransaction.update({
        where: { id: testPaymentId },
        data: {
          metadata: JSON.stringify({
            ...existingMetadata,
            membershipInvoice: {
              startDate: purchasedStart.toISOString(),
              endDate: purchasedEnd.toISOString(),
              finalAmount: 333,
            },
          }),
        },
      });

      const input: VerifiedPaymobRecoveryInput = {
        paymentTransactionId: testPaymentId,
        paymobTransactionId: "512944958",
        expectedAmount: 333,
        expectedCurrency: "EGP",
        expectedFitZoneReference: testReferenceCode,
        expectedIntentionId: "pi_live_test_intention_123",
      };

      const result = await recoverVerifiedPaymobPayment(input);
      expect(result.status).toBe("paid");

      const activated = await db.userMembership.findUniqueOrThrow({
        where: { id: testUserMembershipId },
      });

      expect(activated.status).toBe("active");
      expect(activated.snapshotDurationDays).toBeNull();
      expect(
        Math.abs(
          activated.endDate.getTime() -
          activated.startDate.getTime() -
          purchasedDays * 86400000,
        ),
      ).toBeLessThanOrEqual(1000);

      const repeated = await recoverVerifiedPaymobPayment(input);
      expect(repeated.status).toBe("paid");

      const afterRetry = await db.userMembership.findUniqueOrThrow({
        where: { id: testUserMembershipId },
      });

      expect(afterRetry.startDate.getTime()).toBe(
        activated.startDate.getTime(),
      );
      expect(afterRetry.endDate.getTime()).toBe(
        activated.endDate.getTime(),
      );
    }, 20000);
  }

  for (const failureMode of ["missing", "conflicting"] as const) {
    it(`P0 legacy invoice ${failureMode} refuses unproven duration`, async () => {
      const originalStart = new Date("2026-11-08T22:00:00.000Z");
      const originalEnd = new Date(
        originalStart.getTime() + 90 * 86400000,
      );

      await db.userMembership.update({
        where: { id: testUserMembershipId },
        data: {
          snapshotDurationDays: null,
          startDate: originalStart,
          endDate: originalEnd,
        },
      });

      const existingPayment = await db.paymentTransaction.findUniqueOrThrow({
        where: { id: testPaymentId },
      });

      const existingMetadata = existingPayment.metadata
        ? JSON.parse(existingPayment.metadata)
        : {};

      delete existingMetadata.membershipInvoice;

      if (failureMode === "conflicting") {
        existingMetadata.membershipInvoice = {
          startDate: originalStart.toISOString(),
          endDate: new Date(
            originalStart.getTime() + 180 * 86400000,
          ).toISOString(),
          finalAmount: 333,
        };
      }

      await db.paymentTransaction.update({
        where: { id: testPaymentId },
        data: { metadata: JSON.stringify(existingMetadata) },
      });

      await expect(
        recoverVerifiedPaymobPayment({
          paymentTransactionId: testPaymentId,
          paymobTransactionId: "512944958",
          expectedAmount: 333,
          expectedCurrency: "EGP",
          expectedFitZoneReference: testReferenceCode,
          expectedIntentionId: "pi_live_test_intention_123",
        }),
      ).rejects.toThrow("PURCHASE_DURATION_PROOF_REQUIRED");

      const membership = await db.userMembership.findUniqueOrThrow({
        where: { id: testUserMembershipId },
      });
      const payment = await db.paymentTransaction.findUniqueOrThrow({
        where: { id: testPaymentId },
      });

      expect(membership.status).toBe("pending_payment");
      expect(membership.endDate.getTime()).toBe(
        originalEnd.getTime(),
      );
      expect(payment.status).toBe("pending");
    }, 20000);
  }
});
