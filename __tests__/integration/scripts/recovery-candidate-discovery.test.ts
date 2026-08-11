import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

describe("Recovery Script Candidate Discovery", { timeout: 60000 }, () => {
  let testUserId: string;
  let testMembershipId: string;
  let testBaseMembershipId: string;
  let testPaymentId: string;

  beforeAll(async () => {
    // Create test user
    const user = await db.user.create({
      data: {
        phone: `+201${Math.floor(Math.random() * 1000000000)}`,
        name: "Test Discovery User",
        gender: "male",
      },
    });
    testUserId = user.id;

    // Create base membership
    const baseMembership = await db.membership.create({
      data: {
        name: "Test Discovery",
        nameEn: "Test Discovery",
        duration: 30,
        price: 333,
        walletBonus: 0,
        features: JSON.stringify(["test"]),
      },
    });
    testBaseMembershipId = baseMembership.id;

    // Create user membership in pending_payment state (the bug scenario)
    const userMembership = await db.userMembership.create({
      data: {
        userId: testUserId,
        membershipId: testBaseMembershipId,
        status: "pending_payment",
        paymentAmount: 333,
        pendingExpiresAt: new Date(Date.now() + 86400000),
        snapshotDurationDays: 30,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
      },
    });
    testMembershipId = userMembership.id;

    // Create payment marked as "paid" but membership not activated
    const payment = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        purpose: "membership",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "paid", // Already paid
        paymentMethod: "card",
        paidAt: new Date(),
        externalReference: "test-513700182",
      },
    });
    testPaymentId = payment.id;
  });

  afterAll(async () => {
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
      await db.user.deleteMany({ where: { id: testUserId } });
    }
  });

  it("paid payment + pending_payment membership appears in candidate list", async () => {
    // Mode 2 query: Paid payments with pending memberships
    const paidPayments = await db.paymentTransaction.findMany({
      where: {
        provider: "paymob",
        membershipId: { not: null },
        status: "paid",
      },
      include: {
        user: { select: { name: true } },
      },
    });

    // Filter for pending memberships
    const candidates = [];
    for (const payment of paidPayments) {
      if (!payment.membershipId) continue;
      const membership = await db.userMembership.findUnique({
        where: { id: payment.membershipId },
        select: { status: true },
      });
      if (membership?.status === "pending_payment") {
        candidates.push({
          paymentId: payment.id,
          paymentStatus: payment.status,
          membershipStatus: membership.status,
          mode: "activate_membership",
        });
      }
    }

    // Should find our test payment
    const found = candidates.find((c) => c.paymentId === testPaymentId);
    expect(found).toBeDefined();
    expect(found?.paymentStatus).toBe("paid");
    expect(found?.membershipStatus).toBe("pending_payment");
    expect(found?.mode).toBe("activate_membership");
  });

  it("Mode 2 does not depend on externalReference being present", async () => {
    // Create another payment without externalReference
    const paymentNoRef = await db.paymentTransaction.create({
      data: {
        userId: testUserId,
        membershipId: testMembershipId,
        purpose: "membership",
        businessUnit: "club",
        provider: "paymob",
        amount: 333,
        currency: "EGP",
        status: "paid",
        paymentMethod: "card",
        paidAt: new Date(),
        externalReference: null, // No external reference
      },
    });

    const paidPayments = await db.paymentTransaction.findMany({
      where: {
        provider: "paymob",
        membershipId: { not: null },
        status: "paid",
      },
    });

    const found = paidPayments.find((p) => p.id === paymentNoRef.id);
    expect(found).toBeDefined();
    expect(found?.externalReference).toBeNull();

    // Cleanup
    await db.paymentTransaction.delete({ where: { id: paymentNoRef.id } });
  });
});
