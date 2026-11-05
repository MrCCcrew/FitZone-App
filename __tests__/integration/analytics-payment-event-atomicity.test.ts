import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

function assertTestDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");

  if (
    process.env.APP_ENV !== "test" ||
    url.pathname.replace(/^\//, "") !== "fitzone_test"
  ) {
    throw new Error("REFUSING: fitzone_test required");
  }
}

describe(
  "payment-linked business analytics atomicity",
  { timeout: 90000 },
  () => {
    it("records once, rejects duplicates, and safely rejects a missing payment", async () => {
      assertTestDatabase();

      const stamp =
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let userId = "";
      let planId = "";
      let userMembershipId = "";
      let paymentId = "";

      try {
        const user = await db.user.create({
          data: {
            email: `analytics-atomic-${stamp}@example.test`,
            name: "Analytics Atomic Test",
          },
        });

        userId = user.id;

        const plan = await db.membership.create({
          data: {
            name: `Analytics Atomic Plan ${stamp}`,
            nameEn: `Analytics Atomic Plan ${stamp}`,
            duration: 30,
            price: 300,
            sessionsCount: 0,
            walletBonus: 0,
            features: "[]",
          },
        });

        planId = plan.id;

        const now = new Date();

        const membership = await db.userMembership.create({
          data: {
            userId,
            membershipId: planId,
            status: "active",
            startDate: now,
            endDate: new Date(
              now.getTime() + 30 * 86400000,
            ),
            paymentAmount: 300,
            paymentMethod: "card",
          },
        });

        userMembershipId = membership.id;

        const payment = await db.paymentTransaction.create({
          data: {
            userId,
            membershipId: userMembershipId,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 300,
            currency: "EGP",
            status: "paid",
            paymentMethod: "card",
            paidAt: now,
            externalReference:
              `analytics-atomic-${stamp}`,
          },
        });

        paymentId = payment.id;

        const eventInput = {
          eventName: "membership_activated",
          paymentTransactionId: paymentId,
          userId,
          entityType: "subscription",
          entityId: planId,
          entityName: plan.name,
          category: "subscription",
          value: 300,
          currency: "EGP",
          success: true,
        } as const;

        /*
         * Concurrency proof:
         * both attempts target the same unique payment/event pair.
         */
        const [first, second] = await Promise.all([
          recordBusinessAnalyticsEvent(eventInput),
          recordBusinessAnalyticsEvent(eventInput),
        ]);

        const results = [first, second];

        expect(
          results.filter((entry) => entry.recorded),
        ).toHaveLength(1);

        expect(
          results.filter(
            (entry) =>
              !entry.recorded &&
              entry.ignored &&
              entry.reason === "duplicate",
          ),
        ).toHaveLength(1);

        expect(
          await db.analyticsEvent.count({
            where: {
              paymentTransactionId: paymentId,
              eventName: "membership_activated",
            },
          }),
        ).toBe(1);

        /*
         * Missing parent is rejected BEFORE event creation and must never
         * surface a foreign-key failure.
         */
        const missingPaymentId =
          `missing-payment-${stamp}`;

        const missing =
          await recordBusinessAnalyticsEvent({
            ...eventInput,
            paymentTransactionId: missingPaymentId,
          });

        expect(missing).toEqual({
          recorded: false,
          ignored: true,
          reason: "invalid_payment_transaction",
        });

        expect(
          await db.analyticsEvent.count({
            where: {
              paymentTransactionId: missingPaymentId,
            },
          }),
        ).toBe(0);
      } finally {
        if (paymentId) {
          await db.analyticsEvent.deleteMany({
            where: {
              paymentTransactionId: paymentId,
            },
          });

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
