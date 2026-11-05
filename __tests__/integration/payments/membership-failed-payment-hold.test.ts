import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  updatePaymentTransactionStatus,
} from "@/lib/payments/service";
import {
  cleanupExpiredPendingMembership,
} from "@/lib/payments/pending-membership-cleanup";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

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
  throw new Error(
    "REFUSING: test requires isolated fitzone_test",
  );
}

describe(
  "Membership failed payment during original 60-minute hold",
  { timeout: 90000 },
  () => {
    it("preserves the hold after payment failure and refunds once after expiry", async () => {
      let userId = "";
      let planId = "";
      let userMembershipId = "";
      let paymentId = "";

      try {
        const user = await db.user.create({
          data: {
            phone:
              "+201" +
              Math.floor(Math.random() * 1_000_000_000)
                .toString()
                .padStart(9, "0"),
            name: "Membership Failed Payment Hold Test",
            gender: "female",
          },
        });

        userId = user.id;

        const plan = await db.membership.create({
          data: {
            name: "Failed Payment Hold Test",
            duration: 30,
            price: 100,
            sessionsCount: 1,
            walletBonus: 0,
            features: "[]",
          },
        });

        planId = plan.id;

        await db.wallet.create({
          data: {
            userId,
            balance: 40,
            referralBalance: 0,
          },
        });

        // The original checkout started 15 minutes ago.
        // Exactly 45 minutes of its original hold remain.
        const originalExpiry = new Date(
          Date.now() + 45 * 60 * 1000,
        );

        const membership = await db.userMembership.create({
          data: {
            userId,
            membershipId: planId,
            status: "pending_payment",
            paymentAmount: 90,
            paymentMethod: "paymob",
            pendingExpiresAt: originalExpiry,
            startDate: new Date(),
            endDate: new Date(
              Date.now() + 30 * 86400000,
            ),
          },
        });

        userMembershipId = membership.id;

        // The individual Paymob checkout has already expired,
        // but the original membership hold has not.
        const payment = await db.paymentTransaction.create({
          data: {
            userId,
            membershipId: userMembershipId,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 90,
            currency: "EGP",
            status: "pending",
            paymentMethod: "card",
            expiresAt: new Date(Date.now() - 60_000),
            metadata: JSON.stringify({
              paymentAdjustments: {
                walletAmount: 10,
                referralWalletAmount: 0,
                generalWalletAmount: 10,
                pointsCount: 0,
              },
            }),
          },
        });

        paymentId = payment.id;

        // Simulate a terminal failed checkout signal.
        // This deliberately does not contact real Paymob.
        await updatePaymentTransactionStatus(
          paymentId,
          "failed",
        );

        const [membershipAfterFailure, paymentAfterFailure, walletAfterFailure] =
          await Promise.all([
            db.userMembership.findUnique({
              where: { id: userMembershipId },
            }),
            db.paymentTransaction.findUnique({
              where: { id: paymentId },
            }),
            db.wallet.findUnique({
              where: { userId },
            }),
          ]);

        expect(paymentAfterFailure?.status).toBe("failed");
        expect(membershipAfterFailure?.status).toBe(
          "pending_payment",
        );
        expect(
          membershipAfterFailure?.pendingExpiresAt?.getTime(),
        ).toBe(originalExpiry.getTime());

        // No early refund while the reservation remains valid.
        expect(walletAfterFailure?.balance).toBe(40);

        // Simulate the original hold actually expiring.
        await db.userMembership.update({
          where: { id: userMembershipId },
          data: {
            pendingExpiresAt: new Date(
              Date.now() - 60_000,
            ),
          },
        });

        const firstCleanup =
          await cleanupExpiredPendingMembership(
            userMembershipId,
          );

        const secondCleanup =
          await cleanupExpiredPendingMembership(
            userMembershipId,
          );

        const [membershipAfterExpiry, walletAfterExpiry, paymentAfterExpiry] =
          await Promise.all([
            db.userMembership.findUnique({
              where: { id: userMembershipId },
            }),
            db.wallet.findUnique({
              where: { userId },
            }),
            db.paymentTransaction.findUnique({
              where: { id: paymentId },
            }),
          ]);

        expect(firstCleanup.cleaned).toBe(false);
        expect(firstCleanup).toMatchObject({
          reason: "provider_reconciliation_required",
        });
        expect(secondCleanup.cleaned).toBe(false);
        expect(membershipAfterExpiry?.status).toBe(
          "pending_payment",
        );

        // The original wallet amount is restored exactly once.
        expect(walletAfterExpiry?.balance).toBe(40);

        const metadata = JSON.parse(
          paymentAfterExpiry?.metadata ?? "{}",
        ) as {
          paymentAdjustments?: {
            restoredAt?: string;
          };
        };

        expect(metadata.paymentAdjustments?.restoredAt).toBeUndefined();
      } finally {
        if (paymentId) {
          await db.paymentTransaction.deleteMany({
            where: { id: paymentId },
          });
        }

        if (userMembershipId) {
          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (planId) {
          await db.membership.deleteMany({
            where: { id: planId },
          });
        }

        if (userId) {
          await db.user.deleteMany({
            where: { id: userId },
          });
        }
      }
    });
  },
);