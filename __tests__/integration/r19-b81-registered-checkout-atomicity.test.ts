import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { reserveOrderInventoryOwnedFirst } from "@/lib/order-inventory-allocation-service";

// B81 tests the real MySQL transaction, conditional wallet/points claims,
// and production inventory reservation service. It does NOT call the HTTP route.
const DB_NAME = "fitzone_r19_b59_gate_20261116223306";
const DB_USER = "fitzone_b59_1917d4fa";
const TEST_TAG = `R19_B81_${randomUUID().replace(/-/g, "")}`;
let userId: string | undefined;
let productId: string | undefined;

async function atomicCheckout(input: {
  wallet: number;
  points: number;
  forcedFailure?: "wallet" | "points";
}) {
  if (!userId || !productId) throw new Error("B81_FIXTURE_UNAVAILABLE");
  return db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId, businessUnit: "store", total: 125,
        status: "pending", paymentMethod: "cod",
        recipientName: TEST_TAG,
        items: { create: [{ productId: productId!, quantity: 1, price: 125 }] },
      },
    });
    await reserveOrderInventoryOwnedFirst(tx, order.id);
    if (input.wallet > 0) {
      const claim = await tx.wallet.updateMany({
        where: { userId, balance: { gte: input.wallet } },
        data: { balance: { decrement: input.wallet } },
      });
      if (claim.count !== 1 || input.forcedFailure === "wallet") {
        throw new Error("B81_WALLET_FAILURE");
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, amount: input.wallet, type: "debit",
          source: "general", description: `B81 order ${order.id}` },
      });
    }
    if (input.points > 0) {
      const claim = await tx.rewardPoints.updateMany({
        where: { userId, points: { gte: input.points } },
        data: { points: { decrement: input.points } },
      });
      if (claim.count !== 1 || input.forcedFailure === "points") {
        throw new Error("B81_POINTS_FAILURE");
      }
      const row = await tx.rewardPoints.findUniqueOrThrow({ where: { userId } });
      await tx.rewardHistory.create({
        data: { rewardId: row.id, points: -input.points,
          reason: `B81 order ${order.id}` },
      });
    }
    return order.id;
  }, { timeout: 15000, maxWait: 10000 });
}

async function snapshot() {
  if (!userId || !productId) throw new Error("B81_FIXTURE_UNAVAILABLE");
  const [wallet, points, product, orders] = await Promise.all([
    db.wallet.findUniqueOrThrow({ where: { userId } }),
    db.rewardPoints.findUniqueOrThrow({ where: { userId } }),
    db.product.findUniqueOrThrow({ where: { id: productId } }),
    db.order.count({ where: { userId, recipientName: TEST_TAG } }),
  ]);
  return { balance: wallet.balance, points: points.points,
    stock: product.stock, reservedStock: product.reservedStock, orders };
}

describe.sequential("R19 B81 isolated registered checkout atomicity", () => {
  beforeAll(async () => {
    const uri = process.env.DATABASE_URL;
    if (!uri) throw new Error("B81_DATABASE_URL_MISSING");
    const url = new URL(uri);
    if (process.env.APP_ENV !== "test" ||
        process.env.FITZONE_R19_B59_ISOLATED_INTEGRATION !== "1" ||
        url.hostname !== "127.0.0.1" || url.port !== "3306" ||
        url.username !== DB_USER || url.pathname.slice(1) !== DB_NAME) {
      throw new Error("B81_UNSAFE_DATABASE_TARGET");
    }
    const identity = await db.$queryRaw<Array<{
      database_name: string; server_port: number; database_user: string;
    }>>`SELECT DATABASE() AS database_name, @@port AS server_port, USER() AS database_user`;
    if (identity.length !== 1 || identity[0].database_name !== DB_NAME ||
        Number(identity[0].server_port) !== 3306 ||
        !identity[0].database_user.startsWith(`${DB_USER}@`)) {
      throw new Error("B81_DATABASE_IDENTITY_FAILED");
    }
    // Every fixture is new and tagged. No existing user or wallet is modified.
    const user = await db.user.create({ data: {
      email: `${TEST_TAG.toLowerCase()}@example.invalid`,
      name: TEST_TAG,
    } });
    userId = user.id;
    await db.wallet.create({ data: { userId, balance: 5, referralBalance: 0 } });
    await db.rewardPoints.create({ data: { userId, points: 5 } });
    const product = await db.product.create({ data: {
      name: TEST_TAG, category: "R19_ISOLATED_TEST", price: 125,
      stock: 1, reservedStock: 0, trackInventory: true, isActive: false,
    } });
    productId = product.id;
  });

  afterAll(async () => {
    if (!userId) return;
    // Cleanup only this test's freshly-created records; fail visibly on error.
    const orders = await db.order.findMany({
      where: { userId, recipientName: TEST_TAG }, select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await db.$transaction(async (tx) => {
      if (ids.length) {
        await tx.orderInventoryAllocation.deleteMany({ where: { orderId: { in: ids } } });
        await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } });
        await tx.order.deleteMany({ where: { id: { in: ids } } });
      }
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      const points = await tx.rewardPoints.findUnique({ where: { userId } });
      if (wallet) await tx.walletTransaction.deleteMany({ where: { walletId: wallet.id } });
      if (points) await tx.rewardHistory.deleteMany({ where: { rewardId: points.id } });
      await tx.wallet.deleteMany({ where: { userId } });
      await tx.rewardPoints.deleteMany({ where: { userId } });
      if (productId) await tx.product.deleteMany({ where: { id: productId, name: TEST_TAG } });
      await tx.user.deleteMany({ where: { id: userId, name: TEST_TAG } });
    }, { timeout: 15000 });
  });

  it("rolls back the order and inventory when wallet claim fails", async () => {
    const before = await snapshot();
    await expect(atomicCheckout({ wallet: 6, points: 0 })).rejects.toThrow("B81_WALLET_FAILURE");
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back wallet, order, and inventory when points claim fails", async () => {
    const before = await snapshot();
    await expect(atomicCheckout({ wallet: 1, points: 6 })).rejects.toThrow("B81_POINTS_FAILURE");
    expect(await snapshot()).toEqual(before);
  });

  it("allows exactly one concurrent checkout for the last owned unit", async () => {
    const results = await Promise.allSettled([
      atomicCheckout({ wallet: 1, points: 1 }),
      atomicCheckout({ wallet: 1, points: 1 }),
    ]);
    const successful = results.filter((r) => r.status === "fulfilled");
    expect(successful).toHaveLength(1);
    const after = await snapshot();
    expect(after.orders).toBe(1);
    expect(after.balance).toBe(4);
    expect(after.points).toBe(4);
    expect(after.stock).toBe(1);
    expect(after.reservedStock).toBe(1);
  });
});
