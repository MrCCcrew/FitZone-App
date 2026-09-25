import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/email", async () => {
  const actual =
    await vi.importActual<
      typeof import("@/lib/email")
    >("@/lib/email");

  return {
    ...actual,
    sendSubscriptionEmail:
      vi.fn().mockResolvedValue(true),
    sendAdminSubscriptionNotification:
      vi.fn().mockResolvedValue(true),
  };
});

import { db } from "@/lib/db";
import {
  recoverVerifiedPaymobPayment,
  type VerifiedPaymobRecoveryInput,
} from "@/lib/payments/service";
import * as paymobProvider
  from "@/lib/payments/providers/paymob";

vi.mock(
  "@/lib/payments/providers/paymob",
  async () => {
    const actual = await vi.importActual<
      typeof import(
        "@/lib/payments/providers/paymob"
      )
    >("@/lib/payments/providers/paymob");

    return {
      ...actual,
      verifyPaymobTransactionForRecovery:
        vi.fn(),
    };
  },
);

describe(
  "Paid timeout recovery with session carryover",
  () => {
    let userId = "";
    let planId = "";
    let sourceMembershipId = "";
    let targetMembershipId = "";
    let paymentId = "";
    let trainerId = "";
    let classId = "";
    let scheduleId = "";

    beforeEach(async () => {
      const stamp =
        `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

      userId =
        `timeout-carry-user-${stamp}`;

      planId =
        `timeout-carry-plan-${stamp}`;

      sourceMembershipId =
        `timeout-carry-source-${stamp}`;

      targetMembershipId =
        `timeout-carry-target-${stamp}`;

      paymentId =
        `timeout-carry-payment-${stamp}`;

      trainerId =
        `timeout-carry-trainer-${stamp}`;

      classId =
        `timeout-carry-class-${stamp}`;

      scheduleId =
        `timeout-carry-schedule-${stamp}`;

      await db.user.create({
        data: {
          id: userId,
          email:
            `timeout-carry-${stamp}@test.local`,
          name:
            "Timeout Carryover Test",
          phone:
            `08${Date.now()
              .toString()
              .slice(-8)}`,
        },
      });

      await db.membership.create({
        data: {
          id: planId,
          name:
            "اختبار ترحيل دفع متأخر",
          nameEn:
            "Timeout Carryover Test",
          price: 333,
          duration: 30,
          kind: "subscription",
          sessionsCount: 12,
          features:
            JSON.stringify([
              "timeout-carryover-test",
            ]),
        },
      });

      /*
       * Existing active membership:
       * four unused sessions remain.
       */
      await db.userMembership.create({
        data: {
          id: sourceMembershipId,
          userId,
          membershipId: planId,
          status: "active",
          startDate: new Date(),
          endDate: new Date(
            Date.now() +
              30 * 24 * 60 * 60 * 1000,
          ),
          snapshotDurationDays: 30,
          paymentAmount: 333,
          baseSessions: 4,
          totalSessions: 4,
        },
      });

      /*
       * Renewal target AFTER timeout cleanup.
       *
       * It was pending originally, but cleanup
       * cancelled it before the verified payment
       * arrived.
       */
      await db.userMembership.create({
        data: {
          id: targetMembershipId,
          userId,
          membershipId: planId,
          status: "cancelled",
          baseSessions: 12,
          totalSessions: 12,
          endDate: new Date(
            Date.now() +
              30 * 24 * 60 * 60 * 1000,
          ),
          pendingExpiresAt: null,
          snapshotDurationDays: 30,
          paymentAmount: 333,
        },
      });

      await db.trainer.create({
        data: {
          id: trainerId,
          name:
            "Timeout Carryover Trainer",
          specialty: "fitness",
          bio: "Test",
          isActive: true,
        },
      });

      await db.class.create({
        data: {
          id: classId,
          name:
            "Timeout Carryover Class",
          trainerId,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 10,
          price: 100,
          isActive: true,
        },
      });

      await db.schedule.create({
        data: {
          id: scheduleId,
          classId,
          date: new Date(
            Date.now() +
              24 * 60 * 60 * 1000,
          ),
          time: "10:00",
          availableSpots: 10,
          isActive: true,
        },
      });

      /*
       * Payment state exactly as timeout cleanup
       * leaves it:
       *
       * payment = cancelled
       * target membership = cancelled
       * deleted booking stored in metadata.
       */
      await db.paymentTransaction.create({
        data: {
          id: paymentId,
          userId,
          membershipId:
            targetMembershipId,
          referenceCode:
            "FZ-TIMEOUT-CARRYOVER",
          purpose: "subscription",
          businessUnit: "club",
          provider: "paymob",
          amount: 333,
          currency: "EGP",
          status: "cancelled",
          paymentMethod: "wallet",
          providerReference:
            "pi_timeout_carryover",
          metadata: JSON.stringify({
            deletedBookingsSnapshot: {
              userMembershipId:
                targetMembershipId,
              reason:
                "timeout_cleanup",
              deletedAt:
                new Date().toISOString(),
              bookings: [
                {
                  scheduleId,
                  classId,
                  date:
                    new Date(
                      Date.now() +
                        24 *
                          60 *
                          60 *
                          1000,
                    ).toISOString(),
                  time: "10:00",
                  status: "confirmed",
                },
              ],
            },
          }),
        },
      });

      vi.mocked(
        paymobProvider
          .verifyPaymobTransactionForRecovery,
      ).mockImplementation(
        async () => ({
          verified: true,
          transactionId:
            "timeout-carryover-paymob-tx",
          success: true,
          pending: false,
          amountCents: 33300,
          currency: "EGP",
          paymobOrderId: 900002,
          specialReference: null,
          sourceType: "wallet",
          isRefunded: false,
          isVoided: false,
          errorOccured: false,
        }),
      );
    });

    afterEach(async () => {
      await db.booking.deleteMany({
        where: {
          scheduleId,
        },
      });

      /*
       * Remove carryover lineage before fixture
       * deletion.
       */
      await db.userMembership.updateMany({
        where: {
          id: targetMembershipId,
        },
        data: {
          carryoverFromMembershipId: null,
          carryoverAppliedAt: null,
          carryoverSessions: 0,
        },
      });

      await db.paymentTransaction.deleteMany({
        where: {
          id: paymentId,
        },
      });

      await db.userMembership.deleteMany({
        where: {
          id: {
            in: [
              targetMembershipId,
              sourceMembershipId,
            ],
          },
        },
      });

      await db.schedule.deleteMany({
        where: { id: scheduleId },
      });

      await db.class.deleteMany({
        where: { id: classId },
      });

      await db.trainer.deleteMany({
        where: { id: trainerId },
      });

      await db.membership.deleteMany({
        where: { id: planId },
      });

      await db.user.deleteMany({
        where: { id: userId },
      });
    });

    it(
      "late verified renewal carries old balance and restores timeout booking exactly once",
      async () => {
        const input:
          VerifiedPaymobRecoveryInput = {
            paymentTransactionId:
              paymentId,
            paymobTransactionId:
              "timeout-carryover-paymob-tx",
            expectedAmount: 333,
            expectedCurrency: "EGP",
            expectedFitZoneReference:
              "FZ-TIMEOUT-CARRYOVER",
            expectedIntentionId:
              "pi_timeout_carryover",
          };

        const beforeSchedule =
          await db.schedule.findUnique({
            where: {
              id: scheduleId,
            },
            select: {
              availableSpots: true,
            },
          });

        expect(
          beforeSchedule?.availableSpots,
        ).toBe(10);

        /*
         * First late-payment recovery:
         * reopen target -> activate ->
         * carry 4 old sessions ->
         * expire old source ->
         * restore timeout booking.
         */
        const first =
          await recoverVerifiedPaymobPayment(
            input,
          );

        expect(first.status).toBe("paid");

        const paymentAfterFirst =
          await db.paymentTransaction.findUnique({
            where: {
              id: paymentId,
            },
          });

        const targetAfterFirst =
          await db.userMembership.findUnique({
            where: {
              id: targetMembershipId,
            },
          });

        const sourceAfterFirst =
          await db.userMembership.findUnique({
            where: {
              id: sourceMembershipId,
            },
          });

        const bookingsAfterFirst =
          await db.booking.findMany({
            where: {
              userMembershipId:
                targetMembershipId,
              scheduleId,
            },
          });

        const scheduleAfterFirst =
          await db.schedule.findUnique({
            where: {
              id: scheduleId,
            },
            select: {
              availableSpots: true,
            },
          });

        expect(
          paymentAfterFirst?.status,
        ).toBe("paid");

        expect(
          paymentAfterFirst
            ?.externalReference,
        ).toBe(
          "timeout-carryover-paymob-tx",
        );

        expect(
          targetAfterFirst?.status,
        ).toBe("active");

        expect(
          targetAfterFirst?.baseSessions,
        ).toBe(12);

        expect(
          targetAfterFirst
            ?.carryoverSessions,
        ).toBe(4);

        expect(
          targetAfterFirst
            ?.totalSessions,
        ).toBe(16);

        expect(
          targetAfterFirst
            ?.carryoverFromMembershipId,
        ).toBe(sourceMembershipId);

        expect(
          targetAfterFirst
            ?.carryoverAppliedAt,
        ).not.toBeNull();

        expect(
          sourceAfterFirst?.status,
        ).toBe("expired");

        expect(
          bookingsAfterFirst,
        ).toHaveLength(1);

        expect(
          bookingsAfterFirst[0]?.status,
        ).toBe("confirmed");

        expect(
          scheduleAfterFirst
            ?.availableSpots,
        ).toBe(9);

        /*
         * Exact late-payment retry:
         * - no second carryover
         * - no second booking
         * - no second seat decrement
         */
        const second =
          await recoverVerifiedPaymobPayment(
            input,
          );

        expect(second.status).toBe("paid");

        const targetAfterSecond =
          await db.userMembership.findUnique({
            where: {
              id: targetMembershipId,
            },
          });

        const bookingsAfterSecond =
          await db.booking.findMany({
            where: {
              userMembershipId:
                targetMembershipId,
              scheduleId,
            },
          });

        const scheduleAfterSecond =
          await db.schedule.findUnique({
            where: {
              id: scheduleId,
            },
            select: {
              availableSpots: true,
            },
          });

        const lineageCount =
          await db.userMembership.count({
            where: {
              carryoverFromMembershipId:
                sourceMembershipId,
            },
          });

        expect(
          targetAfterSecond
            ?.carryoverSessions,
        ).toBe(4);

        expect(
          targetAfterSecond
            ?.totalSessions,
        ).toBe(16);

        expect(
          bookingsAfterSecond,
        ).toHaveLength(1);

        expect(
          scheduleAfterSecond
            ?.availableSpots,
        ).toBe(9);

        expect(lineageCount).toBe(1);
      },
      30000,
    );
  },
);