import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

let dbA: PrismaClient;
let dbB: PrismaClient;

let userId: string | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  dbA = new PrismaClient();
  dbB = new PrismaClient();

  const current = await dbA.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  if (
    process.env.APP_ENV !== "test" ||
    current[0]?.db !== "fitzone_test"
  ) {
    throw new Error("REFUSING_NON_TEST_DB");
  }
});

afterAll(async () => {
  if (userId) {
    await dbA.staffCommission.deleteMany({
      where: {
        staffUserId: userId,
      },
    });

    await dbA.user.deleteMany({
      where: {
        id: userId,
      },
    });
  }

  await dbA?.$disconnect();
  await dbB?.$disconnect();
});

describe(
  "C16 StaffCommission month-range serialization",
  { timeout: 30_000 },
  () => {
    it("blocks a qualifying commission insert until the payroll range lock is released", async () => {
      const stamp =
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const user = await dbA.user.create({
        data: {
          email: `c16-range-${stamp}@fitzone.test`,
          name: "C16 Range Lock Staff",
          role: "staff",
        },
      });

      userId = user.id;

      /*
       * Seed one open row so the exact payroll month/index range exists.
       */
      await dbA.staffCommission.create({
        data: {
          staffUserId: user.id,
          amount: 10,
          status: "earned",
          earnedAt: new Date("2054-06-05T10:00:00.000Z"),
        },
      });

      const monthStart = new Date("2054-05-31T21:00:00.000Z");
      const monthEnd = new Date("2054-06-30T21:00:00.000Z");

      let releaseRangeLock!: () => void;

      const releasePromise = new Promise<void>((resolve) => {
        releaseRangeLock = resolve;
      });

      let rangeLockAcquired!: () => void;

      const rangeLockAcquiredPromise = new Promise<void>((resolve) => {
        rangeLockAcquired = resolve;
      });

      const payrollTx = dbA.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{ id: string }>
          >`
            SELECT id
            FROM StaffCommission
            WHERE staffUserId = ${user.id}
              AND status = 'earned'
              AND settlementOwnerType IS NULL
              AND settlementOwnerId IS NULL
              AND earnedAt >= ${monthStart}
              AND earnedAt < ${monthEnd}
            ORDER BY earnedAt, id
            FOR UPDATE
          `;

          expect(rows.length).toBeGreaterThan(0);

          rangeLockAcquired();

          await releasePromise;
        },
        {
          timeout: 10_000,
        },
      );

      await rangeLockAcquiredPromise;

      let insertResolved = false;

      const competingInsert = dbB.staffCommission
        .create({
          data: {
            staffUserId: user.id,
            amount: 25,
            status: "earned",
            earnedAt: new Date("2054-06-20T10:00:00.000Z"),
          },
        })
        .then((row) => {
          insertResolved = true;
          return row;
        });

      /*
       * If the payroll range lock is effective, the competing qualifying
       * insert must still be waiting here.
       */
      await sleep(300);

      expect(insertResolved).toBe(false);

      releaseRangeLock();

      await payrollTx;

      const inserted = await competingInsert;

      expect(insertResolved).toBe(true);
      expect(inserted.status).toBe("earned");
      expect(inserted.settlementOwnerType).toBeNull();
      expect(inserted.settlementOwnerId).toBeNull();

      const rows = await dbA.staffCommission.findMany({
        where: {
          staffUserId: user.id,
          status: "earned",
          earnedAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
      });

      expect(rows).toHaveLength(2);
    });
  },
);
