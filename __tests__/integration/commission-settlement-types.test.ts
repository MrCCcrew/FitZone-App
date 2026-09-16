import { afterEach, describe, expect, it } from "vitest";
import { db, asDbTransactionClient } from "@/lib/db";
import {
  settleCommissionsTx,
  type CommissionType,
} from "@/lib/commissions/commission-settlement-service";

function assertTestDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("REFUSING: DATABASE_URL missing");

  const url = new URL(raw);

  if (
    process.env.APP_ENV !== "test" ||
    url.hostname !== "127.0.0.1" ||
    decodeURIComponent(url.username) !== "fitzone_test_user" ||
    url.pathname !== "/fitzone_test"
  ) {
    throw new Error("REFUSING: settlement type tests require fitzone_test");
  }
}

assertTestDatabase();

const userIds: string[] = [];
const membershipPlanIds: string[] = [];
const userMembershipIds: string[] = [];
const salesAgentIds: string[] = [];
const managerIds: string[] = [];
const payoutIds: string[] = [];

async function createUser(label: string, role = "staff") {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const user = await db.user.create({
    data: {
      email: `${label}-${stamp}@fitzone.test`,
      name: `${label} test`,
      role,
    },
  });

  userIds.push(user.id);
  return user;
}

async function createMembershipFixture() {
  const customer = await createUser("settlement-customer", "member");

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const plan = await db.membership.create({
    data: {
      name: `Settlement Type Plan ${stamp}`,
      nameEn: `Settlement Type Plan ${stamp}`,
      duration: 30,
      price: 100,
      sessionsCount: 0,
      walletBonus: 0,
      features: "[]",
    },
  });

  membershipPlanIds.push(plan.id);

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 30 * 86400000);

  const userMembership = await db.userMembership.create({
    data: {
      userId: customer.id,
      membershipId: plan.id,
      status: "active",
      startDate,
      endDate,
      paymentAmount: 100,
      paymentMethod: "cash",
    },
  });

  userMembershipIds.push(userMembership.id);

  return userMembership;
}

async function settle(input: {
  commissionType: CommissionType;
  beneficiaryId: string;
  commissionId: string;
}) {
  const result = await db.$transaction(async (tx) =>
    settleCommissionsTx(asDbTransactionClient(tx), {
      commissionType: input.commissionType,
      beneficiaryId: input.beneficiaryId,
      commissionIds: [input.commissionId],
      actorUserId: userIds[0] ?? null,
      paymentMethod: "integration-test",
    }),
  );

  payoutIds.push(result.payout.id);

  expect(result.idempotent).toBe(false);
  expect(result.payout.status).toBe("paid");
  expect(result.payout.items).toHaveLength(1);
  expect(result.payout.items[0].commissionType).toBe(input.commissionType);
  expect(result.payout.items[0].commissionId).toBe(input.commissionId);

  return result;
}

afterEach(async () => {
  if (payoutIds.length) {
    await db.commissionPayout.deleteMany({
      where: {
        id: { in: payoutIds.splice(0) },
      },
    });
  }

  /*
   * MarketingCommission references both UserMembership and
   * MarketingConversion with RESTRICT, so clear marketing fixtures
   * before deleting memberships/users.
   */
  if (userIds.length) {
    await db.marketingCommission.deleteMany({
      where: {
        staffUserId: { in: userIds },
      },
    });

    await db.marketingConversion.deleteMany({
      where: {
        OR: [
          { customerId: { in: userIds } },
          { assignedStaffUserId: { in: userIds } },
        ],
      },
    });
  }

  if (userMembershipIds.length) {
    await db.userMembership.deleteMany({
      where: {
        id: { in: userMembershipIds.splice(0) },
      },
    });
  }

  if (salesAgentIds.length) {
    await db.salesAgent.deleteMany({
      where: {
        id: { in: salesAgentIds.splice(0) },
      },
    });
  }

  if (managerIds.length) {
    await db.contractsManager.deleteMany({
      where: {
        id: { in: managerIds.splice(0) },
      },
    });
  }

  if (membershipPlanIds.length) {
    await db.membership.deleteMany({
      where: {
        id: { in: membershipPlanIds.splice(0) },
      },
    });
  }

  if (userIds.length) {
    await db.user.deleteMany({
      where: {
        id: { in: userIds.splice(0) },
      },
    });
  }
});

describe(
  "CommissionSettlementService — all remaining commission types",
  { timeout: 90_000 },
  () => {
    it("agent_user: earned -> settled", async () => {
      const agentUser = await createUser("legacy-agent", "staff");

      const membership = await createMembershipFixture();

      const commission = await db.agentCommission.create({
        data: {
          agentUserId: agentUser.id,
          userMembershipId: membership.id,
          amount: 14.25,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "agent_user",
        beneficiaryId: agentUser.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(14.25);

      const after = await db.agentCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("sales_agent: earned -> settled", async () => {
      const agentUser = await createUser("sales-agent", "staff");

      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const agent = await db.salesAgent.create({
        data: {
          userId: agentUser.id,
          name: "Settlement Sales Agent",
          referralCode: `SET${stamp}`
            .replace(/[^A-Za-z0-9]/g, "")
            .slice(0, 30)
            .toUpperCase(),
          commissionRate: 10,
          commissionType: "percentage",
          isActive: true,
        },
      });

      salesAgentIds.push(agent.id);

      const membership = await createMembershipFixture();

      const commission = await db.salesAgentCommission.create({
        data: {
          agentId: agent.id,
          userMembershipId: membership.id,
          amount: 19.5,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "sales_agent",
        beneficiaryId: agent.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(19.5);

      const after = await db.salesAgentCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("manager: earned -> settled", async () => {
      const managerUser = await createUser("contracts-manager", "staff");

      const manager = await db.contractsManager.create({
        data: {
          userId: managerUser.id,
          name: "Settlement Manager",
          commissionType: "percentage_of_agents",
          commissionRate: 10,
          isActive: true,
        },
      });

      managerIds.push(manager.id);

      const commission = await db.managerCommission.create({
        data: {
          managerId: manager.id,
          amount: 7.75,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "manager",
        beneficiaryId: manager.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(7.75);

      const after = await db.managerCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("manager_partner: earned -> settled", async () => {
      const managerUser = await createUser("partner-manager", "staff");

      const manager = await db.contractsManager.create({
        data: {
          userId: managerUser.id,
          name: "Settlement Partner Manager",
          commissionType: "percentage_of_agents",
          commissionRate: 10,
          isActive: true,
        },
      });

      managerIds.push(manager.id);

      const commission = await db.managerPartnerCommission.create({
        data: {
          managerId: manager.id,
          amount: 8.8,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "manager_partner",
        beneficiaryId: manager.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(8.8);

      const after = await db.managerPartnerCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("trainer: earned -> settled", async () => {
      const trainer = await createUser("trainer", "trainer");

      const commission = await db.trainerCommission.create({
        data: {
          trainerUserId: trainer.id,
          amount: 16.4,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "trainer",
        beneficiaryId: trainer.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(16.4);

      const after = await db.trainerCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("marketing: earned -> settled", async () => {
      /* MARKETING_SETTLEMENT_TYPE_TEST */

      const marketingStaff =
        await createUser("marketing-closer", "staff");

      const customer =
        await createUser("marketing-customer", "member");

      const membership = await createMembershipFixture();

      /*
       * createMembershipFixture owns a different fixture customer.
       * MarketingConversion must match the membership's real user.
       */
      const membershipRow =
        await db.userMembership.findUniqueOrThrow({
          where: {
            id: membership.id,
          },
          select: {
            userId: true,
          },
        });

      const conversion =
        await db.marketingConversion.create({
          data: {
            customerId: membershipRow.userId,
            assignedStaffUserId: marketingStaff.id,
            status: "converted",
            activeKey: null,
            userMembershipId: membership.id,
            commissionTypeSnapshot: "percentage",
            commissionRateSnapshot: 10,
            commissionBaseSnapshot: 280,
            convertedAt: new Date(),
            createdByUserId: marketingStaff.id,
          },
        });

      const commission =
        await db.marketingCommission.create({
          data: {
            marketingConversionId: conversion.id,
            staffUserId: marketingStaff.id,
            userMembershipId: membership.id,
            amount: 28,
            status: "earned",
            commissionTypeSnapshot: "percentage",
            commissionRateSnapshot: 10,
            commissionBaseSnapshot: 280,
          },
        });

      const result = await settle({
        commissionType: "marketing",
        beneficiaryId: marketingStaff.id,
        commissionId: commission.id,
      });

      expect(
        Number(result.payout.totalAmount),
      ).toBe(28);

      expect(
        result.payout.beneficiaryType,
      ).toBe("marketing");

      expect(
        result.payout.beneficiaryId,
      ).toBe(marketingStaff.id);

      expect(
        result.payout.items[0].commissionType,
      ).toBe("marketing");

      expect(
        result.payout.items[0].commissionId,
      ).toBe(commission.id);

      const after =
        await db.marketingCommission.findUniqueOrThrow({
          where: {
            id: commission.id,
          },
        });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();

      /*
       * Settlement must not alter immutable conversion economics.
       */
      const conversionAfter =
        await db.marketingConversion.findUniqueOrThrow({
          where: {
            id: conversion.id,
          },
        });

      expect(conversionAfter.status).toBe("converted");
      expect(
        conversionAfter.commissionRateSnapshot,
      ).toBe(10);
      expect(
        conversionAfter.commissionBaseSnapshot,
      ).toBe(280);

      void customer;
    });

    it("nutrition: earned -> settled", async () => {
      const nutritionist = await createUser("nutritionist", "staff");

      const commission = await db.nutritionCommission.create({
        data: {
          nutritionistUserId: nutritionist.id,
          amount: 21.35,
          status: "earned",
        },
      });

      const result = await settle({
        commissionType: "nutrition",
        beneficiaryId: nutritionist.id,
        commissionId: commission.id,
      });

      expect(Number(result.payout.totalAmount)).toBe(21.35);

      const after = await db.nutritionCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });
  },
);
