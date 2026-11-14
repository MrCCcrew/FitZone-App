import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

let dbA: PrismaClient;
let dbB: PrismaClient;

let userId: string | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function r15zAllowedHrDatabase(dbName: string | undefined | null): boolean {
  const raw = process.env.DATABASE_URL;
  if (!raw) return false;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }

  if (
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    u.protocol !== "mysql:" ||
    u.hostname !== "127.0.0.1"
  ) return false;

  const r13 =
    process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1";

  if (r13) {
    return (
      u.port === "3306" &&
      u.pathname === "/fitzone_final_release_r13_test" &&
      decodeURIComponent(u.username) === "fitzone_r13_user" &&
      dbName === "fitzone_final_release_r13_test"
    );
  }

  return (
    u.pathname === "/fitzone_test" &&
    decodeURIComponent(u.username) === "fitzone_test_user" &&
    dbName === "fitzone_test"
  );
}

beforeAll(async () => {
  dbA = new PrismaClient();
  dbB = new PrismaClient();

  const current = await dbA.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  if (
    process.env.APP_ENV !== "test" ||
    !r15zAllowedHrDatabase(current[0]?.db)
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
