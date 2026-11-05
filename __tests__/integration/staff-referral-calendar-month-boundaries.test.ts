import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

let db: PrismaClient;
let asDbTransactionClient:
  typeof import("@/lib/db").asDbTransactionClient;

let resolveStaffReferralPolicyTx:
  typeof import("@/lib/commissions/staff-referral-policy").resolveStaffReferralPolicyTx;

let positionId = "";
let employeeUserId = "";
let customerUserId = "";
let membershipPlanId = "";
let previousMembershipId = "";

function utc(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

describe("staff referral calendar-month boundaries", () => {
  beforeAll(async () => {
    process.env.ALLOW_TEST_DB_MUTATIONS = "true";

    const dbModule = await import("@/lib/db");
    db = dbModule.db as PrismaClient;
    asDbTransactionClient = dbModule.asDbTransactionClient;

    const policyModule = await import(
      "@/lib/commissions/staff-referral-policy"
    );

    resolveStaffReferralPolicyTx =
      policyModule.resolveStaffReferralPolicyTx;

    const row = await db.$queryRawUnsafe<
      Array<{ db: string }>
    >("SELECT DATABASE() AS db");

    if (row[0]?.db !== "fitzone_test") {
      throw new Error("TEST_DB_GUARD_FAIL");
    }

    const suffix = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const position = await db.position.create({
      data: {
        code: `REFBOUND-${suffix}`,
        name: `Referral Boundary ${suffix}`,
        nameEn: `Referral Boundary ${suffix}`,
        isActive: true,
        sortOrder: 0,
      },
    });

    positionId = position.id;

    const employeeUser = await db.user.create({
      data: {
        email: `ref-bound-employee-${suffix}@example.test`,
        name: `Referral Employee ${suffix}`,
      },
    });

    employeeUserId = employeeUser.id;

    await db.employeeProfile.create({
      data: {
        userId: employeeUserId,
        employeeCode: `EB-${suffix}`,
        name: `Referral Employee ${suffix}`,
        employmentStatus: "active",
        hireDate: utc("2026-01-01"),
        positionId,
      },
    });

    const customer = await db.user.create({
      data: {
        email: `ref-bound-customer-${suffix}@example.test`,
        name: `Referral Customer ${suffix}`,
      },
    });

    customerUserId = customer.id;

    const membershipPlan = await db.membership.create({
      data: {
        name: `Referral Boundary Plan ${suffix}`,
        nameEn: `Referral Boundary Plan ${suffix}`,
        kind: "subscription",
        price: 1000,
        duration: 30,
        sessionsCount: 0,
        walletBonus: 0,
        features: "[]",
        isActive: true,
      },
    });

    membershipPlanId = membershipPlan.id;

    await db.referralCommissionPolicy.create({
      data: {
        effectiveFrom: utc("2026-01-01"),

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
  });

  afterAll(async () => {
    if (!db) return;

    if (customerUserId) {
      await db.userMembership.deleteMany({
        where: { userId: customerUserId },
      });
    }

    await db.referralCommissionPolicyRate.deleteMany({
      where: { positionId },
    });

    await db.referralCommissionPolicy.deleteMany({
      where: {
        rates: {
          none: {},
        },
      },
    });

    if (employeeUserId) {
      await db.employeeProfile.deleteMany({
        where: { userId: employeeUserId },
      });

      await db.user.deleteMany({
        where: { id: employeeUserId },
      });
    }

    if (customerUserId) {
      await db.user.deleteMany({
        where: { id: customerUserId },
      });
    }

    if (membershipPlanId) {
      await db.membership.deleteMany({
        where: { id: membershipPlanId },
      });
    }

    if (positionId) {
      await db.position.deleteMany({
        where: { id: positionId },
      });
    }
  });

  async function setPreviousMembershipEndDate(
    endDate: string,
  ) {
    await db.userMembership.deleteMany({
      where: { userId: customerUserId },
    });

    const membership = await db.userMembership.create({
      data: {
        userId: customerUserId,
        membershipId: membershipPlanId,
        startDate: utc("2025-01-01"),
        endDate: utc(endDate),
        status: "active",
      },
    });

    previousMembershipId = membership.id;
  }

  async function resolve(asOfDate: string) {
    return db.$transaction((tx) =>
      resolveStaffReferralPolicyTx(
        asDbTransactionClient(tx),
        {
          customerUserId,
          staffUserId: employeeUserId,
          asOfDate: utc(asOfDate),
        },
      ),
    );
  }

  it("14 days => under minimum => 0%", async () => {
    await setPreviousMembershipEndDate("2026-04-01");

    const result = await resolve("2026-04-15");

    expect(result.gapDays).toBe(14);
    expect(result.classification).toBe(
      "short_term_under_minimum",
    );
    expect(result.rateBps).toBe(0);
  });

  it("15 days => short-term => 2.5%", async () => {
    await setPreviousMembershipEndDate("2026-04-01");

    const result = await resolve("2026-04-16");

    expect(result.gapDays).toBe(15);
    expect(result.classification).toBe("short_term");
    expect(result.rateBps).toBe(250);
  });

  it("exactly 3 calendar months => short-term", async () => {
    await setPreviousMembershipEndDate("2026-01-10");

    const result = await resolve("2026-04-10");

    expect(result.classification).toBe("short_term");
    expect(result.rateBps).toBe(250);
  });

  it("day after 3 calendar months => long-term", async () => {
    await setPreviousMembershipEndDate("2026-01-10");

    const result = await resolve("2026-04-11");

    expect(result.classification).toBe("long_term");
    expect(result.rateBps).toBe(600);
  });

  it("31 January + 3 calendar months clamps to 30 April", async () => {
    await setPreviousMembershipEndDate("2026-01-31");

    const result = await resolve("2026-04-30");

    expect(result.classification).toBe("short_term");
    expect(result.rateBps).toBe(250);
  });

  it("1 May after 31 January expiry => long-term", async () => {
    await setPreviousMembershipEndDate("2026-01-31");

    const result = await resolve("2026-05-01");

    expect(result.classification).toBe("long_term");
    expect(result.rateBps).toBe(600);
  });
});
