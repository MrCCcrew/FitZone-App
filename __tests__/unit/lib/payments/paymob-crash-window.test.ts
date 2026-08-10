/**
 * Crash-Window Recovery Test
 *
 * Critical scenario: Activation succeeds but reconciliation fails before completion marker.
 * Retry must repair reconciliation without duplicating financial effects.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { recoverVerifiedPaymobPayment, type VerifiedPaymobRecoveryInput } from "@/lib/payments/service";

describe("Payment Crash-Window Recovery", () => {
  let testUserId: string;
  let testMembershipPlanId: string;
  let testUserMembershipId: string;
  let testPaymentId: string;
  let testOfferId: string;
  let testProductId: string | null = null;

  beforeEach(async () => {
    const timestamp = Date.now();
    testUserId = `crash-window-user-${timestamp}`;
    testProductId = null; // Reset

    // Create test user
    await db.user.create({
      data: {
        id: testUserId,
        email: `crash-${timestamp}@test.local`,
        name: "Crash Window Test",
        phone: "01012345678",
      },
    });

    // Create test membership plan with wallet bonus
    testMembershipPlanId = `plan-${timestamp}`;
    await db.membership.create({
      data: {
        id: testMembershipPlanId,
        name: "باقة اختبار النافذة",
        nameEn: "Crash Window Plan",
        price: 500,
        duration: 30,
        kind: "subscription",
        sessionsCount: 12,
        features: JSON.stringify(["test"]),
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
        title: "عرض اختبار النافذة",
        titleEn: "Crash Window Offer",
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
        metadata: JSON.stringify({
          merchantOrderId: testPaymentId,
        }),
      },
    });
  });

  afterEach(async () => {
    // Cleanup in safe order
    if (testProductId) {
      // InventoryMovement cascades, but delete explicitly for clarity
      await db.inventoryMovement.deleteMany({ where: { productId: testProductId } });
      await db.product.deleteMany({ where: { id: testProductId } });
      testProductId = null;
    }
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

  it("repairs pre-existing crash-window: paid+active but unreconciled", async () => {
    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "999888777",
      expectedAmount: 450,
      expectedCurrency: "EGP",
      expectedFitZoneReference: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.referenceCode!,
      expectedMerchantOrderId: testPaymentId,
    };

    // PHASE A: Manually simulate pre-existing crash-window state
    // (activation succeeded in past, reconciliation never ran)
    await db.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: testPaymentId },
        data: {
          status: "paid",
          paidAt: new Date(),
          externalReference: "999888777",
          // NO postActivationReconciliation marker
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

    // PHASE B: Verify pre-existing crash-window state
    const payment1 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    expect(payment1?.status).toBe("paid");

    const metadata1 = payment1?.metadata ? JSON.parse(payment1.metadata) : null;
    expect(metadata1?.postActivationReconciliation?.completed).toBeUndefined();

    const wallet1 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet1).toBeNull(); // No reconciliation effects yet

    const offer1 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer1?.currentSubscribers).toBe(0);

    // PHASE C: Recovery repairs reconciliation
    await recoverVerifiedPaymobPayment(input);

    // PHASE D: Verify reconciliation completed exactly once
    const payment2 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const metadata2 = payment2?.metadata ? JSON.parse(payment2.metadata) : null;
    expect(metadata2?.postActivationReconciliation?.completed).toBe(true);

    const wallet2 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet2?.balance).toBe(50);

    const walletTxs = await db.walletTransaction.findMany({
      where: { walletId: wallet2!.id, type: "credit" },
    });
    expect(walletTxs.length).toBe(1);

    const points2 = await db.rewardPoints.findUnique({ where: { userId: testUserId } });
    expect(points2!.points).toBeGreaterThan(100);

    const offer2 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer2?.currentSubscribers).toBe(1);

    // PHASE E: Second retry is no-op
    await recoverVerifiedPaymobPayment(input);

    const wallet3 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet3?.balance).toBe(50); // Still 50

    const walletTxs2 = await db.walletTransaction.findMany({
      where: { walletId: wallet3!.id, type: "credit" },
    });
    expect(walletTxs2.length).toBe(1); // Still 1

    const offer3 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer3?.currentSubscribers).toBe(1); // Still 1
  }, 20000);

  it("recovery succeeds, reconciliation fails mid-flight, retry repairs", async () => {
    // Create test product with zero stock to force reconciliation failure
    testProductId = `test-product-${Date.now()}`;
    await db.product.create({
      data: {
        id: testProductId,
        name: "Test Crash Window Product",
        price: 100,
        category: "test-category",
        stock: 0, // Zero stock to force failure
        trackInventory: true,
        averageCost: 50,
      },
    });

    // Add product reward to membership to trigger inventory deduction
    await db.membership.update({
      where: { id: testMembershipPlanId },
      data: {
        productRewards: JSON.stringify([{ productId: testProductId, quantity: 1 }]),
      },
    });

    const input: VerifiedPaymobRecoveryInput = {
      paymentTransactionId: testPaymentId,
      paymobTransactionId: "999888777",
      expectedAmount: 450,
      expectedCurrency: "EGP",
      expectedFitZoneReference: (await db.paymentTransaction.findUnique({
        where: { id: testPaymentId },
      }))!.referenceCode!,
      expectedMerchantOrderId: testPaymentId,
    };

    // PHASE A: First recovery attempt - activation succeeds, reconciliation fails
    let reconciliationFailed = false;
    try {
      await recoverVerifiedPaymobPayment(input);
    } catch (err) {
      // Reconciliation should fail due to insufficient stock
      expect((err as Error).message).toContain("Insufficient stock");
      reconciliationFailed = true;
    }

    expect(reconciliationFailed).toBe(true);

    // PHASE B: Verify activation succeeded but reconciliation did not complete
    const payment1 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const membership1 = await db.userMembership.findUnique({ where: { id: testUserMembershipId } });
    const metadata1 = payment1?.metadata ? JSON.parse(payment1.metadata) : null;

    expect(payment1?.status).toBe("paid"); // Activation succeeded
    expect(membership1?.status).toBe("active"); // Activation succeeded
    expect(metadata1?.postActivationReconciliation?.completed).toBeUndefined(); // Marker absent

    // Verify NO reconciliation effects due to rollback
    const wallet1 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet1).toBeNull(); // Transaction rolled back

    const offer1 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer1?.currentSubscribers).toBe(0); // Not incremented

    // PHASE C: Fix the blocking issue (add stock)
    await db.product.update({
      where: { id: testProductId },
      data: { stock: 10 },
    });

    // PHASE D: Retry recovery - should complete successfully
    const result = await recoverVerifiedPaymobPayment(input);
    expect(result.status).toBe("paid");

    // PHASE E: Verify reconciliation completed exactly once
    const payment2 = await db.paymentTransaction.findUnique({ where: { id: testPaymentId } });
    const metadata2 = payment2?.metadata ? JSON.parse(payment2.metadata) : null;
    expect(metadata2?.postActivationReconciliation?.completed).toBe(true);

    const wallet2 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet2?.balance).toBe(50);

    const product = await db.product.findUnique({ where: { id: testProductId } });
    expect(product?.stock).toBe(9); // Deducted exactly once

    const movements = await db.inventoryMovement.findMany({
      where: { productId: testProductId, referenceType: "membership" },
    });
    expect(movements.length).toBe(1); // Exactly one movement

    const offer2 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer2?.currentSubscribers).toBe(1); // Incremented exactly once

    // PHASE F: Third retry is no-op
    await recoverVerifiedPaymobPayment(input);

    const wallet3 = await db.wallet.findUnique({ where: { userId: testUserId } });
    expect(wallet3?.balance).toBe(50); // Still 50

    const product2 = await db.product.findUnique({ where: { id: testProductId } });
    expect(product2?.stock).toBe(9); // Still 9

    const movements2 = await db.inventoryMovement.findMany({
      where: { productId: testProductId, referenceType: "membership" },
    });
    expect(movements2.length).toBe(1); // Still 1

    const offer3 = await db.offer.findUnique({ where: { id: testOfferId } });
    expect(offer3?.currentSubscribers).toBe(1); // Still 1
  }, 20000);
});
