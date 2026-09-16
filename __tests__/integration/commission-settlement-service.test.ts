import { afterEach, describe, expect, it } from "vitest";
import { db, asDbTransactionClient } from "@/lib/db";
import { settleCommissionsTx } from "@/lib/commissions/commission-settlement-service";

function assertTestDatabase() {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    throw new Error("REFUSING: DATABASE_URL missing");
  }

  const url = new URL(raw);

  if (
    process.env.APP_ENV !== "test" ||
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    decodeURIComponent(url.username) !== "fitzone_test_user" ||
    url.pathname !== "/fitzone_test"
  ) {
    throw new Error(
      "REFUSING: commission settlement integration requires fitzone_test",
    );
  }
}

assertTestDatabase();

const createdUserIds: string[] = [];
const createdPayoutIds: string[] = [];

async function createStaffCommission(amount = 12.34) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const user = await db.user.create({
    data: {
      email: `settlement-${stamp}@fitzone.test`,
      name: "Settlement Integration Staff",
      role: "staff",
    },
  });

  createdUserIds.push(user.id);

  const commission = await db.staffCommission.create({
    data: {
      staffUserId: user.id,
      amount,
      status: "earned",
    },
  });

  return { user, commission };
}

async function settleStaff(input: {
  beneficiaryId: string;
  commissionIds: string[];
  sourceType?: string;
  sourceId?: string;
}) {
  return db.$transaction(async (tx) =>
    settleCommissionsTx(asDbTransactionClient(tx), {
      commissionType: "staff",
      beneficiaryId: input.beneficiaryId,
      commissionIds: input.commissionIds,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      actorUserId: input.beneficiaryId,
      paymentMethod: "test",
    }),
  );
}

afterEach(async () => {
  if (createdPayoutIds.length) {
    await db.commissionPayout.deleteMany({
      where: {
        id: { in: createdPayoutIds.splice(0) },
      },
    });
  }

  if (createdUserIds.length) {
    const ids = createdUserIds.splice(0);

    await db.commissionPayout.deleteMany({
      where: {
        beneficiaryId: { in: ids },
      },
    });

    await db.staffCommission.deleteMany({
      where: {
        staffUserId: { in: ids },
      },
    });

    await db.user.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }
});

describe(
  "CommissionSettlementService — real fitzone_test integration",
  { timeout: 90_000 },
  () => {
    it("settles exact locked commission and records exact payout", async () => {
      const { user, commission } = await createStaffCommission(12.345);

      const result = await settleStaff({
        beneficiaryId: user.id,
        commissionIds: [commission.id],
      });

      createdPayoutIds.push(result.payout.id);

      expect(result.idempotent).toBe(false);
      expect(Number(result.payout.totalAmount)).toBe(12.35);
      expect(result.payout.items).toHaveLength(1);
      expect(Number(result.payout.items[0].amount)).toBe(12.35);
      expect(result.payout.items[0].commissionId).toBe(commission.id);

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settledAt).toBeTruthy();
    });

    it("rejects duplicate commission IDs before mutation", async () => {
      const { user, commission } = await createStaffCommission();

      await expect(
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id, commission.id],
        }),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_DUPLICATE_IDS");

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("earned");
    });

    it("rejects beneficiary mismatch and rolls back", async () => {
      const first = await createStaffCommission();
      const second = await createStaffCommission();

      await expect(
        settleStaff({
          beneficiaryId: second.user.id,
          commissionIds: [first.commission.id],
        }),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_BENEFICIARY_MISMATCH");

      expect(
        await db.commissionPayout.count({
          where: {
            beneficiaryId: second.user.id,
          },
        }),
      ).toBe(0);

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: first.commission.id },
      });

      expect(after.status).toBe("earned");
    });

    it("rejects missing commission atomically", async () => {
      const { user, commission } = await createStaffCommission();

      await expect(
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id, `missing-${Date.now()}`],
        }),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_COMMISSION_NOT_FOUND");

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("earned");

      expect(
        await db.commissionPayout.count({
          where: { beneficiaryId: user.id },
        }),
      ).toBe(0);
    });

    it("source retry returns the same payout", async () => {
      const { user, commission } = await createStaffCommission();

      const sourceId = `source-${Date.now()}`;

      const first = await settleStaff({
        beneficiaryId: user.id,
        commissionIds: [commission.id],
        sourceType: "integration_test",
        sourceId,
      });

      createdPayoutIds.push(first.payout.id);

      const second = await settleStaff({
        beneficiaryId: user.id,
        commissionIds: [commission.id],
        sourceType: "integration_test",
        sourceId,
      });

      expect(first.idempotent).toBe(false);
      expect(second.idempotent).toBe(true);
      expect(second.payout.id).toBe(first.payout.id);

      expect(
        await db.commissionPayout.count({
          where: {
            sourceType: "integration_test",
            sourceId,
          },
        }),
      ).toBe(1);
    });

    it("same source cannot represent different commissions", async () => {
      const first = await createStaffCommission();
      const second = await createStaffCommission();

      const sourceId = `conflict-${Date.now()}`;

      const settled = await settleStaff({
        beneficiaryId: first.user.id,
        commissionIds: [first.commission.id],
        sourceType: "integration_conflict",
        sourceId,
      });

      createdPayoutIds.push(settled.payout.id);

      await expect(
        settleStaff({
          beneficiaryId: second.user.id,
          commissionIds: [second.commission.id],
          sourceType: "integration_conflict",
          sourceId,
        }),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_SOURCE_CONFLICT");

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: second.commission.id },
      });

      expect(after.status).toBe("earned");
    });

    it("concurrent settlement of one commission is exact-once", async () => {
      const { user, commission } = await createStaffCommission(25);

      const results = await Promise.allSettled([
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id],
        }),
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id],
        }),
      ]);

      const fulfilled = results.filter(
        (result) => result.status === "fulfilled",
      );

      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const payouts = await db.commissionPayout.findMany({
        where: {
          beneficiaryId: user.id,
        },
      });

      expect(payouts).toHaveLength(1);

      createdPayoutIds.push(payouts[0].id);

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
    });

    it("concurrent retry with same source must converge on one payout", async () => {
      const { user, commission } = await createStaffCommission(30);

      const sourceType = "integration_concurrency";
      const sourceId = `same-source-${Date.now()}`;

      const results = await Promise.allSettled([
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id],
          sourceType,
          sourceId,
        }),
        settleStaff({
          beneficiaryId: user.id,
          commissionIds: [commission.id],
          sourceType,
          sourceId,
        }),
      ]);

      const rejected = results.filter((result) => result.status === "rejected");

      /*
       * Business requirement:
       * concurrent delivery of the SAME business command is idempotent,
       * not "one success + one database uniqueness error".
       */
      expect(rejected).toHaveLength(0);

      const fulfilled = results.filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          Awaited<ReturnType<typeof settleStaff>>
        > => result.status === "fulfilled",
      );

      expect(fulfilled).toHaveLength(2);

      const payoutIds = new Set(
        fulfilled.map((result) => result.value.payout.id),
      );

      expect(payoutIds.size).toBe(1);

      const payouts = await db.commissionPayout.findMany({
        where: {
          sourceType,
          sourceId,
        },
      });

      expect(payouts).toHaveLength(1);

      createdPayoutIds.push(payouts[0].id);
    });
  },
);

describe(
  "CommissionSettlementService — settlement type coverage",
  { timeout: 90_000 },
  () => {
    it("concurrent same source with different commissions rejects conflict", async () => {
      const first = await createStaffCommission(11);
      const second = await createStaffCommission(22);

      const sourceType = "integration_concurrent_conflict";
      const sourceId = `conflict-${Date.now()}`;

      const results = await Promise.allSettled([
        settleStaff({
          beneficiaryId: first.user.id,
          commissionIds: [first.commission.id],
          sourceType,
          sourceId,
        }),
        settleStaff({
          beneficiaryId: second.user.id,
          commissionIds: [second.commission.id],
          sourceType,
          sourceId,
        }),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const payouts = await db.commissionPayout.findMany({
        where: { sourceType, sourceId },
      });

      expect(payouts).toHaveLength(1);

      createdPayoutIds.push(payouts[0].id);

      const states = await db.staffCommission.findMany({
        where: {
          id: {
            in: [first.commission.id, second.commission.id],
          },
        },
        orderBy: { id: "asc" },
      });

      expect(states.filter((row) => row.status === "settled")).toHaveLength(1);

      expect(states.filter((row) => row.status === "earned")).toHaveLength(1);
    });

    it("failed source-backed settlement leaves no processing payout", async () => {
      const first = await createStaffCommission();

      const sourceType = "integration_rollback";
      const sourceId = `rollback-${Date.now()}`;

      await expect(
        settleStaff({
          beneficiaryId: first.user.id,
          commissionIds: [first.commission.id, `missing-${Date.now()}`],
          sourceType,
          sourceId,
        }),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_COMMISSION_NOT_FOUND");

      expect(
        await db.commissionPayout.count({
          where: {
            sourceType,
            sourceId,
          },
        }),
      ).toBe(0);

      expect(
        await db.commissionPayout.count({
          where: {
            status: "processing",
            sourceType,
            sourceId,
          },
        }),
      ).toBe(0);
    });

    it("partner transitions pending to withdrawn", async () => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const user = await db.user.create({
        data: {
          email: `partner-settle-${stamp}@fitzone.test`,
          name: "Partner Settlement Test",
          role: "partner",
        },
      });

      createdUserIds.push(user.id);

      const partner = await db.partner.create({
        data: {
          userId: user.id,
          name: "Partner Settlement Test",
          category: "other",
          commissionRate: 10,
          commissionType: "percentage",
          isActive: true,
        },
      });

      const customer = await db.user.create({
        data: {
          email: `customer-settle-${stamp}@fitzone.test`,
          name: "Customer",
          gender: "female",
        },
      });

      createdUserIds.push(customer.id);

      const membership = await db.membership.create({
        data: {
          name: `Settlement Plan ${stamp}`,
          nameEn: `Settlement Plan ${stamp}`,
          duration: 30,
          price: 100,
          sessionsCount: 0,
          walletBonus: 0,
          features: "[]",
        },
      });

      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 30 * 86400000);

      const userMembership = await db.userMembership.create({
        data: {
          userId: customer.id,
          membershipId: membership.id,
          status: "active",
          startDate,
          endDate,
          paymentAmount: 100,
          paymentMethod: "cash",
        },
      });

      const commission = await db.partnerCommission.create({
        data: {
          partnerId: partner.id,
          userMembershipId: userMembership.id,
          amount: 10,
          status: "pending",
        },
      });

      const result = await db.$transaction(async (tx) =>
        settleCommissionsTx(asDbTransactionClient(tx), {
          commissionType: "partner",
          beneficiaryId: partner.id,
          commissionIds: [commission.id],
          actorUserId: user.id,
        }),
      );

      createdPayoutIds.push(result.payout.id);

      const after = await db.partnerCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("withdrawn");
      expect(after.withdrawnAt).toBeTruthy();

      await db.partnerCommission.deleteMany({
        where: { id: commission.id },
      });

      await db.userMembership.deleteMany({
        where: { id: userMembership.id },
      });

      await db.membership.deleteMany({
        where: { id: membership.id },
      });

      await db.partner.deleteMany({
        where: { id: partner.id },
      });
    });
  },
);
