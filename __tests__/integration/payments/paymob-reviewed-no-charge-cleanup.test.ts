import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupExpiredPendingMembership } from "@/lib/payments/pending-membership-cleanup";

/**
 * NEVER run against Production. The database is mutated and test data is
 * created/deleted. This test exclusively permits fitzone_test on localhost.
 */
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("REFUSING_NO_TEST_DATABASE_URL");
const url = new URL(raw);
if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error("REFUSING_NON_ISOLATED_PAYMOB_FINANCIAL_TEST");
}

describe("Two-review Paymob expired no-charge financial settlement", { timeout: 90000 }, () => {
  it("preserves the hold without two reviews, then releases and restores exactly once", async () => {
    let userId = "";
    let planId = "";
    let membershipId = "";
    let paymentId = "";
    try {
      const user = await db.user.create({
        data: {
          phone: "+201" + Math.floor(Math.random() * 1e9).toString().padStart(9, "0"),
          name: "Dual Approval No Charge Test",
          gender: "female",
        },
      });
      userId = user.id;

      const plan = await db.membership.create({
        data: {
          name: "Dual Approval Paymob Test",
          duration: 30,
          price: 100,
          sessionsCount: 1,
          walletBonus: 0,
          features: "[]",
        },
      });
      planId = plan.id;

      await db.wallet.create({
        data: { userId, balance: 40, referralBalance: 0 },
      });

      const holdExpiry = new Date(Date.now() - 25 * 60_000);
      const membership = await db.userMembership.create({
        data: {
          userId,
          membershipId: planId,
          status: "pending_payment",
          paymentAmount: 90,
          paymentMethod: "paymob",
          pendingExpiresAt: holdExpiry,
          startDate: new Date(Date.now() - 90 * 60_000),
          endDate: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      membershipId = membership.id;

      const makeMetadata = (reviewerIds: string[]) =>
        JSON.stringify({
          paymentAdjustments: {
            walletAmount: 10,
            referralWalletAmount: 0,
            generalWalletAmount: 10,
            pointsCount: 0,
          },
          paymobNoChargeReview: {
            reportReference: "PAYMOB-REPORT-SIGNED-EXAMPLE",
            approvals: reviewerIds.map((reviewerId) => ({
              reviewerId,
              reviewedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
              reviewNote: "All Paymob transactions checked; no successful capture",
            })),
          },
        });

      const payment = await db.paymentTransaction.create({
        data: {
          userId,
          membershipId,
          purpose: "membership",
          businessUnit: "club",
          provider: "paymob",
          amount: 90,
          currency: "EGP",
          status: "failed",
          paymentMethod: "card",
          expiresAt: holdExpiry,
          metadata: makeMetadata(["reviewer-1"]),
        },
      });
      paymentId = payment.id;

      const blocked = await cleanupExpiredPendingMembership(membershipId);
      expect(blocked).toMatchObject({
        cleaned: false,
        reason: "provider_reconciliation_required",
      });

      const before = await db.wallet.findUnique({ where: { userId } });
      expect(before?.balance).toBe(40);

      await db.paymentTransaction.update({
        where: { id: paymentId },
        data: {
          metadata: makeMetadata(["reviewer-1", "reviewer-2"]),
        },
      });

      const first = await cleanupExpiredPendingMembership(membershipId);
      const second = await cleanupExpiredPendingMembership(membershipId);

      expect(first.cleaned).toBe(true);
      expect(second.cleaned).toBe(false);

      const [membershipAfter, paymentAfter, walletAfter] = await Promise.all([
        db.userMembership.findUnique({ where: { id: membershipId } }),
        db.paymentTransaction.findUnique({ where: { id: paymentId } }),
        db.wallet.findUnique({ where: { userId } }),
      ]);

      expect(membershipAfter?.status).toBe("cancelled");
      expect(paymentAfter?.status).toBe("cancelled");
      expect(walletAfter?.balance).toBe(50);

      const saved = JSON.parse(paymentAfter?.metadata ?? "{}") as {
        paymobNoChargeReview?: { settledAt?: string };
        paymentAdjustments?: { restoredAt?: string };
      };
      expect(typeof saved.paymobNoChargeReview?.settledAt).toBe("string");
      expect(typeof saved.paymentAdjustments?.restoredAt).toBe("string");
    } finally {
      if (paymentId) await db.paymentTransaction.deleteMany({ where: { id: paymentId } });
      if (membershipId) await db.userMembership.deleteMany({ where: { id: membershipId } });
      if (planId) await db.membership.deleteMany({ where: { id: planId } });
      if (userId) await db.user.deleteMany({ where: { id: userId } });
    }
  });
});
