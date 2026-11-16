import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const PHONE = "+201000000000";

vi.mock("@/lib/store-guest-verify", () => ({
  normalizeGuestPhone: (value: string) => value === PHONE ? PHONE : null,
  readGuestPhoneGrant: (token: string | null | undefined) =>
    token ? { nonce: token, phone: PHONE } : null,
}));

import { db } from "@/lib/db";
import { claimGuestCheckoutProof } from "@/lib/store-guest-proof-claim";
import { reserveOrderInventoryOwnedFirst } from
  "@/lib/order-inventory-allocation-service";

describe("R19 isolated guest checkout inventory rollback", () => {
  beforeAll(async () => {
    const rows = await db.$queryRaw<
      Array<{ database_name: string; server_port: number }>
    >`
      SELECT DATABASE() AS database_name, @@port AS server_port
    `;

    if (
      rows.length !== 1 ||
      rows[0].database_name !== "fitzone_r19_measurements_test" ||
      Number(rows[0].server_port) !== 3306
    ) {
      throw new Error("R19_ISOLATED_DATABASE_IDENTITY_FAILED");
    }
  });

  it("rolls back OTP, order and stock on failure; allows one successful claim", async () => {
    const tag = randomUUID().replaceAll("-", "");
    const nonce = `r19-${tag}`;
    const name = `R19_ONLY_${tag}`;
    const hash = createHash("sha256").update(nonce).digest("hex");

    let productId: string | null = null;
    let proofId: string | null = null;
    let committedOrderId: string | null = null;

    try {
      const product = await db.product.create({
        data: {
          name,
          category: "R19_ISOLATED_TEST",
          price: 125,
          stock: 1,
          reservedStock: 0,
          trackInventory: true,
          isActive: false,
        },
      });
      productId = product.id;

      const proof = await db.guestCheckoutProof.create({
        data: {
          nonceHash: hash,
          phone: PHONE,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      proofId = proof.id;

      async function attempt(quantity: number) {
        return db.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              userId: null,
              businessUnit: "store",
              total: 125 * quantity,
              status: "pending",
              paymentMethod: "cod",
              recipientName: name,
              recipientPhone: PHONE,
              items: {
                create: [{
                  productId: product.id,
                  quantity,
                  price: 125,
                }],
              },
            },
          });

          await claimGuestCheckoutProof(tx, {
            token: nonce,
            recipientPhone: PHONE,
            orderId: order.id,
          });

          await reserveOrderInventoryOwnedFirst(tx, order.id);
          return order.id;
        }, { timeout: 10000 });
      }

      // Quantity 2 cannot be fulfilled: only 1 owned unit,
      // with no consignment lots for this unique product.
      await expect(attempt(2)).rejects.toThrow();

      const afterFailure = await Promise.all([
        db.guestCheckoutProof.findUnique({
          where: { id: proof.id },
        }),
        db.product.findUnique({
          where: { id: product.id },
        }),
        db.order.count({ where: { recipientName: name } }),
        db.orderInventoryAllocation.count({
          where: { orderItem: { productId: product.id } },
        }),
      ]);

      expect(afterFailure[0]?.consumedAt).toBeNull();
      expect(afterFailure[0]?.orderId).toBeNull();
      expect(afterFailure[1]?.stock).toBe(1);
      expect(afterFailure[1]?.reservedStock).toBe(0);
      expect(afterFailure[2]).toBe(0);
      expect(afterFailure[3]).toBe(0);

      // The same OTP must remain usable after the rollback.
      committedOrderId = await attempt(1);

      const afterSuccess = await Promise.all([
        db.guestCheckoutProof.findUnique({
          where: { id: proof.id },
        }),
        db.product.findUnique({
          where: { id: product.id },
        }),
        db.orderInventoryAllocation.count({
          where: {
            orderId: committedOrderId,
            source: "owned",
            status: "reserved",
            quantity: 1,
          },
        }),
      ]);

      expect(afterSuccess[0]?.orderId).toBe(committedOrderId);
      expect(afterSuccess[0]?.consumedAt).not.toBeNull();
      expect(afterSuccess[1]?.stock).toBe(1);
      expect(afterSuccess[1]?.reservedStock).toBe(1);
      expect(afterSuccess[2]).toBe(1);

      // A replay with the consumed proof cannot create a second order.
      await expect(attempt(1)).rejects.toThrow();

      expect(
        await db.order.count({ where: { recipientName: name } }),
      ).toBe(1);

      expect(
        (await db.product.findUniqueOrThrow({
          where: { id: product.id },
        })).reservedStock,
      ).toBe(1);
    } finally {
      // Only isolated fixtures identified by this test's unique IDs.
      // A cleanup failure must fail the test, not be swallowed.
      await db.$transaction(async (tx) => {
        if (proofId) {
          await tx.guestCheckoutProof.deleteMany({
            where: { id: proofId, nonceHash: hash },
          });
        }

        if (committedOrderId) {
          await tx.orderInventoryAllocation.deleteMany({
            where: { orderId: committedOrderId },
          });
          await tx.orderItem.deleteMany({
            where: { orderId: committedOrderId },
          });
          await tx.order.deleteMany({
            where: {
              id: committedOrderId,
              recipientName: name,
              userId: null,
            },
          });
        }

        if (productId) {
          await tx.product.deleteMany({
            where: { id: productId, name },
          });
        }
      }, { timeout: 10000 });
    }
  });
});