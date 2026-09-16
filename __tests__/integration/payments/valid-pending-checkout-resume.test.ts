import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  findReusablePendingMembershipCheckout,
  type SubscribeAttemptFingerprint,
} from "@/lib/payments/pending-membership-cleanup";

describe("Valid pending membership checkout resume", { timeout: 60000 }, () => {
  it("resumes only the exact same purchase fingerprint", async () => {
    let userId = "";
    let planId = "";
    let userMembershipId = "";
    let paymentId = "";

    try {
      const user = await db.user.create({
        data: {
          phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
          name: "Valid Pending Resume Test",
          gender: "female",
        },
      });
      userId = user.id;

      const plan = await db.membership.create({
        data: {
          name: "Valid Pending Resume Plan",
          duration: 30,
          price: 300,
          sessionsCount: 8,
          walletBonus: 0,
          features: "[]",
        },
      });
      planId = plan.id;

      const fingerprint: SubscribeAttemptFingerprint = {
        membershipId: planId,
        offerId: null,
        scheduleIds: ["resume-test-schedule-a", "resume-test-schedule-b"],
        paymentMethod: "paymob",
        discountCode: "SAVE10",
        walletDeduct: 25,
        pointsDeduct: 10,
        selectedMonths: null,
        startDate: null,
        partnerCode: null,
        memberBenefitCode: null,
        affiliateRef: "AFFTEST",
        agentRef: null,
        coachMembershipTrainerId: "trainer-A",
      };

      const membership = await db.userMembership.create({
        data: {
          userId,
          membershipId: planId,
          status: "pending_payment",
          pendingExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          paymentAmount: 250,
          paymentMethod: "paymob",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 86400000),
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
          amount: 250,
          currency: "EGP",
          status: "requires_action",
          paymentMethod: "card",
          checkoutUrl: "https://checkout.test/existing-pending",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          metadata: JSON.stringify({
            subscribeAttemptFingerprint: fingerprint,
            bookingRecoveryData: {
              selectedScheduleIds: fingerprint.scheduleIds,
              createdAt: new Date().toISOString(),
            },
          }),
        },
      });
      paymentId = payment.id;

      const exact = await findReusablePendingMembershipCheckout({
        userId,
        fingerprint: {
          ...fingerprint,
          scheduleIds: [...fingerprint.scheduleIds].reverse(),
        },
      });

      expect(exact?.membershipId).toBe(userMembershipId);
      expect(exact?.transactionId).toBe(paymentId);
      expect(exact?.checkoutUrl).toBe("https://checkout.test/existing-pending");

      const mismatches: SubscribeAttemptFingerprint[] = [
        {
          ...fingerprint,
          coachMembershipTrainerId: "trainer-B",
        },

        { ...fingerprint, walletDeduct: 30 },
        { ...fingerprint, pointsDeduct: 11 },
        { ...fingerprint, discountCode: "OTHER" },
        { ...fingerprint, paymentMethod: "wallet" },
        { ...fingerprint, selectedMonths: 3 },
        { ...fingerprint, startDate: "2026-09-01" },
        { ...fingerprint, affiliateRef: "OTHER-AFF" },
        {
          ...fingerprint,
          scheduleIds: ["different-schedule"],
        },
      ];

      for (const changed of mismatches) {
        const result = await findReusablePendingMembershipCheckout({
          userId,
          fingerprint: changed,
        });

        expect(result).toBeNull();
      }

      // Legacy pending transactions without a fingerprint must never
      // be resumed by guessing from product/schedules alone.
      await db.paymentTransaction.update({
        where: { id: paymentId },
        data: {
          metadata: JSON.stringify({
            bookingRecoveryData: {
              selectedScheduleIds: fingerprint.scheduleIds,
            },
          }),
        },
      });

      const legacy = await findReusablePendingMembershipCheckout({
        userId,
        fingerprint,
      });

      expect(legacy).toBeNull();
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
});
