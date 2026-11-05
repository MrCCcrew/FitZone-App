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
  "Paid membership carryover concurrency",
  () => {
    let userId: string;
    let planId: string;
    let targetMembershipId: string;
    let sourceMembershipId: string;
    let paymentId: string;

    beforeEach(async () => {
      const stamp =
        `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

      userId =
        `carryover-concurrency-user-${stamp}`;

      planId =
        `carryover-concurrency-plan-${stamp}`;

      targetMembershipId =
        `carryover-concurrency-target-${stamp}`;

      sourceMembershipId =
        `carryover-concurrency-source-${stamp}`;

      paymentId =
        `carryover-concurrency-payment-${stamp}`;

      await db.user.create({
        data: {
          id: userId,
          email:
            `carryover-concurrency-${stamp}@test.local`,
          name:
            "Carryover Concurrency Test",
          phone:
            `09${Date.now()
              .toString()
              .slice(-8)}`,
        },
      });

      await db.membership.create({
        data: {
          id: planId,
          name:
            "اختبار ترحيل متزامن",
          nameEn:
            "Concurrent Carryover Test",
          price: 333,
          duration: 30,
          kind: "subscription",
          sessionsCount: 12,
          features:
            JSON.stringify([
              "concurrency-test",
            ]),
        },
      });

      /*
       * Authoritative OLD membership:
       * 4 completely unused sessions.
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
       * NEW paid-renewal target.
       */
      await db.userMembership.create({
        data: {
          id: targetMembershipId,
          userId,
          membershipId: planId,
          status: "pending_payment",
          baseSessions: 12,
          totalSessions: 12,
          endDate: new Date(
            Date.now() +
              30 * 24 * 60 * 60 * 1000,
          ),
          pendingExpiresAt: new Date(
            Date.now() +
              15 * 60 * 1000,
          ),
          snapshotDurationDays: 30,
          paymentAmount: 333,
        },
      });

      await db.paymentTransaction.create({
        data: {
          id: paymentId,
          userId,
          membershipId:
            targetMembershipId,
          referenceCode:
            "FZ-CARRYOVER-CONCURRENCY",
          purpose: "subscription",
          businessUnit: "club",
          provider: "paymob",
          amount: 333,
          currency: "EGP",
          status: "pending",
          paymentMethod: "wallet",
          providerReference:
            "pi_carryover_concurrency",
        },
      });

      vi.mocked(
        paymobProvider
          .verifyPaymobTransactionForRecovery,
      ).mockImplementation(
        async () => ({
          verified: true,
          transactionId:
            "carryover-concurrency-paymob-tx",
          success: true,
          pending: false,
          amountCents: 33300,
          currency: "EGP",
          paymobOrderId: 900001,
          specialReference: null,
          sourceType: "wallet",
          isRefunded: false,
          isVoided: false,
          errorOccured: false,
        }),
      );
    });

    afterEach(async () => {
      /*
       * Break lineage explicitly before fixture
       * deletion to remain safe if FK/unique
       * semantics become stricter later.
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

      await db.membership.deleteMany({
        where: {
          id: planId,
        },
      });

      await db.user.deleteMany({
        where: {
          id: userId,
        },
      });
    });

    it(
      "concurrent exact recovery cannot carry the source balance twice",
      async () => {
        const input:
          VerifiedPaymobRecoveryInput = {
            paymentTransactionId:
              paymentId,
            paymobTransactionId:
              "carryover-concurrency-paymob-tx",
            expectedAmount: 333,
            expectedCurrency: "EGP",
            expectedFitZoneReference:
              "FZ-CARRYOVER-CONCURRENCY",
            expectedIntentionId:
              "pi_carryover_concurrency",
          };

        /*
         * Simulate duplicate admin click /
         * concurrent exact recovery.
         */
        const concurrent =
          await Promise.allSettled([
            recoverVerifiedPaymobPayment(
              input,
            ),
            recoverVerifiedPaymobPayment(
              input,
            ),
          ]);

        const fulfilled =
          concurrent.filter(
            (
              result,
            ): result is
              PromiseFulfilledResult<
                Awaited<
                  ReturnType<
                    typeof recoverVerifiedPaymobPayment
                  >
                >
              > =>
              result.status ===
              "fulfilled",
          );

        expect(
          fulfilled.length,
        ).toBeGreaterThanOrEqual(1);

        for (
          const result of fulfilled
        ) {
          expect(
            result.value.status,
          ).toBe("paid");
        }

        /*
         * A request that actually collided with
         * the atomic payment claim may fail closed.
         * No unrelated error is acceptable.
         */
        for (
          const result of concurrent
        ) {
          if (
            result.status !== "rejected"
          ) {
            continue;
          }

          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);

          expect(message).toMatch(
            /already processed or in terminal state/i,
          );
        }

        /*
         * After the concurrent race settles,
         * an exact normal retry MUST converge
         * idempotently to the paid result.
         */
        const retry =
          await recoverVerifiedPaymobPayment(
            input,
          );

        expect(retry.status).toBe("paid");

        const payment =
          await db.paymentTransaction.findUnique({
            where: {
              id: paymentId,
            },
          });

        const renewed =
          await db.userMembership.findUnique({
            where: {
              id: targetMembershipId,
            },
          });

        const source =
          await db.userMembership.findUnique({
            where: {
              id: sourceMembershipId,
            },
          });

        const lineageCount =
          await db.userMembership.count({
            where: {
              carryoverFromMembershipId:
                sourceMembershipId,
            },
          });

        expect(payment?.status).toBe("paid");

        expect(renewed?.status).toBe(
          "active",
        );

        expect(
          renewed?.baseSessions,
        ).toBe(12);

        expect(
          renewed?.carryoverSessions,
        ).toBe(4);

        /*
         * Critical invariant:
         * 12 new + 4 old = 16.
         * Never 20, 28, etc.
         */
        expect(
          renewed?.totalSessions,
        ).toBe(16);

        expect(
          renewed
            ?.carryoverFromMembershipId,
        ).toBe(sourceMembershipId);

        expect(
          renewed?.carryoverAppliedAt,
        ).not.toBeNull();

        expect(source?.status).toBe(
          "expired",
        );

        /*
         * Database-level proof that the old
         * membership is lineage source exactly once.
         */
        expect(lineageCount).toBe(1);
      },
      30000,
    );
  },
);