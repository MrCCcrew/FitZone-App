/**
 * Payment Post-Activation Reconciliation Tests
 *
 * Validates that post-activation reconciliation executes correctly
 * with proper idempotency for both normal payment and recovery flows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";
import { recoverVerifiedPaymobPayment, type VerifiedPaymobRecoveryInput } from "@/lib/payments/service";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";
import * as paymobProvider from "@/lib/payments/providers/paymob";

// Mock Paymob remote verification
vi.mock("@/lib/payments/providers/paymob", async () => {
  const actual = await vi.importActual("@/lib/payments/providers/paymob");
  return {
    ...actual,
    verifyPaymobTransactionForRecovery: vi.fn(),
  };
});

describe("Payment Post-Activation Reconciliation", () => {
  let testUserId: string;
  let testMembershipPlanId: string;
  let testUserMembershipId: string;
  let testPaymentId: string;
  let testOfferId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    testUserId = `reconciliation-user-${timestamp}`;

    // Create test user
    await db.user.create({
      data: {
        id: testUserId,
        email: `reconciliation-${timestamp}@test.local`,
        name: "Reconciliation Test User",
        phone: "01012345678",
      },
    });

    // Create test membership plan with wallet bonus
    testMembershipPlanId = `plan-${timestamp}`;
    await db.membership.create({
      data: {
        id: testMembershipPlanId,
        name: "باقة المكافآت",
        nameEn: "Rewards Plan",
        price: 500,
        duration: 30,
        kind: "subscription",
        sessionsCount: 12,
        features: JSON.stringify(["wallet bonus", "reward points"]),
        walletBonus: 50,
      },
    });

    // Create reward points for user
    await db.rewardPoints.create({
      data: {
        userId: testUserId,
        points: 100,
        tier: "bronze",
      },
    });

    // Create offer for subscriber tracking
    testOfferId = `offer-${timestamp}`;
    await db.offer.create({
      data: {
        id: testOfferId,
        title: "عرض الاختبار",
        titleEn: "Test Offer",
        membershipId: testMembershipPlanId,
        type: "fixed",
        discount: 50,
        currentSubscribers: 0,
        maxSubscribers: 100,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Create pending user membership
    testUserMembershipId = `usermem-${timestamp}`;
    await db.userMembership.create({
      data: {
        id: testUserMembershipId,
        userId: testUserId,
        membershipId: testMembershipPlanId,
        offerId: testOfferId,
        status: "pending_payment",
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        pendingExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        snapshotDurationDays: 30,
        paymentAmount: 450,
      },
    });

    // Create pending payment transaction
    testPaymentId = `payment-${timestamp}`;
    await db.paymentTransaction.create({
      data: {
        id: testPaymentId,
        userId: testUserId,
        membershipId: testUserMembershipId,
        offerId: testOfferId,
        referenceCode: `FZ-Test-${String(timestamp).slice(-7)}`,
        purpose: "subscription",
        businessUnit: "club",
        provider: "paymob",
        amount: 450,
        currency: "EGP",
        status: "pending",
        paymentMethod: "paymob",
        providerReference: `pi_live_test_intention_${timestamp}`, // Unique per test run
      },
    });

    // Mock successful Paymob verification
    // LIVE PAYMOB RESPONSE: merchant_order_id proves linkage, special_reference is NULL
    vi.mocked(paymobProvider.verifyPaymobTransactionForRecovery).mockImplementation(
      async (paymobTxId, localTxId) => ({
        verified: true,
        transactionId: "999888777",
        success: true,
        pending: false,
        amountCents: 45000,
        currency: "EGP",
        paymobOrderId: 584723754,
        specialReference: null, // LIVE PAYMOB: NULL
        sourceType: "wallet",
        isRefunded: false,
        isVoided: false,
        errorOccured: false,
      })
    );
  });

  afterEach(async () => {
    await db.walletTransaction.deleteMany({ where: { wallet: { userId: testUserId } } });
    await db.wallet.deleteMany({ where: { userId: testUserId } });
    await db.rewardHistory.deleteMany({ where: { reward: { userId: testUserId } } });
    await db.rewardPoints.deleteMany({ where: { userId: testUserId } });
    await db.notification.deleteMany({ where: { userId: testUserId } });
    await db.paymentTransaction.deleteMany({ where: { id: testPaymentId } });
    await db.userMembership.deleteMany({ where: { id: testUserMembershipId } });
    await db.offer.deleteMany({ where: { id: testOfferId } });
    await db.membership.deleteMany({ where: { id: testMembershipPlanId } });
    await db.user.deleteMany({ where: { id: testUserId } });
  });

  it("1. recovery executes reconciliation with all side effects", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "999888777",
      expectedAmount: 450,
      expectedCurrency: "EGP",
      expectedFitZoneReference: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.referenceCode!,
      expectedIntentionId: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.providerReference!,
    };

    await recoverVerifiedPaymobPayment(input);

    // Verify reconciliation completion marker
    const payment = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const metadata = payment?.metadata ? JSON.parse(payment.metadata) : null;
    expect(metadata?.postActivationReconciliation?.completed).toBe(true);

    // Verify wallet bonus
    const wallet = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet?.balance).toBe(50);

    // Verify reward points
    const points = await db.rewardPoints.findUnique({ where: { userId: testUserId } });
    expect(points!.points).toBeGreaterThan(100);

    // Verify offer subscribers
    const offer = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer?.currentSubscribers).toBe(1);

    // Verify notification
    const notifications = await db.notification.findMany({
      where: { userId: testUserId, type: "success" },
    });
    expect(notifications.length).toBeGreaterThan(0);
  }, 20000);

  it("2. exact retry does not duplicate side effects", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "999888777",
      expectedAmount: 450,
      expectedCurrency: "EGP",
      expectedFitZoneReference: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.referenceCode!,
      expectedIntentionId: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.providerReference!,
    };

    // First execution
    await recoverVerifiedPaymobPayment(input);

    const wallet1 = await db.wallet.findUnique({ where: { userId: testUserId } });
    const points1 = await db.rewardPoints.findUnique({ where: { userId: testUserId } });
    const offer1 = await db.offer.findUnique({ where: { id: testOfferId } });

    // Exact retry
    await recoverVerifiedPaymobPayment(input);

    const wallet2 = await db.wallet.findUnique({ where: { userId: testUserId } });
    const points2 = await db.rewardPoints.findUnique({ where: { userId: testUserId } });
    const offer2 = await db.offer.findUnique({ where: { id: testOfferId } });

    // Verify no duplication
    expect(wallet2?.balance).toBe(wallet1?.balance); // Still 50
    expect(points2?.points).toBe(points1?.points); // Unchanged
    expect(offer2?.currentSubscribers).toBe(offer1?.currentSubscribers); // Still 1

    const walletTxs = await db.walletTransaction.findMany({
      where: { walletId: wallet2!.id, type: "credit" },
    });
    expect(walletTxs.length).toBe(1); // Exactly one transaction
  }, 20000);

  it("3. direct reconciliation call is idempotent", async () => {
    // Manually activate payment and membership to simulate successful activation
    await db.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: testPaymentId },
        data: {
          status: "paid",
          paidAt: new Date(),
          externalReference: `999888777-${Date.now()}`, // Unique per test run
        },
      });

      await tx.userMembership.update({
        where: { id: testUserMembershipId },
        data: {
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          pendingExpiresAt: null,
        },
      });
    });

    const membership = await db.userMembership.findUnique({
      where: { id: testUserMembershipId },
      include: {
        membership: {
          select: {
            name: true,
            nameEn: true,
            duration: true,
            walletBonus: true,
            productRewards: true,
          },
        },
        offer: { select: { title: true } },
      },
    });

    const payment = await db.paymentTransaction.findUnique({
      where: { id: testPaymentId },
    });

    // First reconciliation call
    await runPaidMembershipPostActivationReconciliation({
      transactionId: testPaymentId,
      userId: testUserId,
      userMembershipId: testUserMembershipId,
      membershipData: {
        status: "active",
        startDate: membership!.startDate ?? new Date(),
        offerId: membership!.offerId,
        membership: {
          ...membership!.membership,
          duration: 30,
        },
        offer: membership!.offer,
      },
      paymentAmount: payment!.amount,
      paymentMethod: payment!.paymentMethod,
      paidAt: payment!.paidAt,
      transactionMetadata: payment!.metadata,
    });

    const wallet1 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet1?.balance).toBe(50);

    // Second reconciliation call (retry)
    await runPaidMembershipPostActivationReconciliation({
      transactionId: testPaymentId,
      userId: testUserId,
      userMembershipId: testUserMembershipId,
      membershipData: {
        status: "active",
        startDate: membership!.startDate ?? new Date(),
        offerId: membership!.offerId,
        membership: {
          ...membership!.membership,
          duration: 30,
        },
        offer: membership!.offer,
      },
      paymentAmount: payment!.amount,
      paymentMethod: payment!.paymentMethod,
      paidAt: payment!.paidAt,
      transactionMetadata: payment!.metadata,
    });

    const wallet2 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet2?.balance).toBe(50); // Still 50, not 100

    const walletTxs = await db.walletTransaction.findMany({
      where: { walletId: wallet2!.id, type: "credit" },
    });
    expect(walletTxs.length).toBe(1); // Exactly one
  }, 20000);
});
