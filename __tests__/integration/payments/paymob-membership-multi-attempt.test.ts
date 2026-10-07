import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/analytics/payment-events", () => ({
  recordPaymentStatusEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/membership-events", () => ({
  recordMembershipActivatedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/payments/reconciliation-helper", () => ({
  runPaidMembershipPostActivationReconciliation: vi
    .fn()
    .mockResolvedValue({
      alreadyCompleted: false,
    }),
}));

vi.mock("@/lib/payments/friend-offer-payment", () => ({
  markFriendOfferParticipantPaid: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

describe(
  "Paymob membership multi-attempt lifecycle",
  { timeout: 60000 },
  () => {
    it("keeps an unexpired failed attempt retryable and activates the same membership on later paid", async () => {
      let userId = "";
      let membershipPlanId = "";
      let userMembershipId = "";
      let paymentId = "";
      let trainerId = "";
      let classId = "";
      let scheduleId = "";
      let bookingId = "";

      try {
        const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        const user = await db.user.create({
          data: {
            phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
            name: `Paymob Multi Attempt ${stamp}`,
            gender: "female",
          },
        });
        userId = user.id;

        const membershipPlan = await db.membership.create({
          data: {
            name: `Paymob Multi Attempt Plan ${stamp}`,
            nameEn: `Paymob Multi Attempt Plan ${stamp}`,
            duration: 30,
            price: 300,
            sessionsCount: 1,
            walletBonus: 0,
            features: "[]",
          },
        });
        membershipPlanId = membershipPlan.id;

        const trainer = await db.trainer.create({
          data: {
            name: `Paymob Multi Attempt Trainer ${stamp}`,
            specialty: "fitness",
            bio: "integration test",
          },
        });
        trainerId = trainer.id;

        const classRecord = await db.class.create({
          data: {
            name: `Paymob Multi Attempt Class ${stamp}`,
            trainerId,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });
        classId = classRecord.id;

        const scheduleDate = new Date();
        scheduleDate.setUTCDate(scheduleDate.getUTCDate() + 1);
        scheduleDate.setUTCHours(10, 0, 0, 0);

        const schedule = await db.schedule.create({
          data: {
            classId,
            date: scheduleDate,
            time: "10:00",
            availableSpots: 10,
            isActive: true,
          },
        });
        scheduleId = schedule.id;

        const userMembership = await db.userMembership.create({
          data: {
            userId,
            membershipId: membershipPlanId,
            status: "pending_payment",
            paymentAmount: 300,
            pendingExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
            snapshotDurationDays: 30,
            totalSessions: 1,
            baseSessions: 1,
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 86400000),
          },
        });
        userMembershipId = userMembership.id;

        const payment = await db.paymentTransaction.create({
          data: {
            userId,
            membershipId: userMembershipId,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 300,
            currency: "EGP",
            status: "pending",
            paymentMethod: "card",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        paymentId = payment.id;

        const booking = await db.booking.create({
          data: {
            userId,
            scheduleId,
            userMembershipId,
            status: "confirmed",
            paidAmount: 100,
            paymentMethod: "cash",
          },
        });
        bookingId = booking.id;

        await db.schedule.update({
          where: { id: scheduleId },
          data: {
            availableSpots: {
              decrement: 1,
            },
          },
        });

        const beforeAttempt = await db.schedule.findUnique({
          where: { id: scheduleId },
          select: { availableSpots: true },
        });

        expect(beforeAttempt?.availableSpots).toBe(9);

        const failedAttempt =
          await updatePaymentTransactionStatus(paymentId, "failed");

        expect(failedAttempt.status).toBe("pending");

        const paymentAfterFailedAttempt =
          await db.paymentTransaction.findUnique({
            where: { id: paymentId },
          });

        const membershipAfterFailedAttempt =
          await db.userMembership.findUnique({
            where: { id: userMembershipId },
          });

        const bookingAfterFailedAttempt =
          await db.booking.findUnique({
            where: { id: bookingId },
          });

        const scheduleAfterFailedAttempt =
          await db.schedule.findUnique({
            where: { id: scheduleId },
            select: { availableSpots: true },
          });

        expect(paymentAfterFailedAttempt?.status).toBe("pending");
        expect(paymentAfterFailedAttempt?.failedAt).toBeNull();

        expect(membershipAfterFailedAttempt?.status).toBe(
          "pending_payment",
        );
        expect(
          membershipAfterFailedAttempt?.pendingExpiresAt,
        ).not.toBeNull();

        expect(bookingAfterFailedAttempt?.status).toBe("confirmed");
        expect(scheduleAfterFailedAttempt?.availableSpots).toBe(9);

        const paidAttempt =
          await updatePaymentTransactionStatus(paymentId, "paid");

        expect(paidAttempt.status).toBe("paid");

        const paymentAfterPaid =
          await db.paymentTransaction.findUnique({
            where: { id: paymentId },
          });

        const membershipAfterPaid =
          await db.userMembership.findUnique({
            where: { id: userMembershipId },
          });

        const bookingAfterPaid =
          await db.booking.findUnique({
            where: { id: bookingId },
          });

        const scheduleAfterPaid =
          await db.schedule.findUnique({
            where: { id: scheduleId },
            select: { availableSpots: true },
          });

        expect(paymentAfterPaid?.status).toBe("paid");
        expect(paymentAfterPaid?.paidAt).not.toBeNull();

        expect(membershipAfterPaid?.status).toBe("active");
        expect(membershipAfterPaid?.activatedAt).not.toBeNull();
        expect(membershipAfterPaid?.pendingExpiresAt).toBeNull();

        expect(bookingAfterPaid?.status).toBe("confirmed");
        expect(scheduleAfterPaid?.availableSpots).toBe(9);

        const metadata = paymentAfterPaid?.metadata
          ? JSON.parse(paymentAfterPaid.metadata)
          : {};

        expect(metadata.latePaymentWarning).not.toBe(true);
      } finally {
        if (bookingId) {
          await db.booking.deleteMany({
            where: { id: bookingId },
          });
        }

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

        if (scheduleId) {
          await db.schedule.deleteMany({
            where: { id: scheduleId },
          });
        }

        if (classId) {
          await db.class.deleteMany({
            where: { id: classId },
          });
        }

        if (trainerId) {
          await db.trainer.deleteMany({
            where: { id: trainerId },
          });
        }

        if (membershipPlanId) {
          await db.membership.deleteMany({
            where: { id: membershipPlanId },
          });
        }

        if (userId) {
          await db.notification.deleteMany({
            where: { userId },
          });

          await db.user.deleteMany({
            where: { id: userId },
          });
        }
      }
    });
  },
);
