import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, asDbTransactionClient } from "@/lib/db";
import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { accrueMembershipCommissionsTx } from "@/lib/commissions/membership-commission-accrual";

describe(
  "staff referral accrual policy",
  { timeout: 120000 },
  () => {
    const suffix =
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const asOfDate =
      new Date("2026-09-10T12:00:00.000Z");

    let staffUserId = "";
    let positiveCustomerId = "";
    let zeroCustomerId = "";
    let positionId = "";
    let employeeId = "";
    let policyId = "";
    let linkId = "";
    let planId = "";

    const membershipIds: string[] = [];

    function guard() {
      const u = new URL(process.env.DATABASE_URL ?? "");

      if (
        process.env.APP_ENV !== "test" ||
        u.pathname.replace(/^\//, "") !== "fitzone_test"
      ) {
        throw new Error("REFUSING: fitzone_test required");
      }
    }

    beforeAll(async () => {
      guard();

      const position = await db.position.create({
        data: {
          code: `REFACC-${suffix}`,
          name: `Referral Accrual ${suffix}`,
          isActive: true,
        },
      });

      positionId = position.id;

      const staff = await db.user.create({
        data: {
          email: `refacc-staff-${suffix}@example.test`,
          name: "Referral Accrual Staff",
          role: "staff",

          // Must be ignored by the new policy engine.
          commissionRate: 99,
          commissionType: "percentage",
        },
      });

      staffUserId = staff.id;

      const employee = await db.employeeProfile.create({
        data: {
          userId: staffUserId,
          employeeCode: `REFACCEMP-${suffix}`,
          name: "Referral Accrual Staff",
          positionId,
          employmentStatus: "active",
        },
      });

      employeeId = employee.id;

      const positiveCustomer = await db.user.create({
        data: {
          email: `refacc-positive-${suffix}@example.test`,
          name: "Positive Referral Customer",
        },
      });

      positiveCustomerId = positiveCustomer.id;

      const zeroCustomer = await db.user.create({
        data: {
          email: `refacc-zero-${suffix}@example.test`,
          name: "Zero Referral Customer",
        },
      });

      zeroCustomerId = zeroCustomer.id;

      const link = await db.staffReferralLink.create({
        data: {
          userId: staffUserId,
          token: `REFACC${suffix}`
            .replace(/[^A-Za-z0-9]/g, "")
            .toUpperCase(),
          label: "Referral accrual policy test",
          isActive: true,
        },
      });

      linkId = link.id;

      const plan = await db.membership.create({
        data: {
          name: `Referral Accrual Plan ${suffix}`,
          nameEn: `Referral Accrual Plan ${suffix}`,
          kind: "subscription",
          duration: 30,
          price: 1000,
          priceAfter: 1000,
          sessionsCount: 0,
          walletBonus: 0,
          features: "[]",
          isActive: true,
        },
      });

      planId = plan.id;

      const policy = await db.referralCommissionPolicy.create({
        data: {
          effectiveFrom:
            new Date("2026-01-01T00:00:00.000Z"),

          minimumShortTermGapDays: 15,
          shortTermMaxMonths: 3,

          underMinimumGapBps: 0,
          shortTermBps: 250,

          isActive: true,

          rates: {
            create: {
              positionId,
              newCustomerBps: 500,
              longTermBps: 600,
            },
          },
        },
      });

      policyId = policy.id;

      /*
       * Zero-customer has a REAL previous membership ending 5 days
       * before checkout, therefore classification must be
       * short_term_under_minimum = 0%.
       */
      const historical = await db.userMembership.create({
        data: {
          userId: zeroCustomerId,
          membershipId: planId,
          status: "active",
          activatedAt:
            new Date("2026-08-01T00:00:00.000Z"),
          startDate:
            new Date("2026-08-06T00:00:00.000Z"),
          endDate:
            new Date("2026-09-05T00:00:00.000Z"),
          paymentAmount: 1000,
        },
      });

      membershipIds.push(historical.id);
    });

    afterAll(async () => {
      guard();

      await db.staffCommission.deleteMany({
        where: { staffUserId },
      });

      await db.userMembership.deleteMany({
        where: {
          id: { in: membershipIds },
        },
      });

      if (policyId) {
        await db.referralCommissionPolicyRate.deleteMany({
          where: { policyId },
        });

        await db.referralCommissionPolicy.deleteMany({
          where: { id: policyId },
        });
      }

      if (linkId) {
        await db.staffReferralLink.deleteMany({
          where: { id: linkId },
        });
      }

      if (employeeId) {
        await db.employeeProfile.deleteMany({
          where: { id: employeeId },
        });
      }

      if (planId) {
        await db.membership.deleteMany({
          where: { id: planId },
        });
      }

      await db.user.deleteMany({
        where: {
          id: {
            in: [
              staffUserId,
              positiveCustomerId,
              zeroCustomerId,
            ].filter(Boolean),
          },
        },
      });

      if (positionId) {
        await db.position.deleteMany({
          where: { id: positionId },
        });
      }
    });

    async function createCheckout(
      customerUserId: string,
    ) {
      return db.$transaction(async (tx) => {
        const commissionSnapshot =
          await buildMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            {
              staffReferralLinkId: linkId,
              customerUserId,
              staffReferralAsOfDate: asOfDate,

              partnerCommissionBase: 1000,
              customerPaidAmount: 1000,
            },
          );

        const row = await tx.userMembership.create({
          data: {
            userId: customerUserId,
            membershipId: planId,
            status: "active",
            activatedAt: asOfDate,
            startDate: asOfDate,
            endDate:
              new Date("2026-10-10T12:00:00.000Z"),
            paymentAmount: 1000,

            staffReferralLinkId: linkId,
            commissionSnapshot,
          },
        });

        return row;
      });
    }

    it("creates earned commission for positive referral and increments clickCount once", async () => {
      const membership =
        await createCheckout(positiveCustomerId);

      membershipIds.push(membership.id);

      const first = await db.$transaction((tx) =>
        accrueMembershipCommissionsTx(
          asDbTransactionClient(tx),
          membership.id,
        ),
      );

      expect(first.alreadyCompleted).toBe(false);
      expect(first.skipped).toBe(false);

      const commission =
        await db.staffCommission.findUnique({
          where: {
            userMembershipId: membership.id,
          },
        });

      expect(commission).not.toBeNull();
      expect(commission?.amount).toBe(50);
      expect(commission?.status).toBe("earned");

      expect(
        commission?.customerClassificationSnapshot,
      ).toBe("new_customer");

      expect(
        commission?.commissionRateBpsSnapshot,
      ).toBe(500);

      expect(
        commission?.commissionBaseMinorSnapshot,
      ).toBe(100000);

      expect(
        commission?.commissionAmountMinorSnapshot,
      ).toBe(5000);

      const linkAfterFirst =
        await db.staffReferralLink.findUnique({
          where: { id: linkId },
        });

      expect(linkAfterFirst?.clickCount).toBe(1);

      /*
       * Exact-once: retry must not create another commission
       * and must not increment clickCount again.
       */
      const second = await db.$transaction((tx) =>
        accrueMembershipCommissionsTx(
          asDbTransactionClient(tx),
          membership.id,
        ),
      );

      expect(second.alreadyCompleted).toBe(true);

      expect(
        await db.staffCommission.count({
          where: {
            userMembershipId: membership.id,
          },
        }),
      ).toBe(1);

      const linkAfterRetry =
        await db.staffReferralLink.findUnique({
          where: { id: linkId },
        });

      expect(linkAfterRetry?.clickCount).toBe(1);
    });

    it("records a valid 0% referral as ineligible and never increments clickCount", async () => {
      const membership =
        await createCheckout(zeroCustomerId);

      membershipIds.push(membership.id);

      const before =
        await db.staffReferralLink.findUnique({
          where: { id: linkId },
        });

      const result = await db.$transaction((tx) =>
        accrueMembershipCommissionsTx(
          asDbTransactionClient(tx),
          membership.id,
        ),
      );

      expect(result.alreadyCompleted).toBe(false);
      expect(result.skipped).toBe(false);

      const commission =
        await db.staffCommission.findUnique({
          where: {
            userMembershipId: membership.id,
          },
        });

      expect(commission).not.toBeNull();

      expect(commission?.amount).toBe(0);
      expect(commission?.status).toBe("ineligible");

      expect(
        commission?.customerClassificationSnapshot,
      ).toBe("short_term_under_minimum");

      expect(
        commission?.previousMembershipIdSnapshot,
      ).not.toBeNull();

      expect(commission?.gapDaysSnapshot).toBe(5);

      expect(
        commission?.commissionRateBpsSnapshot,
      ).toBe(0);

      expect(
        commission?.commissionBaseMinorSnapshot,
      ).toBe(100000);

      expect(
        commission?.commissionAmountMinorSnapshot,
      ).toBe(0);

      const after =
        await db.staffReferralLink.findUnique({
          where: { id: linkId },
        });

      // Positive test already incremented it to 1.
      // Zero-value referral must leave it unchanged.
      expect(after?.clickCount).toBe(before?.clickCount);

      /*
       * Settlement candidate contract:
       * this row MUST NOT be visible to the exact query
       * used by the staff referral settlement endpoint.
       */
      expect(
        await db.staffCommission.count({
          where: {
            staffUserId,
            status: "earned",
            id: commission!.id,
          },
        }),
      ).toBe(0);

      /*
       * Exact-once retry.
       */
      const retry = await db.$transaction((tx) =>
        accrueMembershipCommissionsTx(
          asDbTransactionClient(tx),
          membership.id,
        ),
      );

      expect(retry.alreadyCompleted).toBe(true);

      expect(
        await db.staffCommission.count({
          where: {
            userMembershipId: membership.id,
          },
        }),
      ).toBe(1);

      const afterRetry =
        await db.staffReferralLink.findUnique({
          where: { id: linkId },
        });

      expect(afterRetry?.clickCount).toBe(after?.clickCount);
    });
  },
);
