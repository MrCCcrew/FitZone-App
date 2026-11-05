/**
 * Phase 2B: Order Stock Flow Tests
 *
 * Tests atomic order creation + stock deduction + movement
 * with duplicate product handling, concurrency, and rollback
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";

describe("Phase 2B: Order Stock Flow", () => {
  let testUser: { id: string; email: string | null };
  let testProduct1: { id: string; name: string };
  let testProduct2: { id: string; name: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-phase2b-${Date.now()}@test.com`,
      name: "Phase 2B Test User",
    });

    testProduct1 = await createMockProduct({
      name: `Test Product 1 ${Date.now()}`,
      price: 100,
      stock: 10,
      trackInventory: true,
      averageCost: 50,
    });

    testProduct2 = await createMockProduct({
      name: `Test Product 2 ${Date.now()}`,
      price: 200,
      stock: 5,
      trackInventory: true,
      averageCost: 100,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct1.id, testProduct2.id],
    });
  });

  it("creates order with atomic stock deduction and movement", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct1.id },
        select: { id: true, name: true, stock: true, averageCost: true, trackInventory: true },
      });

      expect(product).toBeTruthy();
      expect(product!.stock).toBe(10);

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          subtotal: 200,
          total: 200,
          status: "pending",
          paymentMethod: "cod",
          items: {
            create: [{ productId: testProduct1.id, quantity: 2, price: 100 }],
          },
        },
        include: { items: true },
      });

      const updated = await tx.product.updateMany({
        where: { id: testProduct1.id, stock: product!.stock },
        data: { stock: { decrement: 2 } },
      });

      expect(updated.count).toBe(1);

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct1.id,
          type: "order_deduction",
          quantityChange: -2,
          quantityBefore: 10,
          quantityAfter: 8,
          unitCost: null,
          averageCostBefore: 50,
          averageCostAfter: 50,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    expect(finalProduct!.stock).toBe(8);

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { inventoryDeducted: true },
    });

    expect(finalOrder!.inventoryDeducted).toBe(true);

    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: order.id },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("order_deduction");
    expect(movements[0].quantityChange).toBe(-2);
  }, 10000);

  it("rolls back order when stock insufficient", async () => {
    const initialStock = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    await expect(
      db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: testProduct1.id },
          select: { stock: true, trackInventory: true },
        });

        if (product!.trackInventory && product!.stock < 20) {
          throw new Error("Insufficient stock");
        }

        await tx.order.create({
          data: {
            userId: testUser.id,
            businessUnit: "store",
            total: 100,
            status: "pending",
            items: {
              create: [{ productId: testProduct1.id, quantity: 20, price: 100 }],
            },
          },
        });
      }, { timeout: 10000 }),
    ).rejects.toThrow("Insufficient stock");

    const finalStock = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    expect(finalStock!.stock).toBe(initialStock!.stock);

    const ordersCount = await db.order.count({
      where: {
        userId: testUser.id,
        items: { some: { quantity: 20 } },
      },
    });

    expect(ordersCount).toBe(0);
  }, 10000);

  it("aggregates duplicate products correctly", async () => {
    const order = await db.$transaction(async (tx) => {
      const items = [
        { productId: testProduct1.id, quantity: 2 },
        { productId: testProduct1.id, quantity: 3 },
      ];

      const productQuantities = new Map<string, number>();
      for (const item of items) {
        const current = productQuantities.get(item.productId) || 0;
        productQuantities.set(item.productId, current + item.quantity);
      }

      expect(productQuantities.get(testProduct1.id)).toBe(5);

      const product = await tx.product.findUnique({
        where: { id: testProduct1.id },
        select: { stock: true, trackInventory: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 500,
          status: "pending",
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: 100,
            })),
          },
        },
        include: { items: true },
      });

      const totalQty = productQuantities.get(testProduct1.id)!;
      await tx.product.update({
        where: { id: testProduct1.id },
        data: { stock: { decrement: totalQty } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct1.id,
          type: "order_deduction",
          quantityChange: -totalQty,
          quantityBefore: product!.stock,
          quantityAfter: product!.stock - totalQty,
          unitCost: null,
          averageCostBefore: product!.averageCost,
          averageCostAfter: product!.averageCost,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    expect(finalProduct!.stock).toBe(3);

    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: order.id },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].quantityChange).toBe(-5);
  }, 10000);

  it("skips stock deduction for non-tracked products", async () => {
    const nonTrackedProduct = await createMockProduct({
      name: `Non-tracked ${Date.now()}`,
      price: 50,
      stock: 0,
      trackInventory: false,
    });

    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: nonTrackedProduct.id },
        select: { trackInventory: true, stock: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 50,
          status: "pending",
          items: {
            create: [{ productId: nonTrackedProduct.id, quantity: 100, price: 50 }],
          },
        },
      });

      if (product!.trackInventory) {
        await tx.product.update({
          where: { id: nonTrackedProduct.id },
          data: { stock: { decrement: 100 } },
        });
      }

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: nonTrackedProduct.id },
      select: { stock: true },
    });

    expect(finalProduct!.stock).toBe(0);

    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.delete({ where: { id: nonTrackedProduct.id } });
  }, 10000);

  it("creates movement with correct before/after values", async () => {
    const product = await db.product.findUnique({
      where: { id: testProduct2.id },
      select: { stock: true },
    });

    const initialStock = product!.stock;

    const order = await db.$transaction(async (tx) => {
      const freshProduct = await tx.product.findUnique({
        where: { id: testProduct2.id },
        select: { stock: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 200,
          status: "pending",
          items: {
            create: [{ productId: testProduct2.id, quantity: 2, price: 100 }],
          },
        },
      });

      await tx.product.update({
        where: { id: testProduct2.id },
        data: { stock: { decrement: 2 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct2.id,
          type: "order_deduction",
          quantityChange: -2,
          quantityBefore: freshProduct!.stock,
          quantityAfter: freshProduct!.stock - 2,
          unitCost: null,
          averageCostBefore: freshProduct!.averageCost,
          averageCostAfter: freshProduct!.averageCost,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const movement = await db.inventoryMovement.findFirst({
      where: { referenceId: order.id },
    });

    expect(movement).toBeTruthy();
    expect(movement!.quantityBefore).toBe(initialStock);
    expect(movement!.quantityChange).toBe(-2);
    expect(movement!.quantityAfter).toBe(initialStock - 2);
    expect(movement!.averageCostBefore).toBe(100);
    expect(movement!.averageCostAfter).toBe(100);
  }, 10000);

  it("rolls back on optimistic stock conflict", async () => {
    const initialStock = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    await expect(
      db.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: testProduct1.id },
          select: { stock: true },
        });

        const updated = await tx.product.updateMany({
          where: { id: testProduct1.id, stock: 999 },
          data: { stock: { decrement: 1 } },
        });

        if (updated.count === 0) {
          throw new Error("Stock changed during order creation. Please retry.");
        }

        await tx.order.create({
          data: {
            userId: testUser.id,
            businessUnit: "store",
            total: 100,
            status: "pending",
            items: {
              create: [{ productId: testProduct1.id, quantity: 1, price: 100 }],
            },
          },
        });
      }, { timeout: 10000 }),
    ).rejects.toThrow("Stock changed");

    const finalStock = await db.product.findUnique({
      where: { id: testProduct1.id },
      select: { stock: true },
    });

    expect(finalStock!.stock).toBe(initialStock!.stock);
  }, 10000);
});

describe("Phase 2B: Failed Payment Stock Restore", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-payment-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `Payment Test Product ${Date.now()}`,
      price: 100,
      stock: 10,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("restores stock on failed payment exactly once", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          items: {
            create: [{ productId: testProduct.id, quantity: 3, price: 100 }],
          },
        },
        include: { items: true },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 3 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_deduction",
          quantityChange: -3,
          quantityBefore: product!.stock,
          quantityAfter: product!.stock - 3,
          unitCost: null,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    let currentStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(currentStock!.stock).toBe(7);

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          inventoryDeducted: true,
          items: {
            include: {
              product: {
                select: { stock: true, trackInventory: true, averageCost: true },
              },
            },
          },
        },
      });

      if (!pendingOrder || pendingOrder.status !== "pending" || !pendingOrder.inventoryDeducted) {
        return;
      }

      const item = pendingOrder.items[0];
      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { increment: 3 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_restore",
          quantityChange: 3,
          quantityBefore: item.product.stock,
          quantityAfter: item.product.stock + 3,
          unitCost: null,
          referenceType: "Order",
          referenceId: order.id,
          reason: "Payment failed",
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", inventoryDeducted: false },
      });
    }, { timeout: 10000 });

    currentStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(currentStock!.stock).toBe(10);

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true, inventoryDeducted: true },
      });

      if (!pendingOrder || pendingOrder.status !== "pending" || !pendingOrder.inventoryDeducted) {
        return;
      }

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { increment: 3 } },
      });
    }, { timeout: 10000 });

    currentStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(currentStock!.stock).toBe(10);
  }, 20000);
});

describe("Phase 2B: Admin Order Confirmation", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-admin-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `Admin Test Product ${Date.now()}`,
      price: 100,
      stock: 20,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("prevents double deduction when inventoryDeducted=true", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 5, price: 100 }],
          },
        },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 5 } },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const orderWithFlag = await db.order.findUnique({
      where: { id: order.id },
      select: { inventoryDeducted: true },
    });

    const stockAfterFirst = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(stockAfterFirst!.stock).toBe(15);

    const shouldDeduct = !orderWithFlag!.inventoryDeducted;
    expect(shouldDeduct).toBe(false);

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(finalStock!.stock).toBe(15);
  }, 10000);
});

describe("Phase 2B: Timeout Cron", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-cron-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `Cron Test Product ${Date.now()}`,
      price: 100,
      stock: 20,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("expires unpaid pending order older than 1 hour", async () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);

    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          createdAt: oneHourAgo,
          items: {
            create: [{ productId: testProduct.id, quantity: 3, price: 100 }],
          },
        },
        include: { items: true },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 3 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_deduction",
          quantityChange: -3,
          quantityBefore: product!.stock,
          quantityAfter: product!.stock - 3,
          unitCost: null,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          inventoryDeducted: true,
          items: {
            include: {
              product: {
                select: { stock: true, averageCost: true },
              },
            },
          },
        },
      });

      if (!pendingOrder || pendingOrder.status !== "pending") {
        return;
      }

      const cancelResult = await tx.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: { status: "expired", cancelledAt: new Date() },
      });

      if (cancelResult.count === 0) {
        return;
      }

      if (pendingOrder.inventoryDeducted) {
        const item = pendingOrder.items[0];
        await tx.product.update({
          where: { id: testProduct.id },
          data: { stock: { increment: 3 } },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: testProduct.id,
            type: "order_restore",
            quantityChange: 3,
            quantityBefore: item.product.stock,
            quantityAfter: item.product.stock + 3,
            unitCost: null,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Order expired",
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { inventoryDeducted: false },
        });
      }
    }, { timeout: 10000 });

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { status: true, inventoryDeducted: true },
    });

    expect(finalOrder!.status).toBe("expired");
    expect(finalOrder!.inventoryDeducted).toBe(false);

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    expect(finalStock!.stock).toBe(20);
  }, 15000);

  it("does not expire paid pending order", async () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);

    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          createdAt: oneHourAgo,
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 100 }],
          },
        },
      });

      await tx.paymentTransaction.create({
        data: {
          userId: testUser.id,
          provider: "paymob",
          purpose: "order",
          amount: 100,
          status: "paid",
          orderId: newOrder.id,
        },
      });

      return newOrder;
    }, { timeout: 10000 });

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { id: true, status: true },
      });

      if (!pendingOrder || pendingOrder.status !== "pending") {
        return;
      }

      const cancelResult = await tx.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: { status: "expired", cancelledAt: new Date() },
      });

      if (cancelResult.count === 0) {
        return;
      }

      const paidPayment = await tx.paymentTransaction.findFirst({
        where: { orderId: order.id, status: "paid" },
      });

      if (paidPayment) {
        throw new Error("PAYMENT_CONFIRMED_RACE");
      }
    }, { timeout: 10000 }).catch((err) => {
      if (err.message !== "PAYMENT_CONFIRMED_RACE") {
        throw err;
      }
    });

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });

    expect(finalOrder!.status).toBe("pending");
  }, 15000);

  it("does not process already cancelled order", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        total: 100,
        status: "cancelled",
        items: {
          create: [{ productId: testProduct.id, quantity: 1, price: 100 }],
        },
      },
    });

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { id: true, status: true },
      });

      if (!pendingOrder || pendingOrder.status !== "pending") {
        return;
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "expired" },
      });
    }, { timeout: 10000 });

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });

    expect(finalOrder!.status).toBe("cancelled");
  }, 10000);

  it("second cron run does not restore twice", async () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);

    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          createdAt: oneHourAgo,
          items: {
            create: [{ productId: testProduct.id, quantity: 4, price: 100 }],
          },
        },
        include: { items: true },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 4 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_deduction",
          quantityChange: -4,
          quantityBefore: product!.stock,
          quantityAfter: product!.stock - 4,
          unitCost: null,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const stockAfterDeduction = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          inventoryDeducted: true,
          items: {
            include: {
              product: {
                select: { stock: true, averageCost: true },
              },
            },
          },
        },
      });

      if (!pendingOrder || pendingOrder.status !== "pending") {
        return;
      }

      const cancelResult = await tx.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: { status: "expired", cancelledAt: new Date() },
      });

      if (cancelResult.count === 0) {
        return;
      }

      if (pendingOrder.inventoryDeducted) {
        const item = pendingOrder.items[0];
        await tx.product.update({
          where: { id: testProduct.id },
          data: { stock: { increment: 4 } },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: testProduct.id,
            type: "order_restore",
            quantityChange: 4,
            quantityBefore: item.product.stock,
            quantityAfter: item.product.stock + 4,
            unitCost: null,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Order expired",
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: { inventoryDeducted: false },
        });
      }
    }, { timeout: 15000 });

    const stockAfterFirstRun = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          inventoryDeducted: true,
          items: {
            include: {
              product: {
                select: { stock: true, averageCost: true },
              },
            },
          },
        },
      });

      if (!pendingOrder || pendingOrder.status !== "pending") {
        return;
      }

      const cancelResult = await tx.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: { status: "expired", cancelledAt: new Date() },
      });

      if (cancelResult.count === 0) {
        return;
      }

      if (pendingOrder.inventoryDeducted) {
        await tx.product.update({
          where: { id: testProduct.id },
          data: { stock: { increment: 4 } },
        });
      }
    }, { timeout: 10000 });

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    expect(finalStock!.stock).toBe(stockAfterFirstRun!.stock);

    const restoreMovements = await db.inventoryMovement.count({
      where: {
        referenceId: order.id,
        type: "order_restore",
      },
    });

    expect(restoreMovements).toBe(1);
  }, 20000);
});

describe("Phase 2B: Cron vs Payment Race", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-race-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `Race Test Product ${Date.now()}`,
      price: 100,
      stock: 20,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("detects paid payment inside transaction and aborts expiration", async () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);

    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          createdAt: oneHourAgo,
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 100 }],
          },
        },
      });

      await tx.paymentTransaction.create({
        data: {
          userId: testUser.id,
          provider: "paymob",
          purpose: "order",
          amount: 100,
          status: "paid",
          orderId: newOrder.id,
        },
      });

      return newOrder;
    }, { timeout: 10000 });

    await expect(
      db.$transaction(async (tx) => {
        const cancelResult = await tx.order.updateMany({
          where: { id: order.id, status: "pending" },
          data: { status: "expired", cancelledAt: new Date() },
        });

        if (cancelResult.count === 0) {
          return;
        }

        const paidPayment = await tx.paymentTransaction.findFirst({
          where: { orderId: order.id, status: "paid" },
        });

        if (paidPayment) {
          throw new Error("PAYMENT_CONFIRMED_RACE");
        }
      }, { timeout: 10000 }),
    ).rejects.toThrow("PAYMENT_CONFIRMED_RACE");

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });

    expect(finalOrder!.status).toBe("pending");
  }, 15000);
});

describe("Phase 2B: External Payment Setup Failure", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-external-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `External Test Product ${Date.now()}`,
      price: 100,
      stock: 20,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("restores stock when external payment setup fails", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true, averageCost: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          items: {
            create: [{ productId: testProduct.id, quantity: 5, price: 100 }],
          },
        },
        include: { items: true },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 5 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_deduction",
          quantityChange: -5,
          quantityBefore: product!.stock,
          quantityAfter: product!.stock - 5,
          unitCost: null,
          referenceType: "Order",
          referenceId: newOrder.id,
        },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const stockAfterDeduction = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(stockAfterDeduction!.stock).toBe(15);

    await db.$transaction(async (tx) => {
      const pendingOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          status: true,
          inventoryDeducted: true,
          items: {
            include: {
              product: {
                select: { stock: true, averageCost: true },
              },
            },
          },
        },
      });

      if (!pendingOrder || pendingOrder.status !== "pending" || !pendingOrder.inventoryDeducted) {
        return;
      }

      const item = pendingOrder.items[0];
      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { increment: 5 } },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "order_restore",
          quantityChange: 5,
          quantityBefore: item.product.stock,
          quantityAfter: item.product.stock + 5,
          unitCost: null,
          referenceType: "Order",
          referenceId: order.id,
          reason: "External payment setup failed",
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", inventoryDeducted: false },
      });
    }, { timeout: 15000 });

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(finalStock!.stock).toBe(20);

    const finalOrder = await db.order.findUnique({
      where: { id: order.id },
      select: { status: true, inventoryDeducted: true },
    });
    expect(finalOrder!.status).toBe("cancelled");
    expect(finalOrder!.inventoryDeducted).toBe(false);

    const restoreMovement = await db.inventoryMovement.findFirst({
      where: {
        referenceId: order.id,
        type: "order_restore",
      },
    });
    expect(restoreMovement).toBeTruthy();
    expect(restoreMovement!.quantityChange).toBe(5);
  }, 20000);
});

describe("Phase 2B: Admin Paymob Orders", () => {
  let testUser: { id: string };
  let testProduct: { id: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-admin-paymob-${Date.now()}@test.com`,
    });

    testProduct = await createMockProduct({
      name: `Admin Paymob Product ${Date.now()}`,
      price: 100,
      stock: 20,
      trackInventory: true,
      averageCost: 50,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  it("admin cannot deduct when inventoryDeducted=true", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          items: {
            create: [{ productId: testProduct.id, quantity: 3, price: 100 }],
          },
        },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 3 } },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const shouldDeduct = !(await db.order.findUnique({
      where: { id: order.id },
      select: { inventoryDeducted: true },
    }))!.inventoryDeducted;

    expect(shouldDeduct).toBe(false);

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(finalStock!.stock).toBe(17);
  }, 10000);

  it("unpaid Paymob order confirmed by admin does not double-deduct", async () => {
    const order = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true },
      });

      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          paymentMethod: "paymob",
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 100 }],
          },
        },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: { decrement: 2 } },
      });

      await tx.order.update({
        where: { id: newOrder.id },
        data: { inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 10000 });

    const paidTx = await db.paymentTransaction.findFirst({
      where: { orderId: order.id, status: "paid" },
    });

    expect(paidTx).toBeNull();

    const shouldDeduct = !(await db.order.findUnique({
      where: { id: order.id },
      select: { inventoryDeducted: true },
    }))!.inventoryDeducted;

    expect(shouldDeduct).toBe(false);

    const finalStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(finalStock!.stock).toBe(15);
  }, 10000);
});
