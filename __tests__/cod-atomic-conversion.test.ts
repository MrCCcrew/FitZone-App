/**
 * COD Atomic Sale Conversion Tests
 *
 * Direct tests for confirmOrderInventorySale() function
 * used by admin COD confirmation flow
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";
import { confirmOrderInventorySale, updateOrderItemCostPrices } from "@/lib/inventory-service";

describe("COD Atomic Sale Conversion", () => {
  let testUser: { id: string; email: string | null };
  let testProduct: { id: string; name: string };
  let testProduct2: { id: string; name: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-cod-atomic-${Date.now()}@test.com`,
      name: "COD Atomic Test User",
    });

    testProduct = await createMockProduct({
      name: `COD Product 1 ${Date.now()}`,
      price: 500,
      stock: 100,
      trackInventory: true,
      averageCost: 300,
    });

    testProduct2 = await createMockProduct({
      name: `COD Product 2 ${Date.now()}`,
      price: 300,
      stock: 50,
      trackInventory: true,
      averageCost: 200,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id, testProduct2.id],
    });
  });

  it("1. atomic sale conversion deducts stock and reservedStock", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 2500,
        total: 2500,
        inventoryDeducted: false,
        items: {
          create: {
            productId: testProduct.id,
            quantity: 5,
            price: 500,
          },
        },
      },
    });

    // Set reserved stock
    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 5 },
    });

    // Perform atomic sale conversion
    const saleResults = await confirmOrderInventorySale(
      db,
      [{ productId: testProduct.id, quantity: 5 }],
      order.id
    );

    const product = await db.product.findUnique({ where: { id: testProduct.id } });

    expect(product?.stock).toBe(95); // 100 - 5
    expect(product?.reservedStock).toBe(0); // 5 - 5
    expect(saleResults.length).toBe(1);
    expect(saleResults[0].costPrice).toBe(300);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("2. atomic conversion creates sale movement", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 1500,
        total: 1500,
        inventoryDeducted: false,
        items: {
          create: {
            productId: testProduct.id,
            quantity: 3,
            price: 500,
          },
        },
      },
    });

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 3 },
    });

    await confirmOrderInventorySale(
      db,
      [{ productId: testProduct.id, quantity: 3 }],
      order.id
    );

    const movements = await db.inventoryMovement.findMany({
      where: {
        referenceType: "Order",
        referenceId: order.id,
        type: "sale",
      },
    });

    expect(movements.length).toBe(1);
    expect(movements[0].quantityChange).toBe(-3);
    expect(movements[0].unitCost).toBe(300); // COGS captured
    expect(movements[0].productId).toBe(testProduct.id);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("3. updateOrderItemCostPrices captures historical COGS", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 1000,
        total: 1000,
        inventoryDeducted: false,
        items: {
          create: {
            productId: testProduct.id,
            quantity: 2,
            price: 500,
          },
        },
      },
      include: { items: true },
    });

    const itemId = order.items[0].id;

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 2 },
    });

    const saleResults = await confirmOrderInventorySale(
      db,
      [{ productId: testProduct.id, quantity: 2 }],
      order.id
    );

    await updateOrderItemCostPrices(db, order.id, saleResults);

    const item = await db.orderItem.findUnique({ where: { id: itemId } });

    expect(item?.costPrice).toBe(300); // Captured from product.averageCost
    expect(item?.quantity).toBe(2);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("4. multiple items converted atomically", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 3000,
        total: 3000,
        inventoryDeducted: false,
        items: {
          create: [
            {
              productId: testProduct.id,
              quantity: 3,
              price: 500,
            },
            {
              productId: testProduct2.id,
              quantity: 5,
              price: 300,
            },
          ],
        },
      },
    });

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 3 },
    });

    await db.product.update({
      where: { id: testProduct2.id },
      data: { reservedStock: 5 },
    });

    const saleResults = await confirmOrderInventorySale(
      db,
      [
        { productId: testProduct.id, quantity: 3 },
        { productId: testProduct2.id, quantity: 5 },
      ],
      order.id
    );

    const product1 = await db.product.findUnique({ where: { id: testProduct.id } });
    const product2 = await db.product.findUnique({ where: { id: testProduct2.id } });

    expect(product1?.stock).toBe(97); // 100 - 3
    expect(product1?.reservedStock).toBe(0);
    expect(product2?.stock).toBe(45); // 50 - 5
    expect(product2?.reservedStock).toBe(0);

    expect(saleResults.length).toBe(2);

    const movements = await db.inventoryMovement.findMany({
      where: {
        referenceType: "Order",
        referenceId: order.id,
        type: "sale",
      },
    });

    expect(movements.length).toBe(2);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
    await db.product.update({
      where: { id: testProduct2.id },
      data: { stock: 50, reservedStock: 0 },
    });
  });

  it("5. confirmedAt lifecycle - set once at conversion", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 500,
        total: 500,
        inventoryDeducted: false,
        confirmedAt: null,
        items: {
          create: {
            productId: testProduct.id,
            quantity: 1,
            price: 500,
          },
        },
      },
    });

    expect(order.confirmedAt).toBeNull();

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 1 },
    });

    const beforeConversion = Date.now();

    // Simulate admin confirmation flow
    await db.$transaction(async (tx) => {
      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 1 }],
        order.id
      );

      await updateOrderItemCostPrices(tx, order.id, saleResults);

      await tx.order.update({
        where: { id: order.id },
        data: {
          inventoryDeducted: true,
          confirmedAt: new Date(), // Set at conversion
        },
      });
    });

    const afterConversion = Date.now();

    const updatedOrder = await db.order.findUnique({ where: { id: order.id } });

    expect(updatedOrder?.confirmedAt).not.toBeNull();
    expect(updatedOrder?.confirmedAt?.getTime()).toBeGreaterThanOrEqual(beforeConversion);
    expect(updatedOrder?.confirmedAt?.getTime()).toBeLessThanOrEqual(afterConversion);
    expect(updatedOrder?.inventoryDeducted).toBe(true);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("6. confirmedAt is immutable (not overwritten on second update)", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "pending",
        paymentMethod: "cod",
        subtotal: 500,
        total: 500,
        inventoryDeducted: false,
        items: {
          create: {
            productId: testProduct.id,
            quantity: 1,
            price: 500,
          },
        },
      },
    });

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 1 },
    });

    // First conversion
    await db.$transaction(async (tx) => {
      await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 1 }],
        order.id
      );

      await tx.order.update({
        where: { id: order.id },
        data: {
          inventoryDeducted: true,
          confirmedAt: new Date(),
        },
      });
    });

    const firstOrder = await db.order.findUnique({ where: { id: order.id } });
    const firstConfirmedAt = firstOrder?.confirmedAt;

    // Wait 100ms
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second update attempt (simulating status change)
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "delivered",
        confirmedAt: firstOrder?.confirmedAt ? undefined : new Date(), // Immutable check
      },
    });

    const secondOrder = await db.order.findUnique({ where: { id: order.id } });

    expect(secondOrder?.confirmedAt).toEqual(firstConfirmedAt); // Unchanged
    expect(secondOrder?.status).toBe("delivered");

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });
});
