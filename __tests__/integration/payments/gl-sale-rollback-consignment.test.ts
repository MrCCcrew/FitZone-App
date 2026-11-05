import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { db } from "@/lib/db";
import {
  confirmOrderInventoryAllocationSale,
} from "@/lib/order-inventory-allocation-service";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !==
    "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: GL rollback test requires fitzone_test"
  );
}

describe(
  "Store sale GL failure rolls back consignment sale atomically",
  () => {
    let supplierId = "";
    let productId = "";
    let userId = "";
    let receiptId = "";
    let lotId = "";
    let orderId = "";
    let allocationId = "";

    beforeAll(async () => {
      const token = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

      const supplier = await db.supplier.create({
        data: {
          name: `GL Rollback Supplier ${token}`,
          code: `GLRB-${token}`.slice(0, 50),
          isActive: true,
          supportsConsignment: true,
        },
      });

      supplierId = supplier.id;

      const product = await db.product.create({
        data: {
          name: `GL Rollback Product ${token}`,
          price: 200,
          category: "test",
          stock: 0,
          reservedStock: 0,
          trackInventory: true,
          averageCost: 0,
          supplierId,
        },
      });

      productId = product.id;

      const user = await db.user.create({
        data: {
          email: `glrb-${token}@fitzone.test`,
        },
      });

      userId = user.id;

      const receipt =
        await db.consignmentReceipt.create({
          data: {
            referenceNumber:
              `GLRB-R-${token}`.slice(0, 100),
            supplierId,
            status: "posted",
            totalDeclaredCost: 100,
          },
        });

      receiptId = receipt.id;

      const lot =
        await db.consignmentLot.create({
          data: {
            receiptId,
            supplierId,
            productId,
            quantityReceived: 1,
            quantityAvailable: 1,
            quantityReserved: 1,
            quantitySold: 0,
            quantityReturned: 0,
            unitCost: 100,
            status: "open",
          },
        });

      lotId = lot.id;

      const order = await db.order.create({
        data: {
          userId,
          subtotal: 200,
          total: 200,
          status: "pending",
          paymentMethod: "paymob",
          inventoryDeducted: false,
          items: {
            create: {
              productId,
              quantity: 1,
              price: 200,
            },
          },
        },
        include: {
          items: true,
        },
      });

      orderId = order.id;

      const allocation =
        await db.orderInventoryAllocation.create({
          data: {
            orderId,
            orderItemId: order.items[0].id,
            source: "consignment",
            consignmentLotId: lotId,
            quantity: 1,
            unitCost: 100,
            status: "reserved",
          },
        });

      allocationId = allocation.id;
    });

    afterAll(async () => {
      if (orderId) {
        await db.consignmentSupplierLiability.deleteMany({
          where: { orderId },
        });

        await db.consignmentMovement.deleteMany({
          where: {
            referenceType:
              "OrderInventoryAllocation",
            referenceId: allocationId,
          },
        });

        await db.orderInventoryAllocation.deleteMany({
          where: { orderId },
        });

        await db.orderItem.deleteMany({
          where: { orderId },
        });

        await db.order.deleteMany({
          where: { id: orderId },
        });
      }

      if (lotId) {
        await db.consignmentLot.deleteMany({
          where: { id: lotId },
        });
      }

      if (receiptId) {
        await db.consignmentReceipt.deleteMany({
          where: { id: receiptId },
        });
      }

      if (productId) {
        await db.product.deleteMany({
          where: { id: productId },
        });
      }

      if (supplierId) {
        await db.supplier.deleteMany({
          where: { id: supplierId },
        });
      }

      if (userId) {
        await db.user.deleteMany({
          where: { id: userId },
        });
      }
    });

    it(
      "rolls back order, lot, allocation, movement and liability when GL throws",
      async () => {
        await expect(
          db.$transaction(async (tx) => {
            const claimed =
              await tx.order.updateMany({
                where: {
                  id: orderId,
                  status: "pending",
                },
                data: {
                  status: "confirmed",
                  inventoryDeducted: true,
                  confirmedAt: new Date(),
                },
              });

            expect(claimed.count).toBe(1);

            await confirmOrderInventoryAllocationSale(
              tx,
              orderId,
            );

            throw new Error(
              "TEST_FORCED_GL_FAILURE",
            );
          }),
        ).rejects.toThrow(
          "TEST_FORCED_GL_FAILURE",
        );

        const order =
          await db.order.findUniqueOrThrow({
            where: { id: orderId },
          });

        expect(order.status).toBe("pending");
        expect(order.inventoryDeducted).toBe(false);
        expect(order.confirmedAt).toBeNull();

        const allocation =
          await db.orderInventoryAllocation
            .findUniqueOrThrow({
              where: {
                id: allocationId,
              },
            });

        expect(allocation.status).toBe(
          "reserved",
        );

        const lot =
          await db.consignmentLot
            .findUniqueOrThrow({
              where: {
                id: lotId,
              },
            });

        expect(
          lot.quantityAvailable,
        ).toBe(1);

        expect(
          lot.quantityReserved,
        ).toBe(1);

        expect(
          lot.quantitySold,
        ).toBe(0);

        expect(
          await db.consignmentMovement.count({
            where: {
              referenceType:
                "OrderInventoryAllocation",
              referenceId:
                allocationId,
              type: "SALE",
            },
          }),
        ).toBe(0);

        expect(
          await db.consignmentSupplierLiability
            .count({
              where: {
                orderInventoryAllocationId:
                  allocationId,
              },
            }),
        ).toBe(0);
      },
    );
  },
);
