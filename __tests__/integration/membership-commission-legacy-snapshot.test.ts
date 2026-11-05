import { describe, expect, it } from "vitest";

import { db, asDbTransactionClient } from "@/lib/db";
import {
  ensureLegacyMembershipCommissionSnapshotTx,
} from "@/lib/commissions/membership-commission-legacy-snapshot";
import {
  parseMembershipCommissionSnapshot,
} from "@/lib/commissions/membership-commission-contract";

describe(
  "legacy membership commission snapshot compatibility",
  { timeout: 90000 },
  () => {
    it("freezes historical Paymob economics exactly once for a pre-cutover membership", async () => {
      const suffix =
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let customerId = "";
      let partnerUserId = "";
      let agentUserId = "";
      let managerUserId = "";

      let partnerId = "";
      let affiliateLinkId = "";
      let salesAgentId = "";
      let managerId = "";
      let planId = "";
      let userMembershipId = "";

      try {
        const url = new URL(process.env.DATABASE_URL ?? "");

        if (
          process.env.APP_ENV !== "test" ||
          url.pathname.replace(/^\//, "") !== "fitzone_test"
        ) {
          throw new Error("REFUSING: fitzone_test required");
        }

        const customer = await db.user.create({
          data: {
            email: `legacy-snapshot-customer-${suffix}@example.test`,
            name: "Legacy Snapshot Customer",
          },
        });
        customerId = customer.id;

        const partnerUser = await db.user.create({
          data: {
            email: `legacy-snapshot-partner-${suffix}@example.test`,
            name: "Legacy Snapshot Partner",
            role: "partner",
          },
        });
        partnerUserId = partnerUser.id;

        const agentUser = await db.user.create({
          data: {
            email: `legacy-snapshot-agent-${suffix}@example.test`,
            name: "Legacy Snapshot Agent",
          },
        });
        agentUserId = agentUser.id;

        const managerUser = await db.user.create({
          data: {
            email: `legacy-snapshot-manager-${suffix}@example.test`,
            name: "Legacy Snapshot Manager",
            role: "staff",
          },
        });
        managerUserId = managerUser.id;

        const manager = await db.contractsManager.create({
          data: {
            userId: managerUserId,
            name: `Legacy Snapshot Manager ${suffix}`,
            commissionType: "percentage_of_revenue",
            commissionRate: 5,
            isActive: true,
          },
        });
        managerId = manager.id;

        const partner = await db.partner.create({
          data: {
            userId: partnerUserId,
            name: `Legacy Snapshot Partner ${suffix}`,
            category: "other",
            commissionRate: 10,
            commissionType: "percentage",
            isActive: true,
          },
        });
        partnerId = partner.id;

        const affiliate = await db.partnerAffiliateLink.create({
          data: {
            partnerId,
            token: `LEGACYPARTNER${suffix}`
              .replace(/[^A-Za-z0-9]/g, "")
              .toUpperCase(),
            isActive: true,
          },
        });
        affiliateLinkId = affiliate.id;

        const agent = await db.salesAgent.create({
          data: {
            userId: agentUserId,
            name: `Legacy Snapshot Agent ${suffix}`,
            referralCode: `LEGACYAGENT${suffix}`
              .replace(/[^A-Za-z0-9]/g, "")
              .toUpperCase(),
            commissionType: "percentage",
            commissionRate: 10,
            clientDiscountType: "percentage",
            clientDiscountValue: 0,
            managerId,
            isActive: true,
          },
        });
        salesAgentId = agent.id;

        /*
         * Historical reconciliation must use priceAfter=333 as Partner base,
         * even though customer actually paid only 300.
         */
        const plan = await db.membership.create({
          data: {
            name: `Legacy Snapshot Plan ${suffix}`,
            nameEn: `Legacy Snapshot Plan ${suffix}`,
            duration: 30,
            price: 500,
            priceAfter: 333,
            sessionsCount: 0,
            walletBonus: 0,
            features: "[]",
          },
        });
        planId = plan.id;

        const startDate = new Date();
        const endDate =
          new Date(startDate.getTime() + 30 * 86400000);

        /*
         * PRE-CUTOVER membership:
         * attribution exists but commissionSnapshot is intentionally NULL.
         */
        const userMembership = await db.userMembership.create({
          data: {
            userId: customerId,
            membershipId: planId,
            status: "active",
            startDate,
            endDate,
            paymentAmount: 300,
            paymentMethod: "card",

            partnerId,
            affiliateLinkId,
            salesAgentId,

            commissionSnapshot: null,
            commissionAccruedAt: null,
          },
        });
        userMembershipId = userMembership.id;

        const first = await db.$transaction((tx) =>
          ensureLegacyMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            userMembershipId,
          ),
        );

        expect(first.created).toBe(true);
        expect(first.alreadyPresent).toBe(false);

        const frozenRaw = first.commissionSnapshot;
        const frozen =
          parseMembershipCommissionSnapshot(frozenRaw);

        expect(frozen.partner?.terms).toEqual({
          type: "percentage",
          rate: 10,
          baseAmount: 333,
        });

        expect(frozen.salesAgent?.terms).toEqual({
          type: "percentage",
          rate: 10,
          baseAmount: 300,
        });

        expect(frozen.salesAgent?.trackedSpendAmount).toBe(300);

        expect(frozen.salesAgent?.manager).toEqual({
          managerId,
          type: "percentage_of_revenue",
          rate: 5,
          revenueBase: 300,
        });

        /*
         * Change all live economics AFTER the first legacy reconciliation
         * snapshot has been frozen.
         */
        await db.membership.update({
          where: { id: planId },
          data: {
            price: 9999,
            priceAfter: 8888,
          },
        });

        await db.partner.update({
          where: { id: partnerId },
          data: {
            commissionType: "fixed",
            commissionRate: 777,
          },
        });

        await db.salesAgent.update({
          where: { id: salesAgentId },
          data: {
            commissionType: "fixed",
            commissionRate: 666,
          },
        });

        await db.contractsManager.update({
          where: { id: managerId },
          data: {
            commissionType: "fixed",
            commissionRate: 555,
          },
        });

        const second = await db.$transaction((tx) =>
          ensureLegacyMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            userMembershipId,
          ),
        );

        expect(second.created).toBe(false);
        expect(second.alreadyPresent).toBe(true);

        // Byte-for-byte immutable after first freeze.
        expect(second.commissionSnapshot).toBe(frozenRaw);

        const stored = await db.userMembership.findUnique({
          where: { id: userMembershipId },
          select: {
            commissionSnapshot: true,
            commissionAccruedAt: true,
          },
        });

        expect(stored?.commissionSnapshot).toBe(frozenRaw);

        // Compatibility snapshot creation itself NEVER earns commission.
        expect(stored?.commissionAccruedAt).toBeNull();

        expect(
          await db.partnerCommission.count({
            where: { userMembershipId },
          }),
        ).toBe(0);

        expect(
          await db.salesAgentCommission.count({
            where: { userMembershipId },
          }),
        ).toBe(0);

        expect(
          await db.managerCommission.count({
            where: { userMembershipId },
          }),
        ).toBe(0);
      } finally {
        if (userMembershipId) {
          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (affiliateLinkId) {
          await db.partnerAffiliateLink.deleteMany({
            where: { id: affiliateLinkId },
          });
        }

        if (salesAgentId) {
          await db.salesAgent.deleteMany({
            where: { id: salesAgentId },
          });
        }

        if (partnerId) {
          await db.partner.deleteMany({
            where: { id: partnerId },
          });
        }

        if (managerId) {
          await db.contractsManager.deleteMany({
            where: { id: managerId },
          });
        }

        if (planId) {
          await db.membership.deleteMany({
            where: { id: planId },
          });
        }

        const userIds = [
          customerId,
          partnerUserId,
          agentUserId,
          managerUserId,
        ].filter(Boolean);

        if (userIds.length) {
          await db.user.deleteMany({
            where: {
              id: { in: userIds },
            },
          });
        }
      }
    });
  },
);
