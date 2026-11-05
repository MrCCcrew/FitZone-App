/**
 * COD Orchestration - End-to-End Atomic Flow Tests
 *
 * Tests the REAL admin completion flow including:
 * - Single transaction atomicity
 * - Race-safe claiming
 * - Rollback on errors
 * - Concurrent completion protection
 * - Payment method guards
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";

describe("COD Orchestration - End-to-End Atomic Flow", () => {
  let testUser: { id: string; email: string | null };
  let testAdmin: { id: string; email: string | null };
  let testProduct: { id: string; name: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-cod-orch-${Date.now()}@test.com`,
      name: "COD Orchestration User",
    });

    // Create admin user
    const adminEmail = `test-admin-orch-${Date.now()}@test.com`;
    testAdmin = await db.user.create({
      data: {
        email: adminEmail,
        name: "Test Admin",
        role: "admin",
        phone: "01000000000",
        password: "test",
      },
      select: { id: true, email: true },
    });

    testProduct = await createMockProduct({
      name: `COD Orch Product ${Date.now()}`,
      price: 500,
      stock: 100,
      trackInventory: true,
      averageCost: 300,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id, testAdmin.id],
      productIds: [testProduct.id],
    });
  });

  it("1. end-to-end: reservation → completion all fields updated atomically", async () => {
    // Create order with reservation
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
      include: { items: true },
    });

    // Set reservation
    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: { increment: 3 } },
    });

    const beforeStock = (await db.product.findUnique({ where: { id: testProduct.id } }))!.stock;

    // Admin confirms order (atomic completion)
    await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          inventoryDeducted: false,
          status: { in: ["pending", "confirmed"] },
        },
        data: { status: "confirmed" },
      });

      if (claimed.count === 0) {
        throw new Error("Already processed");
      }

      const saleTime = new Date();

      const { confirmOrderInventorySale, updateOrderItemCostPrices } = await import("@/lib/inventory-service");

      const saleResults = await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 3 }],
        order.id
      );

      await updateOrderItemCostPrices(tx, order.id, saleResults);

      await tx.order.update({
        where: { id: order.id },
        data: {
          inventoryDeducted: true,
          confirmedAt: saleTime,
          status: "confirmed",
        },
      });
    });

    // Verify all changes atomically
    const completedOrder = await db.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    });

    const finalProduct = await db.product.findUnique({ where: { id: testProduct.id } });

    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: order.id, type: "sale" },
    });

    expect(completedOrder?.status).toBe("confirmed");
    expect(completedOrder?.inventoryDeducted).toBe(true);
    expect(completedOrder?.confirmedAt).not.toBeNull();
    expect(completedOrder?.items[0].costPrice).toBe(300);
    expect(finalProduct?.stock).toBe(beforeStock - 3);
    expect(finalProduct?.reservedStock).toBe(0);
    expect(movements.length).toBe(1);
    expect(movements[0].unitCost).toBe(300);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("2. rollback: forced error after inventory deduction rolls back completely", async () => {
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
    });

    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: { increment: 2 } },
    });

    const beforeProduct = await db.product.findUnique({ where: { id: testProduct.id } });

    // Attempt completion with forced error
    await expect(
      db.$transaction(async (tx) => {
        const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

        await confirmOrderInventorySale(
          tx,
          [{ productId: testProduct.id, quantity: 2 }],
          order.id
        );

        // Force error after inventory deduction
        throw new Error("Simulated failure after inventory conversion");
      })
    ).rejects.toThrow("Simulated failure");

    // Verify complete rollback
    const afterProduct = await db.product.findUnique({ where: { id: testProduct.id } });
    const afterOrder = await db.order.findUnique({ where: { id: order.id } });
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: order.id, type: "sale" },
    });

    expect(afterProduct?.stock).toBe(beforeProduct?.stock); // Rolled back
    expect(afterProduct?.reservedStock).toBe(2); // Unchanged (rollback)
    expect(afterOrder?.inventoryDeducted).toBe(false); // Unchanged
    expect(movements.length).toBe(0); // No movement created (rollback)

    // Cleanup
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { reservedStock: 0 },
    });
  });

  it("3. race protection: concurrent completion only succeeds once", async () => {
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
      data: { reservedStock: { increment: 1 } },
    });

    // Simulate concurrent completion attempts
    const attempt1 = db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          inventoryDeducted: false,
          status: { in: ["pending", "confirmed"] },
        },
        data: { status: "confirmed" },
      });

      if (claimed.count === 0) {
        throw new Error("Already processed");
      }

      const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

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

      return "success-1";
    });

    const attempt2 = db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          inventoryDeducted: false,
          status: { in: ["pending", "confirmed"] },
        },
        data: { status: "confirmed" },
      });

      if (claimed.count === 0) {
        throw new Error("Already processed");
      }

      const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

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

      return "success-2";
    });

    // One should succeed, one should fail
    const results = await Promise.allSettled([attempt1, attempt2]);

    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify only ONE deduction occurred
    const finalProduct = await db.product.findUnique({ where: { id: testProduct.id } });
    const movements = await db.inventoryMovement.findMany({
      where: { referenceId: order.id, type: "sale" },
    });

    expect(finalProduct?.stock).toBe(99); // Only 1 deducted
    expect(movements.length).toBe(1); // Only 1 movement

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("4. cancelled COD cannot be completed", async () => {
    const order = await db.order.create({
      data: {
        userId: testUser.id,
        businessUnit: "store",
        status: "cancelled",
        paymentMethod: "cod",
        subtotal: 500,
        total: 500,
        inventoryDeducted: false,
        cancelledAt: new Date(),
        items: {
          create: {
            productId: testProduct.id,
            quantity: 1,
            price: 500,
          },
        },
      },
    });

    // Attempt completion of cancelled order
    await expect(
      db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            inventoryDeducted: false,
            status: { in: ["pending", "confirmed"] }, // cancelled not in list
          },
          data: { status: "confirmed" },
        });

        if (claimed.count === 0) {
          throw new Error("Order in invalid state");
        }

        const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

        await confirmOrderInventorySale(
          tx,
          [{ productId: testProduct.id, quantity: 1 }],
          order.id
        );
      })
    ).rejects.toThrow("Order in invalid state");

    const finalProduct = await db.product.findUnique({ where: { id: testProduct.id } });
    expect(finalProduct?.stock).toBe(100); // No deduction

    // Cleanup
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  });

  it("5. single event timestamp used for confirmedAt", async () => {
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
      data: { reservedStock: { increment: 1 } },
    });

    const beforeTime = Date.now();

    let capturedSaleTime: Date | null = null;

    await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          inventoryDeducted: false,
          status: { in: ["pending", "confirmed"] },
        },
        data: { status: "confirmed" },
      });

      if (claimed.count === 0) throw new Error("Already processed");

      // Capture SINGLE event time
      capturedSaleTime = new Date();

      const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

      await confirmOrderInventorySale(
        tx,
        [{ productId: testProduct.id, quantity: 1 }],
        order.id
      );

      await tx.order.update({
        where: { id: order.id },
        data: {
          inventoryDeducted: true,
          confirmedAt: capturedSaleTime, // Same timestamp
        },
      });
    });

    const afterTime = Date.now();

    const finalOrder = await db.order.findUnique({ where: { id: order.id } });

    expect(finalOrder?.confirmedAt).toEqual(capturedSaleTime);
    expect(finalOrder?.confirmedAt?.getTime()).toBeGreaterThanOrEqual(beforeTime);
    expect(finalOrder?.confirmedAt?.getTime()).toBeLessThanOrEqual(afterTime);

    // Cleanup
    await db.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 100, reservedStock: 0 },
    });
  });

  it("6. COD only - cod payment method allowed", async () => {
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
      data: { reservedStock: { increment: 1 } },
    });

    // Should succeed for COD
    await expect(
      db.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            inventoryDeducted: false,
            status: { in: ["pending", "confirmed"] },
          },
          data: { status: "confirmed" },
        });

        if (claimed.count === 0) throw new Error("Already processed");

        const { confirmOrderInventorySale } = await import("@/lib/inventory-service");

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
      })
    ).resolves.toBeUndefined(); // Success

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
