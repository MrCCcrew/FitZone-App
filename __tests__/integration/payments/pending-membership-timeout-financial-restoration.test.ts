import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cleanupExpiredPendingMembership,
} from "@/lib/payments/pending-membership-cleanup";

/*
 * Database integration only.
 * This test MUST NOT run against Production or an arbitrary DATABASE_URL.
 */
const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: test DATABASE_URL is missing");
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
    "REFUSING: financial restoration requires isolated fitzone_test",
  );
}

describe(
  "Pending membership timeout financial settlement",
  { timeout: 90000 },
  () => {
    it(
      "returns frozen wallet funds once when the original hold expires",
      async () => {
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
              name: "Membership Timeout Financial Test",
              gender: "female",
            },
          });

          userId = user.id;

          const plan = await db.membership.create({
            data: {
              name: "Timeout Financial Test Plan",
              duration: 30,
              price: 100,
              sessionsCount: 1,
              walletBonus: 0,
              features: "[]",
            },
          });

          planId = plan.id;

          /*
           * Original wallet was 50 EGP.
           * Checkout already deducted 10 EGP.
           */
          await db.wallet.create({
            data: {
              userId,
              balance: 40,
              referralBalance: 0,
            },
          });

          const membership = await db.userMembership.create({
            data: {
              userId,
              membershipId: planId,
              status: "pending_payment",
              paymentAmount: 90,
              paymentMethod: "paymob",
              pendingExpiresAt: new Date(
                Date.now() - 60_000,
              ),
              startDate: new Date(),
              endDate: new Date(
                Date.now() + 30 * 86400000,
              ),
            },
          });

          userMembershipId = membership.id;

          const payment = await db.paymentTransaction.create({
            data: {
              userId,
              membershipId: userMembershipId,
              purpose: "membership",
              businessUnit: "club",
              provider: "manual",
              amount: 90,
              currency: "EGP",
              status: "failed",
              paymentMethod: "card",
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

          const first = await cleanupExpiredPendingMembership(
            userMembershipId,
          );

          const second = await cleanupExpiredPendingMembership(
            userMembershipId,
          );

          const [membershipAfter, paymentAfter, walletAfter] =
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

          expect(first.cleaned).toBe(true);
          expect(second.cleaned).toBe(false);

          expect(membershipAfter?.status).toBe("cancelled");
          expect(paymentAfter?.status).toBe("failed");

          /*
           * Expected financial result:
           * 40 + 10 = 50, never 40 and never 60.
           */
          expect(walletAfter?.balance).toBe(50);

          const metadata = JSON.parse(
            paymentAfter?.metadata ?? "{}",
          ) as {
            paymentAdjustments?: {
              restoredAt?: string;
            };
          };

          expect(
            typeof metadata.paymentAdjustments?.restoredAt,
          ).toBe("string");
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
      },
    );
  },
);