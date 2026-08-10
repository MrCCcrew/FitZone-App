/**
 * Paymob Payment Recovery Tests
 *
 * Tests for recoverVerifiedPaymobPayment() - atomic verified payment recovery
 * with remote Paymob verification.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { recoverVerifiedPaymobPayment, type VerifiedPaymobRecoveryInput } from "@/lib/payments/service";
import * as paymobProvider from "@/lib/payments/providers/paymob";

// Mock Paymob remote verification
vi.mock("@/lib/payments/providers/paymob", async () => {
  const actual = await vi.importActual("@/lib/payments/providers/paymob");
  return {
    ...actual,
    verifyPaymobTransactionForRecovery: vi.fn(),
  };
});

describe("Paymob Payment Recovery", () => {
  let testUserId: string;
  let testMembershipPlanId: string;
  let testUserMembershipId: string;
  let testPaymentId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
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
        referenceCode: "FZ-Offers-0000017",
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

  it("1. successful verified recovery", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
      expectedIntentionId: "pi_live_wrong_intention", // Wrong intention
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("intention mismatch");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("6. duplicate paid payment rejected", async () => {
    // Create a duplicate paid payment for same user and membership
    const duplicatePaidId = `dup-paid-${Date.now()}`;
    await db.paymentTransaction.create({
      data: {
        id: duplicatePaidId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        referenceCode: "FZ-Offers-0000099",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("duplicate paid payment");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");

    await db.paymentTransaction.deleteMany({ where: { id: duplicatePaidId } });
  });

  it("7. duplicate active membership rejected", async () => {
    // Create a duplicate active membership for same user and plan
    const duplicateMemId = `dup-mem-${Date.now()}`;
    await db.userMembership.create({
      data: {
        id: duplicateMemId,
        userId: testUserId,
        membershipId: testMembershipPlanId,
        status: "active",
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        snapshotDurationDays: 30,
        paymentAmount: 333,
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-0000017",
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("duplicate active membership");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");

    await db.userMembership.deleteMany({ where: { id: duplicateMemId } });
  });

  it("8. exact retry idempotent", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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

  it("11. wrong intention ID rejected", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "512944958",
      expectedAmount: 333,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      specialReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      specialReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      specialReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      specialReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
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
      specialReference: "FZ-Offers-0000017",
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
      expectedFitZoneReference: "FZ-Offers-0000017",
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("Paymob remote verification failed");

    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment?.status).toBe("pending");
  });

  it("17. missing provider reference (intention ID) rejected", async () => {
    // Create payment without providerReference
    const noIntentionPaymentId = `payment-no-intention-${Date.now()}`;
    await db.paymentTransaction.create({
      data: {
        id: noIntentionPaymentId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        referenceCode: "FZ-Test-9999",
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
      expectedFitZoneReference: "FZ-Test-9999",
      expectedIntentionId: "pi_live_test_intention_123",
    };

    await expect(recoverVerifiedPaymobPayment(input)).rejects.toThrow("intention mismatch");

    await db.paymentTransaction.deleteMany({ where: { id: noIntentionPaymentId } });
  });
});
