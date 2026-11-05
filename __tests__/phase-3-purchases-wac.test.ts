/**
 * Phase 3: Purchases / Receiving / WAC Tests
 *
 * Tests purchase receipt flow with:
 * - WAC calculation
 * - Void/reversal
 * - Validation
 * - Downstream sales blocking
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { createMockUser, createMockProduct, cleanupTestData } from "./helpers/test-utils";

describe("Phase 3: Purchases / WAC Flow", () => {
  let testUser: { id: string; email: string | null };
  let testProduct: { id: string; name: string };

  beforeAll(async () => {
    testUser = await createMockUser({
      email: `test-phase3-${Date.now()}@test.com`,
      name: "Phase 3 Test User",
    });

    testProduct = await createMockProduct({
      name: `Test Product Phase3 ${Date.now()}`,
      price: 100,
      stock: 0, // Start with zero
      trackInventory: true,
      averageCost: 0,
    });
  });

  afterAll(async () => {
    await cleanupTestData({
      userIds: [testUser.id],
      productIds: [testProduct.id],
    });
  });

  // Test 1: First purchase sets initial WAC
  it("first purchase sets initial stock and WAC", async () => {
    const receipt = await db.$transaction(async (tx) => {
      const newReceipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P3-${Date.now()}`,
          status: "posted",
          totalCost: 0,
        },
      });

      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
      });

      if (!product) throw new Error("Product not found");

      const quantity = 10;
      const unitCost = 100;
      const lineTotal = quantity * unitCost;

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: newReceipt.id,
          productId: product.id,
          quantity,
          unitCost,
          totalCost: lineTotal,
        },
      });

      const stockBefore = product.stock;
      const stockAfter = stockBefore + quantity;
      const avgBefore = product.averageCost;
      const newAvg = unitCost; // First purchase

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: stockAfter,
          averageCost: newAvg,
          lastPurchaseCost: unitCost,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "purchase",
          quantityChange: quantity,
          quantityBefore: stockBefore,
          quantityAfter: stockAfter,
          unitCost,
          averageCostBefore: avgBefore,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: newReceipt.id,
        },
      });

      await tx.inventoryReceipt.update({
        where: { id: newReceipt.id },
        data: { totalCost: lineTotal },
      });

      return newReceipt;
    }, { timeout: 10000 });

    const product = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true, lastPurchaseCost: true },
    });

    expect(product!.stock).toBe(10);
    expect(product!.averageCost).toBe(100);
    expect(product!.lastPurchaseCost).toBe(100);

    const movement = await db.inventoryMovement.findFirst({
      where: { referenceId: receipt.id },
    });

    expect(movement!.type).toBe("purchase");
    expect(movement!.quantityChange).toBe(10);
    expect(movement!.unitCost).toBe(100);
  }, 20000);

  // Test 2: Subsequent purchase calculates WAC correctly
  it("subsequent purchase recalculates WAC correctly", async () => {
    // Second purchase at different cost
    const receipt = await db.$transaction(async (tx) => {
      const newReceipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P3-2-${Date.now()}`,
          status: "posted",
          totalCost: 0,
        },
      });

      const product = await tx.product.findUnique({
        where: { id: testProduct.id },
      });

      if (!product) throw new Error("Product not found");

      const quantity = 10;
      const unitCost = 200;
      const lineTotal = quantity * unitCost;

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: newReceipt.id,
          productId: product.id,
          quantity,
          unitCost,
          totalCost: lineTotal,
        },
      });

      const stockBefore = product.stock; // 10
      const stockAfter = stockBefore + quantity; // 20
      const avgBefore = product.averageCost; // 100

      // WAC = (10*100 + 10*200) / 20 = 3000/20 = 150
      const newAvg = (stockBefore * avgBefore + quantity * unitCost) / stockAfter;

      await tx.product.update({
        where: { id: product.id },
        data: {
          stock: stockAfter,
          averageCost: newAvg,
          lastPurchaseCost: unitCost,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "purchase",
          quantityChange: quantity,
          quantityBefore: stockBefore,
          quantityAfter: stockAfter,
          unitCost,
          averageCostBefore: avgBefore,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: newReceipt.id,
        },
      });

      await tx.inventoryReceipt.update({
        where: { id: newReceipt.id },
        data: { totalCost: lineTotal },
      });

      return newReceipt;
    }, { timeout: 10000 });

    const product = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(product!.stock).toBe(20);
    expect(product!.averageCost).toBe(150); // (10*100 + 10*200)/20
  }, 20000);

  // Test 3: Void receipt without downstream sales
  it("void receipt reverses stock and WAC when no downstream sales", async () => {
    // Get latest receipt
    const receipts = await db.inventoryReceipt.findMany({
      where: { status: "posted" },
      orderBy: { receivedAt: "desc" },
      take: 1,
      include: { items: true },
    });

    const receipt = receipts[0];
    const productBefore = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    // Void receipt
    await db.$transaction(async (tx) => {
      for (const item of receipt.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, stock: true, averageCost: true, trackInventory: true },
        });

        if (!product || !product.trackInventory) continue;

        const stockBefore = product.stock;
        const stockAfter = stockBefore - item.quantity;
        const avgBefore = product.averageCost;

        let newAvg = avgBefore;
        if (stockAfter > 0) {
          newAvg = (stockBefore * avgBefore - item.quantity * item.unitCost) / stockAfter;
          if (newAvg < 0) newAvg = avgBefore;
        } else {
          newAvg = 0;
        }

        await tx.product.update({
          where: { id: product.id },
          data: { stock: stockAfter, averageCost: newAvg },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            type: "adjustment",
            quantityChange: -item.quantity,
            quantityBefore: stockBefore,
            quantityAfter: stockAfter,
            unitCost: item.unitCost,
            averageCostBefore: avgBefore,
            averageCostAfter: newAvg,
            referenceType: "inventory_receipt_void",
            referenceId: receipt.id,
            notes: `Void receipt #${receipt.referenceNumber}`,
          },
        });
      }

      await tx.inventoryReceipt.update({
        where: { id: receipt.id },
        data: { status: "cancelled" },
      });
    }, { timeout: 10000 });

    const productAfter = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(productAfter!.stock).toBe(10); // 20 - 10
    expect(productAfter!.averageCost).toBe(100); // Back to first purchase cost

    const receiptAfter = await db.inventoryReceipt.findUnique({
      where: { id: receipt.id },
      select: { status: true },
    });

    expect(receiptAfter!.status).toBe("cancelled");

    const voidMovement = await db.inventoryMovement.findFirst({
      where: {
        referenceId: receipt.id,
        referenceType: "inventory_receipt_void",
      },
    });

    expect(voidMovement).toBeTruthy();
    expect(voidMovement!.quantityChange).toBe(-10);
  }, 20000);

  // Test 4: Duplicate reference number rejected
  it("duplicate reference number is rejected", async () => {
    const refNumber = `TEST-P3-DUP-${Date.now()}`;

    // First receipt
    await db.inventoryReceipt.create({
      data: {
        referenceNumber: refNumber,
        status: "posted",
        totalCost: 0,
      },
    });

    // Second receipt with same ref - should fail
    await expect(
      db.inventoryReceipt.create({
        data: {
          referenceNumber: refNumber,
          status: "posted",
          totalCost: 0,
        },
      })
    ).rejects.toThrow();
  }, 15000);

  // Test 5: WAC calculation with three purchases
  it("three consecutive purchases calculate WAC correctly", async () => {
    // Reset product to zero
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: 0, averageCost: 0 },
    });

    // Purchase 1: 5 @ 100
    await db.$transaction(async (tx) => {
      const receipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P3-WAC1-${Date.now()}`,
          status: "posted",
          totalCost: 500,
        },
      });

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: receipt.id,
          productId: testProduct.id,
          quantity: 5,
          unitCost: 100,
          totalCost: 500,
        },
      });

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: 5, averageCost: 100 },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "purchase",
          quantityChange: 5,
          quantityBefore: 0,
          quantityAfter: 5,
          unitCost: 100,
          averageCostBefore: 0,
          averageCostAfter: 100,
          referenceType: "inventory_receipt",
          referenceId: receipt.id,
        },
      });
    }, { timeout: 10000 });

    // Purchase 2: 10 @ 150
    await db.$transaction(async (tx) => {
      const receipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P3-WAC2-${Date.now()}`,
          status: "posted",
          totalCost: 1500,
        },
      });

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: receipt.id,
          productId: testProduct.id,
          quantity: 10,
          unitCost: 150,
          totalCost: 1500,
        },
      });

      const product = await tx.product.findUnique({ where: { id: testProduct.id } });
      const newAvg = (5 * 100 + 10 * 150) / 15; // 133.33

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: 15, averageCost: newAvg },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "purchase",
          quantityChange: 10,
          quantityBefore: 5,
          quantityAfter: 15,
          unitCost: 150,
          averageCostBefore: 100,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: receipt.id,
        },
      });
    }, { timeout: 10000 });

    // Purchase 3: 15 @ 200
    await db.$transaction(async (tx) => {
      const receipt = await tx.inventoryReceipt.create({
        data: {
          referenceNumber: `TEST-P3-WAC3-${Date.now()}`,
          status: "posted",
          totalCost: 3000,
        },
      });

      await tx.inventoryReceiptItem.create({
        data: {
          receiptId: receipt.id,
          productId: testProduct.id,
          quantity: 15,
          unitCost: 200,
          totalCost: 3000,
        },
      });

      const product = await tx.product.findUnique({ where: { id: testProduct.id } });
      const avgBefore = 133.33;
      const newAvg = (15 * avgBefore + 15 * 200) / 30; // 166.67

      await tx.product.update({
        where: { id: testProduct.id },
        data: { stock: 30, averageCost: newAvg },
      });

      await tx.inventoryMovement.create({
        data: {
          productId: testProduct.id,
          type: "purchase",
          quantityChange: 15,
          quantityBefore: 15,
          quantityAfter: 30,
          unitCost: 200,
          averageCostBefore: avgBefore,
          averageCostAfter: newAvg,
          referenceType: "inventory_receipt",
          referenceId: receipt.id,
        },
      });
    }, { timeout: 10000 });

    const finalProduct = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(finalProduct!.stock).toBe(30);
    // WAC = (5*100 + 10*150 + 15*200) / 30 = (500 + 1500 + 3000) / 30 = 5000/30 = 166.67
    expect(finalProduct!.averageCost).toBeCloseTo(166.67, 2);
  }, 30000);

  // Test 6: Transaction rollback on error
  it("transaction rolls back on error", async () => {
    const productBefore = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    await expect(
      db.$transaction(async (tx) => {
        const receipt = await tx.inventoryReceipt.create({
          data: {
            referenceNumber: `TEST-P3-ROLLBACK-${Date.now()}`,
            status: "posted",
            totalCost: 0,
          },
        });

        await tx.inventoryReceiptItem.create({
          data: {
            receiptId: receipt.id,
            productId: testProduct.id,
            quantity: 10,
            unitCost: 100,
            totalCost: 1000,
          },
        });

        // Force error
        throw new Error("FORCED_ERROR");
      }, { timeout: 10000 })
    ).rejects.toThrow("FORCED_ERROR");

    const productAfter = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true, averageCost: true },
    });

    expect(productAfter!.stock).toBe(productBefore!.stock);
    expect(productAfter!.averageCost).toBe(productBefore!.averageCost);
  }, 15000);

  // Test 7: Void blocked if insufficient stock
  it("blocks void if current stock is insufficient", async () => {
    const receipt = await db.inventoryReceipt.create({
      data: {
        referenceNumber: `TEST-VOID-${Date.now()}`,
        supplierId: null,
        receivedAt: new Date(),
        status: "posted",
        totalCost: 5000,
        items: {
          create: [{ productId: testProduct.id, quantity: 50, unitCost: 100, totalCost: 5000 }],
        },
      },
    });

    // Sell 60 units (more than the receipt quantity)
    await db.product.update({
      where: { id: testProduct.id },
      data: { stock: { decrement: 60 } },
    });

    const stockBefore = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });

    // Void should fail (stockAfter would be negative)
    await expect(
      db.$transaction(async (tx) => {
        const receiptToVoid = await tx.inventoryReceipt.findUnique({
          where: { id: receipt.id },
          include: { items: true },
        });

        if (!receiptToVoid || receiptToVoid.status !== "posted") {
          throw new Error("Receipt not found or not posted");
        }

        for (const item of receiptToVoid.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { stock: true, name: true, trackInventory: true },
          });

          if (!product || !product.trackInventory) continue;

          const stockAfter = product.stock - item.quantity;

          if (stockAfter < 0) {
            throw new Error(
              `لا يمكن إلغاء الإيصال: الكمية الحالية لمنتج "${product.name}" غير كافية`
            );
          }
        }
      })
    ).rejects.toThrow(/الكمية الحالية.*غير كافية/);

    // Stock unchanged
    const stockAfter = await db.product.findUnique({
      where: { id: testProduct.id },
      select: { stock: true },
    });
    expect(stockAfter!.stock).toBe(stockBefore!.stock);
  }, 15000);

  // Test 8: Void blocked if downstream movements exist
  it("blocks void if sale/return/adjustment after receipt", async () => {
    const receipt = await db.inventoryReceipt.create({
      data: {
        referenceNumber: `TEST-DOWNSTREAM-${Date.now()}`,
        supplierId: null,
        receivedAt: new Date("2025-01-01"),
        status: "posted",
        totalCost: 1000,
        items: {
          create: [{ productId: testProduct.id, quantity: 10, unitCost: 100, totalCost: 1000 }],
        },
      },
    });

    // Create downstream sale
    await db.inventoryMovement.create({
      data: {
        productId: testProduct.id,
        type: "sale",
        quantityChange: -2,
        quantityBefore: 100,
        quantityAfter: 98,
        unitCost: 100,
        averageCostBefore: 100,
        averageCostAfter: 100,
        referenceType: "Order",
        referenceId: "downstream-order",
        createdAt: new Date("2025-01-02"),
      },
    });

    // Void should fail
    await expect(
      db.$transaction(async (tx) => {
        const receiptToVoid = await tx.inventoryReceipt.findUnique({
          where: { id: receipt.id },
          include: { items: true },
        });

        if (!receiptToVoid) throw new Error("Receipt not found");

        for (const item of receiptToVoid.items) {
          const downstreamCount = await tx.inventoryMovement.count({
            where: {
              productId: item.productId,
              type: { in: ["sale", "return", "adjustment", "purchase"] },
              createdAt: { gt: receiptToVoid.receivedAt },
            },
          });

          if (downstreamCount > 0) {
            throw new Error(
              `لا يمكن إلغاء الإيصال: توجد حركات مخزون لاحقة`
            );
          }
        }
      })
    ).rejects.toThrow(/حركات مخزون لاحقة/);
  }, 15000);
});
