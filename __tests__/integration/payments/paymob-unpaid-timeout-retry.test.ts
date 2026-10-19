import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupExpiredPendingMembership } from "@/lib/payments/pending-membership-cleanup";
import { assessPaymobUnpaidOrder } from "@/lib/payments/paymob-order-unpaid-proof";

const raw = process.env.DATABASE_URL;

if (!raw) throw new Error("TEST_DATABASE_URL_REQUIRED");

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
  throw new Error("REFUSING_NON_TEST_DATABASE");
}

describe("Paymob unpaid timeout and customer retry", { timeout: 90000 }, () => {
  it("releases seats and wallet once, then permits a fresh membership", async () => {
    let userId = "";
    let planId = "";
    let trainerId = "";
    let classId = "";
    let scheduleId = "";
    let oldMembershipId = "";
    let newMembershipId = "";
    let oldPaymentId = "";
    let newPaymentId = "";

    try {
      const user = await db.user.create({
        data: {
          name: "Automated Unpaid Settlement Test",
          phone: `+201${Math.floor(Math.random() * 1_000_000_000)
            .toString().padStart(9, "0")}`,
          gender: "female",
        },
      });
      userId = user.id;

      const plan = await db.membership.create({
        data: {
          name: "Automated Settlement Test Plan",
          duration: 30,
          price: 100,
          sessionsCount: 1,
          walletBonus: 0,
          features: "[]",
        },
      });
      planId = plan.id;

      const trainer = await db.trainer.create({
        data: {
          name: "Settlement Test Trainer",
          specialty: "fitness",
          bio: "test only",
        },
      });
      trainerId = trainer.id;

      const cls = await db.class.create({
        data: {
          name: "Settlement Test Class",
          trainerId,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 3,
          price: 100,
        },
      });
      classId = cls.id;

      const schedule = await db.schedule.create({
        data: {
          classId,
          date: new Date(Date.now() + 86400000),
          time: "10:00",
          availableSpots: 3,
          isActive: true,
        },
      });
      scheduleId = schedule.id;

      await db.wallet.create({
        data: {
          userId,
          balance: 40,
          referralBalance: 0,
        },
      });

      const expiredAt = new Date(Date.now() - 120000);

      const oldMembership = await db.userMembership.create({
        data: {
          userId,
          membershipId: planId,
          status: "pending_payment",
          paymentAmount: 90,
          paymentMethod: "paymob",
          pendingExpiresAt: expiredAt,
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 86400000),
        },
      });
      oldMembershipId = oldMembership.id;

      const payment = await db.paymentTransaction.create({
        data: {
          userId,
          membershipId: oldMembershipId,
          purpose: "membership",
          businessUnit: "club",
          provider: "paymob",
          amount: 90,
          currency: "EGP",
          status: "pending",
          paymentMethod: "card",
          expiresAt: new Date(expiredAt.getTime() - 30000),
          providerPayload: JSON.stringify({
            intentionOrderId: "631854294",
          }),
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
      oldPaymentId = payment.id;

      await db.booking.create({
        data: {
          userId,
          scheduleId,
          userMembershipId: oldMembershipId,
          status: "confirmed",
          paidAmount: 100,
          paymentMethod: "cash",
        },
      });

      await db.schedule.update({
        where: { id: scheduleId },
        data: { availableSpots: { decrement: 1 } },
      });

      const blocked = await cleanupExpiredPendingMembership(
        oldMembershipId,
      );

      expect(blocked).toMatchObject({
        cleaned: false,
        reason: "provider_reconciliation_required",
      });

      const proof = assessPaymobUnpaidOrder({
        order: {
          id: 631854294,
          merchant_order_id: payment.id,
          amount_cents: 9000,
          paid_amount_cents: 0,
        },
        paymentId: payment.id,
        expectedOrderId: "631854294",
        expectedAmountCents: 9000,
        expectedCurrency: "EGP",
        checkedAt: new Date(),
      });

      expect(proof).not.toBeNull();

      const first = await cleanupExpiredPendingMembership(
        oldMembershipId,
        new Date(),
        proof,
      );

      expect(first.cleaned).toBe(true);

      const second = await cleanupExpiredPendingMembership(
        oldMembershipId,
        new Date(),
        proof,
      );

      expect(second.cleaned).toBe(false);

      const [oldAfter, paymentAfter, walletAfter, spotAfter, bookingsAfter] =
        await Promise.all([
          db.userMembership.findUnique({
            where: { id: oldMembershipId },
          }),
          db.paymentTransaction.findUnique({
            where: { id: oldPaymentId },
          }),
          db.wallet.findUnique({ where: { userId } }),
          db.schedule.findUnique({ where: { id: scheduleId } }),
          db.booking.count({
            where: { userMembershipId: oldMembershipId },
          }),
        ]);

      expect(oldAfter?.status).toBe("cancelled");
      expect(oldAfter?.pendingExpiresAt).toBeNull();
      expect(paymentAfter?.status).toBe("cancelled");
      expect(walletAfter?.balance).toBe(50);
      expect(spotAfter?.availableSpots).toBe(3);
      expect(bookingsAfter).toBe(0);

      const metadata = JSON.parse(paymentAfter?.metadata ?? "{}");
      expect(metadata.paymobNoChargeReview?.source).toBe(
        "paymob_order_unpaid_automated",
      );
      expect(typeof metadata.paymobNoChargeReview?.settledAt).toBe(
        "string",
      );
      expect(typeof metadata.paymentAdjustments?.restoredAt).toBe(
        "string",
      );

      const retry = await db.userMembership.create({
        data: {
          userId,
          membershipId: planId,
          status: "pending_payment",
          paymentAmount: 90,
          paymentMethod: "paymob",
          pendingExpiresAt: new Date(Date.now() + 3600000),
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 86400000),
        },
      });
      newMembershipId = retry.id;

      const retryPayment = await db.paymentTransaction.create({
        data: {
          userId,
          membershipId: newMembershipId,
          purpose: "membership",
          businessUnit: "club",
          provider: "paymob",
          amount: 90,
          currency: "EGP",
          status: "pending",
          paymentMethod: "card",
        },
      });
      newPaymentId = retryPayment.id;

      await db.booking.create({
        data: {
          userId,
          scheduleId,
          userMembershipId: newMembershipId,
          status: "confirmed",
          paidAmount: 100,
          paymentMethod: "cash",
        },
      });

      await db.schedule.update({
        where: { id: scheduleId },
        data: { availableSpots: { decrement: 1 } },
      });

      expect(
        await db.booking.count({
          where: { userMembershipId: newMembershipId },
        }),
      ).toBe(1);

      expect(
        (await db.schedule.findUnique({
          where: { id: scheduleId },
        }))?.availableSpots,
      ).toBe(2);

      expect(
        (await db.userMembership.findUnique({
          where: { id: newMembershipId },
        }))?.status,
      ).toBe("pending_payment");

      console.log("UNPAID_SETTLEMENT=PASS");
      console.log("WALLET_EXACTLY_ONCE=PASS");
      console.log("BOOKING_CAPACITY_RESTORED=PASS");
      console.log("NEW_MEMBERSHIP_RETRY=PASS");
    } finally {
      if (newPaymentId) {
        await db.paymentTransaction.deleteMany({
          where: { id: newPaymentId },
        });
      }
      if (oldPaymentId) {
        await db.paymentTransaction.deleteMany({
          where: { id: oldPaymentId },
        });
      }
      for (const id of [newMembershipId, oldMembershipId]) {
        if (id) {
          await db.booking.deleteMany({
            where: { userMembershipId: id },
          });
          await db.userMembership.deleteMany({
            where: { id },
          });
        }
      }
      if (scheduleId) {
        await db.schedule.deleteMany({
          where: { id: scheduleId },
        });
      }
      if (classId) {
        await db.class.deleteMany({ where: { id: classId } });
      }
      if (trainerId) {
        await db.trainer.deleteMany({ where: { id: trainerId } });
      }
      if (planId) {
        await db.membership.deleteMany({ where: { id: planId } });
      }
      if (userId) {
        await db.notification.deleteMany({ where: { userId } });
        await db.user.deleteMany({ where: { id: userId } });
      }
    }
  });
});
