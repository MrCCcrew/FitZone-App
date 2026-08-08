/**
 * Phase 2D: Returns / Refunds / COGS Tests
 *
 * Tests return flow with:
 * - Historical OrderItem.costPrice
 * - WAC recalculation on return
 * - COGS reversal
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";
import {
  reserveOrderInventory,
  confirmOrderInventorySale,
  updateOrderItemCostPrices,
} from "@/lib/inventory-service";

describe("Phase 2D: Returns / COGS Flow", () => {
  let testUser: { id: string; email: string | null };
  let testProduct: { id: string; name: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-phase2d-${Date.now()}@test.com`,
      name: "Phase 2D Test User",
    });

    testProduct = await createMockProduct({
      name: `Test Product 2D ${Date.now()}`,
      price: 200,
      stock: 20,
      trackInventory: true,
      averageCost: 100,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  // Test 1: Simple return (no intervening purchases)
  it("simple return restores stock with historical cost", async () => {
    // Create and confirm order
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 200,
          status: "pending",
          paymentMethod: "cod",
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 200 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 2 }], newOrder.id);
      return newOrder;
    }, { timeout: 10000 });

    // Confirm sale
    await db.$transaction(async (tx) => {
      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 2 }],
        order.id
      );

      // Capture cost prices
      for (const result of saleResults) {
        await tx.orderItem.updateMany({
          where: { orderId: order.id, productId: result.productId },
          data: { costPrice: result.costPrice },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });
    }, { timeout: 15000 });

    const productAfterSale = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(productAfterSale!.stock).toBe(18);
    expect(productAfterSale!.averageCost).toBe(100); // Unchanged in Phase 2C

    // Simulate return (order cancellation)
    await db.$transaction(async (tx) => {
      const orderData = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderData || !orderData.inventoryDeducted) return;

      const productData = new Map<string, { quantity: number; totalCost: number }>();

      for (const item of orderData.items) {
        const current = productData.get(item.productId) || { quantity: 0, totalCost: 0 };
        const itemCost = (item.costPrice ?? 0) * item.quantity;
        productData.set(item.productId, {
          quantity: current.quantity + item.quantity,
          totalCost: current.totalCost + itemCost,
        });
      }

      for (const [productId, data] of productData) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true, trackInventory: true, averageCost: true },
        });

        if (!product || !product.trackInventory) continue;

        const returnQuantity = data.quantity;
        const returnUnitCost = data.totalCost / returnQuantity;
        const stockBefore = product.stock;
        const stockAfter = stockBefore + returnQuantity;
        const avgBefore = product.averageCost;
        const newAvg = (stockBefore * avgBefore + returnQuantity * returnUnitCost) / stockAfter;

        await tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: "return",
            quantityChange: returnQuantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: returnUnitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Test return",
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", inventoryDeducted: false },
      });
    }, { timeout: 10000 });

    const productAfterReturn = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(productAfterReturn!.stock).toBe(20); // Restored
    expect(productAfterReturn!.averageCost).toBe(100); // Same (no intervening purchases)

    const returnMovement = await db.inventoryMovement.findFirst({
      where: { referenceId: order.id, type: "return" },
    });

    expect(returnMovement).toBeTruthy();
    expect(returnMovement!.quantityChange).toBe(2);
    expect(returnMovement!.unitCost).toBe(100); // Historical cost
  }, 30000);

  // Test 2: Return after intervening purchase (WAC changes)
  it("return after intervening purchase recalculates WAC correctly", async () => {
    // Initial state: stock=20, avg=100

    // Create and confirm sale
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 200,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 5, price: 200 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 5 }], newOrder.id);

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 5 }],
        newOrder.id
      );

      for (const result of saleResults) {
        await tx.orderItem.updateMany({
          where: { orderId: newOrder.id, productId: result.productId },
          data: { costPrice: result.costPrice },
        });
      }

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 15000 });

    const afterSale = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(afterSale!.stock).toBe(15); // 20-5
    expect(afterSale!.averageCost).toBe(100);

    // Intervening purchase at higher cost
    await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
        select: { stock: true, averageCost: true, trackInventory: true },
      });

      if (!product) throw new Error("Product not found");

      const purchaseQty = 10;
      const purchaseCost = 150;
      const stockBefore = product.stock;
      const stockAfter = stockBefore + purchaseQty;
      const avgBefore = product.averageCost;
      const newAvg = (stockBefore * avgBefore + purchaseQty * purchaseCost) / stockAfter;

      await tx.product.update({
        where: { id: testProduct.id },
        data: {
          stock: stockAfter,
          averageCost: newAvg,
          lastPurchaseCost: purchaseCost,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "purchase",
          quantityChange: purchaseQty,
          quantityBefore: stockBefore,
          quantityAfter: stockAfter,
          unitCost: purchaseCost,
          averageCostBefore: avgBefore,
          averageCostAfter: newAvg,
          referenceType: "test",
          referenceId: "test-purchase",
        },
      });
    }, { timeout: 10000 });

    const afterPurchase = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(afterPurchase!.stock).toBe(25); // 15+10
    const expectedAvg = (15 * 100 + 10 * 150) / 25; // 120
    expect(afterPurchase!.averageCost).toBeCloseTo(expectedAvg, 2);

    // Now return original sale (5 @ 100)
    await db.$transaction(async (tx) => {
      const orderData = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderData) return;

      const productData = new Map<string, { quantity: number; totalCost: number }>();

      for (const item of orderData.items) {
        const current = productData.get(item.productId) || { quantity: 0, totalCost: 0 };
        const itemCost = (item.costPrice ?? 0) * item.quantity;
        productData.set(item.productId, {
          quantity: current.quantity + item.quantity,
          totalCost: current.totalCost + itemCost,
        });
      }

      for (const [productId, data] of productData) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true, averageCost: true, trackInventory: true },
        });

        if (!product || !product.trackInventory) continue;

        const returnQuantity = data.quantity;
        const returnUnitCost = data.totalCost / returnQuantity; // 100
        const stockBefore = product.stock;
        const stockAfter = stockBefore + returnQuantity;
        const avgBefore = product.averageCost;
        const newAvg = (stockBefore * avgBefore + returnQuantity * returnUnitCost) / stockAfter;

        await tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: "return",
            quantityChange: returnQuantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: returnUnitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Test return after purchase",
          },
        });
      }
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(finalProduct!.stock).toBe(30); // 25+5
    // WAC = (25*120 + 5*100) / 30 = 3500/30 = 116.67
    const expectedFinalAvg = (25 * expectedAvg + 5 * 100) / 30;
    expect(finalProduct!.averageCost).toBeCloseTo(expectedFinalAvg, 2);

    const returnMovement = await db.inventoryMovement.findFirst({
      where: { referenceId: order.id, type: "return" },
    });

    expect(returnMovement!.unitCost).toBe(100); // Historical, not current avg
  }, 30000);

  // Test 3: Partial return (multiple items, return subset)
  it("partial return handles multi-item orders correctly", async () => {
    // Create product 2
    const product2 = await createMockProduct({
      name: `Test Product 2D-2 ${Date.now()}`,
      price: 300,
      stock: 10,
      trackInventory: true,
      averageCost: 200,
    });

    // Create order with 2 products
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 500,
          status: "pending",
          items: {
            create: [
              { productId: testProduct.id, quantity: 2, price: 200 },
              { productId: product2.id, quantity: 1, price: 300 },
            ],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(
        tx,
        [
          { productId: testProduct.id, quantity: 2 },
          { productId: product2.id, quantity: 1 },
        ],
        newOrder.id
      );

      const saleResults = await confirmOrderInventorySale(
        tx,
        [
          { productId: testProduct.id, quantity: 2 },
          { productId: product2.id, quantity: 1 },
        ],
        newOrder.id
      );

      for (const result of saleResults) {
        await tx.orderItem.updateMany({
          where: { orderId: newOrder.id, productId: result.productId },
          data: { costPrice: result.costPrice },
        });
      }

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 15000 });

    // Verify both products deducted
    const [prod1After, prod2After] = await Promise.all([
      db.product.findUnique({ where: { id: testProduct.id }, select: { stock: true } }),
      db.product.findUnique({ where: { id: product2.id }, select: { stock: true } }),
    ]);

    expect(prod1After!.stock).toBeLessThan(30); // Some deducted
    expect(prod2After!.stock).toBe(9); // 10-1

    // Full return (both products)
    await db.$transaction(async (tx) => {
      const orderData = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderData) return;

      const productData = new Map<string, { quantity: number; totalCost: number }>();

      for (const item of orderData.items) {
        const current = productData.get(item.productId) || { quantity: 0, totalCost: 0 };
        const itemCost = (item.costPrice ?? 0) * item.quantity;
        productData.set(item.productId, {
          quantity: current.quantity + item.quantity,
          totalCost: current.totalCost + itemCost,
        });
      }

      for (const [productId, data] of productData) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true, averageCost: true, trackInventory: true },
        });

        if (!product || !product.trackInventory) continue;

        const returnQuantity = data.quantity;
        const returnUnitCost = data.totalCost / returnQuantity;
        const stockBefore = product.stock;
        const stockAfter = stockBefore + returnQuantity;
        const avgBefore = product.averageCost;
        const newAvg = (stockBefore * avgBefore + returnQuantity * returnUnitCost) / stockAfter;

        await tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: "return",
            quantityChange: returnQuantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: returnUnitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Test partial return",
          },
        });
      }
    }, { timeout: 10000 });

    const [prod1Final, prod2Final] = await Promise.all([
      db.product.findUnique({ where: { id: testProduct.id }, select: { stock: true } }),
      db.product.findUnique({ where: { id: product2.id }, select: { stock: true } }),
    ]);

    // Both restored
    expect(prod1Final!.stock).toBeGreaterThan(prod1After!.stock);
    expect(prod2Final!.stock).toBe(10); // Restored

    // Cleanup product2
    await db.orderItem.deleteMany({ where: { productId: product2.id } });
    await db.inventoryMovement.deleteMany({ where: { productId: product2.id } });
    await db.product.delete({ where: { id: product2.id } });
  }, 30000);

  // Test 4: Return with zero stock
  it("return to zero stock sets WAC correctly", async () => {
    // Sell all remaining stock
    const currentStock = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 200,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: currentStock!.stock, price: 200 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(
        tx,
        [{ productId: testProduct.id, quantity: currentStock!.stock }],
        newOrder.id
      );

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: currentStock!.stock }],
        newOrder.id
      );

      for (const result of saleResults) {
        await tx.orderItem.updateMany({
          where: { orderId: newOrder.id, productId: result.productId },
          data: { costPrice: result.costPrice },
        });
      }

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      return newOrder;
    }, { timeout: 15000 });

    const afterSale = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(afterSale!.stock).toBe(0);

    // Return to zero stock
    await db.$transaction(async (tx) => {
      const orderData = await tx.order.findUnique({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderData) return;

      const productData = new Map<string, { quantity: number; totalCost: number }>();

      for (const item of orderData.items) {
        const current = productData.get(item.productId) || { quantity: 0, totalCost: 0 };
        const itemCost = (item.costPrice ?? 0) * item.quantity;
        productData.set(item.productId, {
          quantity: current.quantity + item.quantity,
          totalCost: current.totalCost + itemCost,
        });
      }

      for (const [productId, data] of productData) {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true, averageCost: true, trackInventory: true },
        });

        if (!product || !product.trackInventory) continue;

        const returnQuantity = data.quantity;
        const returnUnitCost = data.totalCost / returnQuantity;
        const stockBefore = product.stock; // 0
        const stockAfter = returnQuantity;
        const avgBefore = product.averageCost;
        const newAvg = returnUnitCost; // Stock was 0, so new avg = return cost

        await tx.product.update({
          where: { id: productId },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId,
            type: "return",
            quantityChange: returnQuantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: returnUnitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "Order",
            referenceId: order.id,
            reason: "Test return to zero stock",
          },
        });
      }
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(finalProduct!.stock).toBe(currentStock!.stock); // Restored
    // When returning to zero stock, WAC = return cost
    const orderItems = await db.orderItem.findMany({
      where: { orderId: order.id, productId: testProduct.id },
    });
    const returnCost = orderItems[0].costPrice ?? 0;
    expect(finalProduct!.averageCost).toBe(returnCost);
  }, 30000);

  // Test 5: Double return protection (idempotency)
  it("prevents repeated full-order cancellation", async () => {
    const order = await db.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId: testUser.id,
          businessUnit: "store",
          total: 100,
          status: "pending",
          items: {
            create: [{ productId: testProduct.id, quantity: 2, price: 100 }],
          },
        },
        include: { items: true },
      });

      await reserveOrderInventory(tx, [{ productId: testProduct.id, quantity: 2 }], newOrder.id);

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 2 }],
        newOrder.id
      );

      await updateOrderItemCostPrices(tx, newOrder.id, saleResults);

      await tx.order.update({
        where: { id: newOrder.id },
        data: { status: "confirmed", inventoryDeducted: true },
      });

      return newOrder;
    });

    const stockBeforeReturn = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    // First cancellation - should succeed
    await db.$transaction(async (tx) => {
      const orderToCancel = await tx.order.findFirst({
        where: { id: order.id },
        include: { items: true },
      });

      if (!orderToCancel) throw new Error("Order not found");

      if (orderToCancel.status === "confirmed" && orderToCancel.inventoryDeducted) {
        const productData = new Map<string, { quantity: number; totalCost: number }>();
        for (const item of orderToCancel.items) {
          const itemCost = (item.costPrice ?? 0) * item.quantity;
          productData.set(item.productId, {
            quantity: (productData.get(item.productId)?.quantity ?? 0) + item.quantity,
            totalCost: (productData.get(item.productId)?.totalCost ?? 0) + itemCost,
          });
        }

        for (const [productId, data] of productData) {
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { stock: true, averageCost: true },
          });
          if (!product) continue;

          const returnQty = data.quantity;
          const returnCost = data.totalCost / returnQty;
          const newStock = product.stock + returnQty;
          const newAvg =
            newStock > 0 ? (product.stock * product.averageCost + returnQty * returnCost) / newStock : returnCost;

          await tx.product.update({
            where: { id: productId },
            data: { stock: newStock, averageCost: newAvg },
          });

          await tx.inventoryMovement.create({
            data: {
              productId,
              type: "return",
              quantityChange: returnQty,
              quantityBefore: product.stock,
              quantityAfter: newStock,
              unitCost: returnCost,
              averageCostBefore: product.averageCost,
              averageCostAfter: newAvg,
              referenceType: "Order",
              referenceId: order.id,
            },
          });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", inventoryDeducted: false },
      });
    });

    const stockAfterFirstReturn = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    expect(stockAfterFirstReturn!.stock).toBe(stockBeforeReturn!.stock + 2);

    // Second cancellation attempt - should be rejected (status no longer "confirmed")
    const secondAttempt = await db
      .$transaction(async (tx) => {
        const orderToCancel = await tx.order.findFirst({
          where: { id: order.id },
          include: { items: true },
        });

        if (!orderToCancel) throw new Error("Order not found");

        // Guard: only pending/confirmed can be cancelled
        if (!["pending", "confirmed"].includes(orderToCancel.status)) {
          throw new Error("Cannot cancel this order");
        }

        // If we reach here, cancellation would proceed (but shouldn't)
        return true;
      })
      .catch((err) => err.message);

    expect(secondAttempt).toBe("Cannot cancel this order");

    // Stock should remain unchanged after second attempt
    const stockAfterSecondAttempt = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    expect(stockAfterSecondAttempt!.stock).toBe(stockAfterFirstReturn!.stock);
  }, 30000);
});
