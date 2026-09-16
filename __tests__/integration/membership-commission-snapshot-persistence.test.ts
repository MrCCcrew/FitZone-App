import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, asDbTransactionClient } from "@/lib/db";
import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { parseMembershipCommissionSnapshot } from "@/lib/commissions/membership-commission-contract";

describe(
  "membership commission snapshot persistence",
  { timeout: 90000 },
  () => {
    let memberUserId = "";
    let agentUserId = "";
    let managerUserId = "";
    let membershipPlanId = "";
    let salesAgentId = "";
    let managerId = "";
    let userMembershipId = "";

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const referralCode = `FZ-SNAPSHOT-${suffix}`.toUpperCase();

    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? "");

      if (
        process.env.APP_ENV !== "test" ||
        url.pathname.replace(/^\//, "") !== "fitzone_test"
      ) {
        throw new Error("REFUSING: fitzone_test required");
      }

      const member = await db.user.create({
        data: {
          email: `snapshot-member-${suffix}@example.test`,
          name: "Commission Snapshot Member",
        },
      });
      memberUserId = member.id;

      const agentUser = await db.user.create({
        data: {
          email: `snapshot-agent-${suffix}@example.test`,
          name: "Commission Snapshot Agent",
        },
      });
      agentUserId = agentUser.id;

      const managerUser = await db.user.create({
        data: {
          email: `snapshot-manager-${suffix}@example.test`,
          name: "Commission Snapshot Manager",
        },
      });
      managerUserId = managerUser.id;

      const manager = await db.contractsManager.create({
        data: {
          userId: managerUserId,
          name: `Snapshot Manager ${suffix}`,
          commissionType: "percentage_of_revenue",
          commissionRate: 5,
          isActive: true,
        },
      });
      managerId = manager.id;

      const agent = await db.salesAgent.create({
        data: {
          userId: agentUserId,
          name: `Snapshot Agent ${suffix}`,
          referralCode,
          commissionType: "percentage",
          commissionRate: 10,
          clientDiscountType: "percentage",
          clientDiscountValue: 0,
          managerId,
          isActive: true,
        },
      });
      salesAgentId = agent.id;

      const plan = await db.membership.create({
        data: {
          name: `Snapshot Plan ${suffix}`,
          nameEn: `Snapshot Plan ${suffix}`,
          kind: "subscription",
          price: 1000,
          priceAfter: 800,
          duration: 30,
          features: "[]",
          isActive: true,
        },
      });
      membershipPlanId = plan.id;
    });

    afterAll(async () => {
      if (userMembershipId) {
        await db.userMembership.deleteMany({
          where: { id: userMembershipId },
        });
      }

      if (salesAgentId) {
        await db.salesAgent.deleteMany({
          where: { id: salesAgentId },
        });
      }

      if (managerId) {
        await db.contractsManager.deleteMany({
          where: { id: managerId },
        });
      }

      if (membershipPlanId) {
        await db.membership.deleteMany({
          where: { id: membershipPlanId },
        });
      }

      const userIds = [
        memberUserId,
        agentUserId,
        managerUserId,
      ].filter(Boolean);

      if (userIds.length) {
        await db.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    });

    it("freezes checkout economics on pending_payment and ignores later live configuration changes", async () => {
      const created = await db.$transaction(async (tx) => {
        /*
         * Simulated final checkout economics:
         *
         * listed/effective Partner-style base = 800
         * actual remaining external customer payment = 650
         *
         * This matches the values subscribe already computes before
         * buildMembershipCommissionSnapshotTx().
         */
        const commissionSnapshot =
          await buildMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            {
              salesAgentId,
              partnerCommissionBase: 800,
              customerPaidAmount: 650,
            },
          );

        return tx.userMembership.create({
          data: {
            userId: memberUserId,
            membershipId: membershipPlanId,
            status: "pending_payment",
            paymentAmount: 650,
            paymentMethod: "paymob",
            pendingExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            startDate: new Date(),
            endDate: new Date(Date.now() + 30 * 86400000),
            salesAgentId,
            commissionSnapshot,
          },
        });
      });

      userMembershipId = created.id;

      expect(created.status).toBe("pending_payment");
      expect(created.commissionSnapshot).toBeTruthy();
      expect(created.commissionAccruedAt).toBeNull();

      const frozenRaw = created.commissionSnapshot!;

      const frozen = parseMembershipCommissionSnapshot(frozenRaw);

      expect(frozen.salesAgent).toMatchObject({
        agentId: salesAgentId,
        referralCode,
        trackedSpendAmount: 650,
        terms: {
          type: "percentage",
          rate: 10,
          baseAmount: 650,
        },
        manager: {
          managerId,
          type: "percentage_of_revenue",
          rate: 5,
          revenueBase: 650,
        },
      });

      /*
       * Simulate admin changes AFTER checkout but BEFORE Paymob confirmation.
       */
      await db.membership.update({
        where: { id: membershipPlanId },
        data: {
          price: 9999,
          priceAfter: 7777,
        },
      });

      await db.salesAgent.update({
        where: { id: salesAgentId },
        data: {
          commissionType: "fixed",
          commissionRate: 999,
        },
      });

      await db.contractsManager.update({
        where: { id: managerId },
        data: {
          commissionType: "fixed",
          commissionRate: 888,
        },
      });

      const afterLiveChanges = await db.userMembership.findUnique({
        where: { id: userMembershipId },
        select: {
          status: true,
          paymentAmount: true,
          commissionSnapshot: true,
          commissionAccruedAt: true,
        },
      });

      expect(afterLiveChanges?.status).toBe("pending_payment");
      expect(afterLiveChanges?.paymentAmount).toBe(650);

      // Byte-for-byte immutable contract.
      expect(afterLiveChanges?.commissionSnapshot).toBe(frozenRaw);

      // Payment has not economically finalized yet.
      expect(afterLiveChanges?.commissionAccruedAt).toBeNull();

      const stillFrozen = parseMembershipCommissionSnapshot(
        afterLiveChanges!.commissionSnapshot!,
      );

      // Must still contain checkout-time economics, not current live config.
      expect(stillFrozen.salesAgent?.terms).toEqual({
        type: "percentage",
        rate: 10,
        baseAmount: 650,
      });

      expect(stillFrozen.salesAgent?.manager).toEqual({
        managerId,
        type: "percentage_of_revenue",
        rate: 5,
        revenueBase: 650,
      });

      // No commission is earned merely by freezing the contract.
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
    });
  },
);
