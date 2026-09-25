import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

import { accrueMembershipCommissionsTx } from "@/lib/commissions/membership-commission-accrual";
import {
  serializeMembershipCommissionSnapshot,
  type MembershipCommissionSnapshotV1,
} from "@/lib/commissions/membership-commission-contract";

const db = new PrismaClient();

let memberUserId: string;
let agentOwnerUserId: string;
let managerOwnerUserId: string;
let membershipPlanId: string;
let salesAgentId: string;
let managerId: string;

let staffUserId: string;
let trainerUserId: string;
let nutritionUserId: string;

let staffReferralLinkId: string;
let trainerReferralLinkId: string;
let nutritionReferralLinkId: string;

const createdMembershipIds: string[] = [];

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const referralCode = `FZ-COM-${suffix}`.toUpperCase();

function testDbGuard() {
  const url = new URL(process.env.DATABASE_URL ?? "");

  if (
    process.env.APP_ENV !== "test" ||
    url.pathname.replace(/^\//, "") !== "fitzone_test"
  ) {
    throw new Error(
      `REFUSING: commission integration tests require fitzone_test, got ${url.pathname}`,
    );
  }
}

function snapshot(): MembershipCommissionSnapshotV1 {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),

    salesAgent: {
      agentId: salesAgentId,
      referralCode,

      // Intentionally DIFFERENT from commission base.
      trackedSpendAmount: 650,

      terms: {
        type: "percentage",
        rate: 10,
        baseAmount: 800,
      },

      manager: {
        managerId,
        type: "percentage_of_agents",
        rate: 20,
        revenueBase: 650,
      },
    },
  };
}

async function createMembership(
  commissionSnapshot: string | null,
) {
  const row = await db.userMembership.create({
    data: {
      userId: memberUserId,
      membershipId: membershipPlanId,
      startDate: new Date("2026-08-18T00:00:00.000Z"),
      endDate: new Date("2026-09-18T00:00:00.000Z"),
      status: "active",
      paymentAmount: 650,
      paymentMethod: "wallet",

      // Frozen membership attribution must match the commission snapshot.
      salesAgentId,

      commissionSnapshot,
    },
  });

  createdMembershipIds.push(row.id);
  return row;
}

beforeAll(async () => {
  testDbGuard();

  const member = await db.user.create({
    data: {
      email: `commission-member-${suffix}@example.test`,
      emailVerified: new Date(),
      pendingAgentRef: referralCode,
    },
  });
  memberUserId = member.id;

  const agentOwner = await db.user.create({
    data: {
      email: `commission-agent-${suffix}@example.test`,
      emailVerified: new Date(),

      // Live values are intentionally different from snapshot values.
      commissionRate: 99,
      commissionType: "percentage",
    },
  });
  agentOwnerUserId = agentOwner.id;

  const managerOwner = await db.user.create({
    data: {
      email: `commission-manager-${suffix}@example.test`,
      emailVerified: new Date(),
    },
  });
  managerOwnerUserId = managerOwner.id;

  const manager = await db.contractsManager.create({
    data: {
      userId: managerOwnerUserId,
      name: `Commission Test Manager ${suffix}`,

      // Also intentionally different from frozen snapshot.
      commissionType: "fixed",
      commissionRate: 999,
      isActive: true,
    },
  });
  managerId = manager.id;

  const agent = await db.salesAgent.create({
    data: {
      userId: agentOwnerUserId,
      name: `Commission Test Agent ${suffix}`,
      referralCode,

      // Intentionally different live configuration.
      commissionRate: 99,
      commissionType: "percentage",

      managerId,
      isActive: true,
    },
  });
  salesAgentId = agent.id;

  const staffUser = await db.user.create({
    data: {
      email: `commission-staff-${suffix}@example.test`,
      emailVerified: new Date(),
      role: "staff",
      commissionRate: 10,
      commissionType: "percentage",
    },
  });
  staffUserId = staffUser.id;

  const trainerUser = await db.user.create({
    data: {
      email: `commission-trainer-${suffix}@example.test`,
      emailVerified: new Date(),
      role: "trainer",
      commissionRate: 20,
      commissionType: "percentage",
    },
  });
  trainerUserId = trainerUser.id;

  const nutritionUser = await db.user.create({
    data: {
      email: `commission-nutrition-${suffix}@example.test`,
      emailVerified: new Date(),
      role: "staff",
    },
  });
  nutritionUserId = nutritionUser.id;

  await db.nutritionistProfile.create({
    data: {
      userId: nutritionUserId,
      name: `Commission Nutrition ${suffix}`,
      commissionRate: 30,
      commissionType: "percentage",
      isActive: true,
    },
  });

  const staffLink = await db.staffReferralLink.create({
    data: {
      userId: staffUserId,
      token: `STAFF-${suffix}`.toUpperCase(),
      isActive: true,
    },
  });
  staffReferralLinkId = staffLink.id;

  const trainerLink = await db.trainerReferralLink.create({
    data: {
      userId: trainerUserId,
      token: `TRAINER-${suffix}`.toUpperCase(),
      isActive: true,
    },
  });
  trainerReferralLinkId = trainerLink.id;

  const nutritionLink = await db.nutritionReferralLink.create({
    data: {
      userId: nutritionUserId,
      token: `NUTRITION-${suffix}`.toUpperCase(),
      isActive: true,
    },
  });
  nutritionReferralLinkId = nutritionLink.id;

  const plan = await db.membership.create({
    data: {
      name: `Commission Test Plan ${suffix}`,
      kind: "subscription",
      price: 9999,

      // Live plan value intentionally unrelated to frozen commission economics.
      priceAfter: 7777,

      duration: 30,
      features: "[]",
      isActive: true,
    },
  });
  membershipPlanId = plan.id;

  // This mirrors the existing subscribe flow for an agent referral that
  // has been attributed but not yet economically converted.
  await db.salesAgentReferral.create({
    data: {
      agentId: salesAgentId,
      userId: memberUserId,
      convertedAt: null,
      totalSpent: 0,
    },
  });
});

afterAll(async () => {
  // Delete in FK-safe order.
  if (createdMembershipIds.length) {
    await db.userMembership.deleteMany({
      where: { id: { in: createdMembershipIds } },
    });
  }

  if (memberUserId) {
    await db.salesAgentReferral.deleteMany({
      where: { userId: memberUserId },
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

  if (staffReferralLinkId) {
    await db.staffReferralLink.deleteMany({
      where: { id: staffReferralLinkId },
    });
  }

  if (trainerReferralLinkId) {
    await db.trainerReferralLink.deleteMany({
      where: { id: trainerReferralLinkId },
    });
  }

  if (nutritionReferralLinkId) {
    await db.nutritionReferralLink.deleteMany({
      where: { id: nutritionReferralLinkId },
    });
  }

  if (nutritionUserId) {
    await db.nutritionistProfile.deleteMany({
      where: { userId: nutritionUserId },
    });
  }

  const userIds = [
    memberUserId,
    agentOwnerUserId,
    managerOwnerUserId,
    staffUserId,
    trainerUserId,
    nutritionUserId,
  ].filter(Boolean);

  if (userIds.length) {
    await db.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  await db.$disconnect();
});

describe("membership commission accrual service", () => {
  it("uses frozen economics, creates manager commission, consumes matching ref, and is exact-once", async () => {
    const membership = await createMembership(
      serializeMembershipCommissionSnapshot(snapshot()),
    );

    const first = await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    expect(first.skipped).toBe(false);
    expect(first.alreadyCompleted).toBe(false);

    const commission = await db.salesAgentCommission.findUnique({
      where: { userMembershipId: membership.id },
    });

    // Frozen 10% of 800 = 80.
    // Must NOT use live 99% or live Membership price.
    expect(commission?.amount).toBe(80);

    const managerCommission = await db.managerCommission.findUnique({
      where: { agentCommissionId: commission!.id },
    });

    // Frozen manager terms: 20% of actual frozen agent commission (80).
    expect(managerCommission?.amount).toBe(16);

    const referral = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
    });

    expect(referral?.convertedAt).not.toBeNull();

    // Historical tracked spend = paymentAmount semantics,
    // NOT commission base 800.
    expect(referral?.totalSpent).toBe(650);

    const userAfter = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    expect(userAfter?.pendingAgentRef).toBeNull();

    const marker = await db.userMembership.findUnique({
      where: { id: membership.id },
      select: { commissionAccruedAt: true },
    });

    expect(marker?.commissionAccruedAt).not.toBeNull();

    // Retry the exact same business action.
    const second = await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    expect(second.alreadyCompleted).toBe(true);

    expect(
      await db.salesAgentCommission.count({
        where: { userMembershipId: membership.id },
      }),
    ).toBe(1);

    expect(
      await db.managerCommission.count({
        where: { agentCommissionId: commission!.id },
      }),
    ).toBe(1);

    const referralAfterRetry = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
    });

    // Must not increment twice.
    expect(referralAfterRetry?.totalSpent).toBe(650);
  });

  it("preserves a newer pending referral while accruing the frozen older attribution", async () => {
    const newerReferral = `NEWER-${suffix}`.toUpperCase();

    await db.user.update({
      where: { id: memberUserId },
      data: { pendingAgentRef: newerReferral },
    });

    const membership = await createMembership(
      serializeMembershipCommissionSnapshot(snapshot()),
    );

    await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    const user = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    expect(user?.pendingAgentRef).toBe(newerReferral);

    const referral = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
    });

    // Previous 650 + this membership's frozen tracked spend 650.
    expect(referral?.totalSpent).toBe(1300);
  });

  it("rolls back commission, manager commission, referral mutation, ref consumption, and marker atomically", async () => {
    // Restore matching referral so the service would normally consume it.
    await db.user.update({
      where: { id: memberUserId },
      data: { pendingAgentRef: referralCode },
    });

    const membership = await createMembership(
      serializeMembershipCommissionSnapshot(snapshot()),
    );

    const referralBefore = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: { totalSpent: true },
    });

    await expect(
      db.$transaction(async (tx) => {
        await accrueMembershipCommissionsTx(tx, membership.id);
        throw new Error("FORCED_ROLLBACK_AFTER_ACCRUAL");
      }),
    ).rejects.toThrow("FORCED_ROLLBACK_AFTER_ACCRUAL");

    expect(
      await db.salesAgentCommission.findUnique({
        where: { userMembershipId: membership.id },
      }),
    ).toBeNull();

    const marker = await db.userMembership.findUnique({
      where: { id: membership.id },
      select: { commissionAccruedAt: true },
    });

    expect(marker?.commissionAccruedAt).toBeNull();

    const user = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    expect(user?.pendingAgentRef).toBe(referralCode);

    const referralAfter = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: { totalSpent: true },
    });

    expect(referralAfter?.totalSpent).toBe(referralBefore?.totalSpent);
  });

  it("serializes concurrent accrual attempts and applies side effects exactly once", async () => {
    await db.user.update({
      where: { id: memberUserId },
      data: { pendingAgentRef: referralCode },
    });

    const membership = await createMembership(
      serializeMembershipCommissionSnapshot(snapshot()),
    );

    const referralBefore = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: { totalSpent: true },
    });

    const [a, b] = await Promise.all([
      db.$transaction(
        (tx) => accrueMembershipCommissionsTx(tx, membership.id),
        { timeout: 10000 },
      ),
      db.$transaction(
        (tx) => accrueMembershipCommissionsTx(tx, membership.id),
        { timeout: 10000 },
      ),
    ]);

    expect([a.alreadyCompleted, b.alreadyCompleted].sort()).toEqual([
      false,
      true,
    ]);

    const commission = await db.salesAgentCommission.findUnique({
      where: { userMembershipId: membership.id },
    });

    expect(commission).not.toBeNull();
    expect(commission?.amount).toBe(80);

    expect(
      await db.salesAgentCommission.count({
        where: { userMembershipId: membership.id },
      }),
    ).toBe(1);

    expect(
      await db.managerCommission.count({
        where: { agentCommissionId: commission!.id },
      }),
    ).toBe(1);

    const referralAfter = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: { totalSpent: true },
    });

    expect(referralAfter?.totalSpent).toBe(
      (referralBefore?.totalSpent ?? 0) + 650,
    );

    const memberAfter = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    expect(memberAfter?.pendingAgentRef).toBeNull();

    const marker = await db.userMembership.findUnique({
      where: { id: membership.id },
      select: { commissionAccruedAt: true },
    });

    expect(marker?.commissionAccruedAt).not.toBeNull();
  });

  it("rejects snapshot attribution mismatch without any mutation", async () => {
    const badSnapshot = snapshot();

    badSnapshot.salesAgent = {
      ...badSnapshot.salesAgent!,
      agentId: "different-agent-id",
    };

    const membership = await createMembership(
      serializeMembershipCommissionSnapshot(badSnapshot),
    );

    const referralBefore = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: {
        totalSpent: true,
        convertedAt: true,
      },
    });

    const userBefore = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    await expect(
      db.$transaction((tx) =>
        accrueMembershipCommissionsTx(tx, membership.id),
      ),
    ).rejects.toThrow(
      "commissionSnapshot sales agent does not match UserMembership",
    );

    expect(
      await db.salesAgentCommission.findUnique({
        where: { userMembershipId: membership.id },
      }),
    ).toBeNull();

    const memberAfter = await db.userMembership.findUnique({
      where: { id: membership.id },
      select: { commissionAccruedAt: true },
    });

    expect(memberAfter?.commissionAccruedAt).toBeNull();

    const referralAfter = await db.salesAgentReferral.findUnique({
      where: { userId: memberUserId },
      select: {
        totalSpent: true,
        convertedAt: true,
      },
    });

    expect(referralAfter?.totalSpent).toBe(referralBefore?.totalSpent);
    expect(referralAfter?.convertedAt?.getTime() ?? null).toBe(
      referralBefore?.convertedAt?.getTime() ?? null,
    );

    const userAfter = await db.user.findUnique({
      where: { id: memberUserId },
      select: { pendingAgentRef: true },
    });

    expect(userAfter?.pendingAgentRef).toBe(userBefore?.pendingAgentRef);
  });

  it("increments staff/trainer/nutrition subscription counters exactly once and rolls them back atomically", async () => {
    const staffToken = `STAFF-${suffix}`.toUpperCase();
    const trainerToken = `TRAINER-${suffix}`.toUpperCase();
    const nutritionToken = `NUTRITION-${suffix}`.toUpperCase();

    await db.user.update({
      where: { id: memberUserId },
      data: {
        pendingStaffRef: staffToken,
        pendingTrainerRef: trainerToken,
        pendingNutritionRef: nutritionToken,
      },
    });

    const referralSnapshot: MembershipCommissionSnapshotV1 = {
      version: 1,
      capturedAt: new Date().toISOString(),

      staff: {
        staffUserId,
        referralLinkId: staffReferralLinkId,
        referralToken: staffToken,
        terms: {
          type: "percentage",
          rate: 10,
          baseAmount: 650,
        },
      },

      trainer: {
        trainerUserId,
        referralLinkId: trainerReferralLinkId,
        referralToken: trainerToken,
        terms: {
          type: "percentage",
          rate: 20,
          baseAmount: 650,
        },
      },

      nutrition: {
        nutritionistUserId: nutritionUserId,
        referralLinkId: nutritionReferralLinkId,
        referralToken: nutritionToken,
        terms: {
          type: "percentage",
          rate: 30,
          baseAmount: 650,
        },
      },
    };

    const membership = await db.userMembership.create({
      data: {
        userId: memberUserId,
        membershipId: membershipPlanId,
        startDate: new Date("2026-08-18T00:00:00.000Z"),
        endDate: new Date("2026-09-18T00:00:00.000Z"),
        status: "active",
        paymentAmount: 650,
        paymentMethod: "wallet",

        staffReferralLinkId,
        trainerReferralLinkId,
        nutritionReferralLinkId,

        commissionSnapshot:
          serializeMembershipCommissionSnapshot(referralSnapshot),
      },
    });

    createdMembershipIds.push(membership.id);

    const before = await Promise.all([
      db.staffReferralLink.findUnique({
        where: { id: staffReferralLinkId },
        select: { clickCount: true },
      }),
      db.trainerReferralLink.findUnique({
        where: { id: trainerReferralLinkId },
        select: { clickCount: true },
      }),
      db.nutritionReferralLink.findUnique({
        where: { id: nutritionReferralLinkId },
        select: { clickCount: true },
      }),
    ]);

    await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    const afterFirst = await Promise.all([
      db.staffReferralLink.findUnique({
        where: { id: staffReferralLinkId },
        select: { clickCount: true },
      }),
      db.trainerReferralLink.findUnique({
        where: { id: trainerReferralLinkId },
        select: { clickCount: true },
      }),
      db.nutritionReferralLink.findUnique({
        where: { id: nutritionReferralLinkId },
        select: { clickCount: true },
      }),
    ]);

    expect(afterFirst[0]!.clickCount).toBe(before[0]!.clickCount + 1);
    expect(afterFirst[1]!.clickCount).toBe(before[1]!.clickCount + 1);
    expect(afterFirst[2]!.clickCount).toBe(before[2]!.clickCount + 1);

    expect(
      await db.staffCommission.count({
        where: { userMembershipId: membership.id },
      }),
    ).toBe(1);

    expect(
      await db.trainerCommission.count({
        where: { userMembershipId: membership.id },
      }),
    ).toBe(1);

    expect(
      await db.nutritionCommission.count({
        where: { userMembershipId: membership.id },
      }),
    ).toBe(1);

    // Retry must not increment legacy subscription counters again.
    const retry = await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    expect(retry.alreadyCompleted).toBe(true);

    const afterRetry = await Promise.all([
      db.staffReferralLink.findUnique({
        where: { id: staffReferralLinkId },
        select: { clickCount: true },
      }),
      db.trainerReferralLink.findUnique({
        where: { id: trainerReferralLinkId },
        select: { clickCount: true },
      }),
      db.nutritionReferralLink.findUnique({
        where: { id: nutritionReferralLinkId },
        select: { clickCount: true },
      }),
    ]);

    expect(afterRetry).toEqual(afterFirst);

    // A second membership is used to prove the counters are also transactional.
    await db.user.update({
      where: { id: memberUserId },
      data: {
        pendingStaffRef: staffToken,
        pendingTrainerRef: trainerToken,
        pendingNutritionRef: nutritionToken,
      },
    });

    const rollbackMembership = await db.userMembership.create({
      data: {
        userId: memberUserId,
        membershipId: membershipPlanId,
        startDate: new Date("2026-08-18T00:00:00.000Z"),
        endDate: new Date("2026-09-18T00:00:00.000Z"),
        status: "active",
        paymentAmount: 650,
        paymentMethod: "wallet",

        staffReferralLinkId,
        trainerReferralLinkId,
        nutritionReferralLinkId,

        commissionSnapshot:
          serializeMembershipCommissionSnapshot(referralSnapshot),
      },
    });

    createdMembershipIds.push(rollbackMembership.id);

    await expect(
      db.$transaction(async (tx) => {
        await accrueMembershipCommissionsTx(tx, rollbackMembership.id);
        throw new Error("FORCED_REFERRAL_COUNTER_ROLLBACK");
      }),
    ).rejects.toThrow("FORCED_REFERRAL_COUNTER_ROLLBACK");

    const afterRollback = await Promise.all([
      db.staffReferralLink.findUnique({
        where: { id: staffReferralLinkId },
        select: { clickCount: true },
      }),
      db.trainerReferralLink.findUnique({
        where: { id: trainerReferralLinkId },
        select: { clickCount: true },
      }),
      db.nutritionReferralLink.findUnique({
        where: { id: nutritionReferralLinkId },
        select: { clickCount: true },
      }),
    ]);

    expect(afterRollback).toEqual(afterFirst);

    expect(
      await db.staffCommission.findUnique({
        where: { userMembershipId: rollbackMembership.id },
      }),
    ).toBeNull();

    expect(
      await db.trainerCommission.findUnique({
        where: { userMembershipId: rollbackMembership.id },
      }),
    ).toBeNull();

    expect(
      await db.nutritionCommission.findUnique({
        where: { userMembershipId: rollbackMembership.id },
      }),
    ).toBeNull();

    const rollbackMarker = await db.userMembership.findUnique({
      where: { id: rollbackMembership.id },
      select: { commissionAccruedAt: true },
    });

    expect(rollbackMarker?.commissionAccruedAt).toBeNull();
  });

  it("leaves pre-cutover legacy membership without snapshot untouched", async () => {
    const membership = await createMembership(null);

    const result = await db.$transaction((tx) =>
      accrueMembershipCommissionsTx(tx, membership.id),
    );

    expect(result).toMatchObject({
      alreadyCompleted: false,
      skipped: true,
      reason: "missing_snapshot",
    });

    expect(
      await db.salesAgentCommission.findUnique({
        where: { userMembershipId: membership.id },
      }),
    ).toBeNull();

    const row = await db.userMembership.findUnique({
      where: { id: membership.id },
      select: { commissionAccruedAt: true },
    });

    expect(row?.commissionAccruedAt).toBeNull();
  });
});
