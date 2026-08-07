/**
 * Phase 1C-1: Inventory Adjustment Tests
 * Tests for safe manual inventory adjustments with optimistic concurrency
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Test database client
const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Mock admin session BEFORE importing the route
// Use vi.hoisted to avoid hoisting issues
const adminState = vi.hoisted(() => ({
  userId: "test-admin-placeholder",
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(() => ({
    session: { user: { id: adminState.userId } },
  })),
}));

// Import route after mocks
import { POST } from "@/app/api/admin/inventory/adjustments/route";
// Import the actual db used by route for spying
import { db as appDb } from "@/lib/db";

describe("Phase 1C-1: Inventory Adjustments", () => {
  let testProductIds: string[] = [];
  let testAdmin: { id: string } | null = null;

  beforeAll(async () => {
    await testDb.$connect();

    // Create real test admin user
    testAdmin = await testDb.user.create({
      data: {
        email: `test-admin-inventory-${Date.now()}@test.com`,
        name: "Test Admin Inventory",
        role: "admin",
        adminAccess: true,
      },
    });
    adminState.userId = testAdmin.id;
  });

  afterAll(async () => {
    // Cleanup: delete test products and their movements first
    if (testProductIds.length > 0) {
      await testDb.inventoryMovement.deleteMany({
        where: { productId: { in: testProductIds } },
      });
      await testDb.product.deleteMany({
        where: { id: { in: testProductIds } },
      });
    }

    // Delete test admin user
    if (testAdmin) {
      await testDb.user.delete({
        where: { id: testAdmin.id },
      });
    }

    await testDb.$disconnect();
  });

  // Helper: Create test product
  const createProduct = async (data: {
    name: string;
    stock: number;
    averageCost: number;
  }) => {
    const product = await testDb.product.create({
      data: {
        name: data.name,
        category: "gear",
        price: 100,
        stock: data.stock,
        averageCost: data.averageCost,
        lastPurchaseCost: 0,
      },
    });
    testProductIds.push(product.id);
    return product;
  };

  // Helper: Call adjustment endpoint
  const adjustInventory = async (data: Record<string, unknown>) => {
    const request = new Request("http://localhost/api/admin/inventory/adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    });

    const response = await POST(request);
    const result = await response!.json();

    return { response: response!, result } as { response: Response; result: any };
  };

  // ══════════════════════════════════════════════════════════════
  // INCREASE TESTS
  // ══════════════════════════════════════════════════════════════

  it("1. زيادة صحيحة تحسب WAC بدقة", async () => {
    const product = await createProduct({
      name: "Test Product WAC",
      stock: 100,
      averageCost: 50,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 50,
      unitCost: 70,
      reason: "شراء خارجي",
    });

    expect(response.status).toBe(200);
    expect(result.movement).toBeDefined();

    // WAC calculation: (100 * 50 + 50 * 70) / 150 = (5000 + 3500) / 150 = 56.666...
    const expectedAvg = (100 * 50 + 50 * 70) / 150;

    expect(result.product.stock).toBe(150);
    expect(result.product.averageCost).toBeCloseTo(expectedAvg, 5);
    expect(result.movement.averageCostAfter).toBeCloseTo(expectedAvg, 5);
    expect(result.movement.quantityChange).toBe(50);
    expect(result.movement.quantityBefore).toBe(100);
    expect(result.movement.quantityAfter).toBe(150);
  });

  it("2. زيادة على منتج stock=0 تجعل averageCost = unitCost", async () => {
    const product = await createProduct({
      name: "Test Product Empty",
      stock: 0,
      averageCost: 0,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 20,
      unitCost: 100,
      reason: "مخزون جديد",
    });

    expect(response.status).toBe(200);
    expect(result.product.stock).toBe(20);
    expect(result.product.averageCost).toBe(100);
    expect(result.movement.averageCostAfter).toBe(100);
  });

  it("3. زيادة بدون unitCost ترفض 400", async () => {
    const product = await createProduct({
      name: "Test No Cost",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      reason: "test",
      // unitCost missing
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("تكلفة الوحدة");
  });

  it("4. unitCost = 0 يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Zero Cost",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 0,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجب");
  });

  it("5. unitCost سالب يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Negative Cost",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: -10,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجب");
  });

  it("6. unitCost = NaN يرفض 400", async () => {
    const product = await createProduct({
      name: "Test NaN Cost",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: "invalid" as unknown as number,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("صحيح");
  });

  it("7. unitCost = null يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Null Cost",
      stock: 10,
      averageCost: 30,
    });

    // Note: JSON.stringify converts Infinity to null, so we test null directly
    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: null,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("يجب إدخال تكلفة الوحدة");
  });

  // ══════════════════════════════════════════════════════════════
  // DECREASE TESTS
  // ══════════════════════════════════════════════════════════════

  it("8. تخفيض صحيح ينجح", async () => {
    const product = await createProduct({
      name: "Test Decrease",
      stock: 100,
      averageCost: 60,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "decrease",
      quantity: 30,
      reason: "تالف",
    });

    expect(response.status).toBe(200);
    expect(result.product.stock).toBe(70);
    expect(result.product.averageCost).toBe(60); // unchanged
    expect(result.movement.averageCostAfter).toBe(60);
    expect(result.movement.quantityChange).toBe(-30); // negative
    expect(result.movement.unitCost).toBe(60); // exit at current average
  });

  it("9. تخفيض كامل إلى 0 ينجح ويحافظ على averageCost", async () => {
    const product = await createProduct({
      name: "Test Full Decrease",
      stock: 25,
      averageCost: 45,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "decrease",
      quantity: 25,
      reason: "تصفية كاملة",
    });

    expect(response.status).toBe(200);
    expect(result.product.stock).toBe(0);
    expect(result.product.averageCost).toBe(45); // unchanged even at 0
    expect(result.movement.averageCostAfter).toBe(45);
  });

  it("10. تخفيض أكبر من المتاح يرفض 422 ولا يغير DB", async () => {
    const product = await createProduct({
      name: "Test Insufficient",
      stock: 20,
      averageCost: 35,
    });

    const stockBefore = product.stock;
    const avgBefore = product.averageCost;

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "decrease",
      quantity: 50,
      reason: "test",
    });

    expect(response.status).toBe(422);
    expect(result.error).toContain("أكبر من المخزون");

    const unchanged = await testDb.product.findUnique({
      where: { id: product.id },
    });

    expect(unchanged?.stock).toBe(stockBefore);
    expect(unchanged?.averageCost).toBe(avgBefore);
  });

  it("11. تخفيض يتجاهل unitCost المرسل ويستخدم averageCost", async () => {
    const product = await createProduct({
      name: "Test Ignore Cost",
      stock: 50,
      averageCost: 80,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "decrease",
      quantity: 10,
      unitCost: 999, // ← should be ignored
      reason: "test",
    });

    expect(response.status).toBe(200);
    expect(result.movement.unitCost).toBe(80); // uses averageCost, not 999
  });

  // ══════════════════════════════════════════════════════════════
  // QUANTITY VALIDATION TESTS
  // ══════════════════════════════════════════════════════════════

  it("12. quantity = 0 يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Zero Qty",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 0,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجب");
  });

  it("13. quantity سالب يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Negative Qty",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: -5,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجب");
  });

  it("14. quantity = NaN يرفض 400", async () => {
    const product = await createProduct({
      name: "Test NaN Qty",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: "abc" as unknown as number,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("صحيح");
  });

  it("15. quantity = null يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Null Qty",
      stock: 10,
      averageCost: 30,
    });

    // Note: JSON.stringify converts Infinity to null, so we test null directly
    // Number(null) = 0, which is <= 0 and triggers validation
    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: null,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجبًا");
  });

  it("16. quantity كسرية (1.5) ترفض 400", async () => {
    const product = await createProduct({
      name: "Test Decimal Qty",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 1.5,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("عددًا صحيحًا");
  });

  // ══════════════════════════════════════════════════════════════
  // REASON & NOTES VALIDATION TESTS
  // ══════════════════════════════════════════════════════════════

  it("17. reason فارغ يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Empty Reason",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 50,
      reason: "",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("سبب التسوية");
  });

  it("18. reason spaces فقط يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Spaces Reason",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 50,
      reason: "   ",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("سبب التسوية");
  });

  it("19. reason رقمي يرفض 400 ولا ينتج 500", async () => {
    const product = await createProduct({
      name: "Test Numeric Reason",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 50,
      reason: 123 as unknown as string,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("نص");
  });

  it("20. notes غير نصية ترفض 400", async () => {
    const product = await createProduct({
      name: "Test Invalid Notes",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 50,
      reason: "test",
      notes: 456 as unknown as string,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("نص");
  });

  // ══════════════════════════════════════════════════════════════
  // GENERAL TESTS
  // ══════════════════════════════════════════════════════════════

  it("21. منتج غير موجود يرجع 404", async () => {
    const { response, result } = await adjustInventory({
      productId: "non-existent-id-12345",
      type: "increase",
      quantity: 10,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(404);
    expect(result.error).toContain("غير موجود");
  });

  it("22. productId غير نصي يرفض 400", async () => {
    const { response, result } = await adjustInventory({
      productId: 123 as unknown as string,
      type: "increase",
      quantity: 10,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("معرّف");
  });

  // ══════════════════════════════════════════════════════════════
  // DATA INTEGRITY TESTS
  // ══════════════════════════════════════════════════════════════

  it("23. lastPurchaseCost لا يتغير (increase)", async () => {
    const product = await createProduct({
      name: "Test LastCost Increase",
      stock: 20,
      averageCost: 40,
    });

    await testDb.product.update({
      where: { id: product.id },
      data: { lastPurchaseCost: 99 },
    });

    const { response } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 10,
      unitCost: 60,
      reason: "test",
    });

    expect(response.status).toBe(200);

    const updated = await testDb.product.findUnique({
      where: { id: product.id },
    });

    expect(updated?.lastPurchaseCost).toBe(99); // unchanged
  });

  it("24. lastPurchaseCost لا يتغير (decrease)", async () => {
    const product = await createProduct({
      name: "Test LastCost Decrease",
      stock: 30,
      averageCost: 50,
    });

    await testDb.product.update({
      where: { id: product.id },
      data: { lastPurchaseCost: 88 },
    });

    const { response } = await adjustInventory({
      productId: product.id,
      type: "decrease",
      quantity: 10,
      reason: "test",
    });

    expect(response.status).toBe(200);

    const updated = await testDb.product.findUnique({
      where: { id: product.id },
    });

    expect(updated?.lastPurchaseCost).toBe(88); // unchanged
  });

  it("25. لا InventoryReceipt ينشأ", async () => {
    const product = await createProduct({
      name: "Test No Receipt",
      stock: 15,
      averageCost: 25,
    });

    const { response } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 5,
      unitCost: 35,
      reason: "test",
    });

    expect(response.status).toBe(200);

    const receipts = await testDb.inventoryReceipt.findMany({
      where: {
        items: {
          some: { productId: product.id },
        },
      },
    });

    expect(receipts).toHaveLength(0);
  });

  it("26. movement يحمل before/after الصحيحة", async () => {
    const product = await createProduct({
      name: "Test Movement Data",
      stock: 40,
      averageCost: 55,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 20,
      unitCost: 65,
      reason: "test",
    });

    expect(response.status).toBe(200);
    expect(result.movement.quantityBefore).toBe(40);
    expect(result.movement.quantityAfter).toBe(60);
    expect(result.movement.averageCostBefore).toBe(55);
  });

  // ══════════════════════════════════════════════════════════════
  // TRANSACTION & ROLLBACK TESTS
  // ══════════════════════════════════════════════════════════════

  it("27. transaction rollback عند فشل InventoryMovement.create", async () => {
    const product = await createProduct({
      name: "Test Rollback",
      stock: 50,
      averageCost: 40,
    });

    const stockBefore = product.stock;
    const avgBefore = product.averageCost;

    // Temporarily set admin ID to non-existent user
    // This will cause InventoryMovement.create to fail with FK constraint (P2003)
    const originalAdminId = adminState.userId;

    try {
      adminState.userId = "non-existent-user-id-for-rollback-test";

      const { response } = await adjustInventory({
        productId: product.id,
        type: "increase",
        quantity: 10,
        unitCost: 50,
        reason: "test",
      });

      // Expect 500 error (transaction failed)
      expect(response.status).toBe(500);
    } finally {
      // Restore admin ID for other tests
      adminState.userId = originalAdminId;
    }

    // Verify product unchanged (transaction rolled back)
    const unchanged = await testDb.product.findUnique({
      where: { id: product.id },
      select: { stock: true, averageCost: true },
    });

    expect(unchanged?.stock).toBe(stockBefore);
    expect(unchanged?.averageCost).toBe(avgBefore);

    // Verify no movement created
    const movements = await testDb.inventoryMovement.findMany({
      where: {
        productId: product.id,
        type: "adjustment",
      },
    });

    expect(movements).toHaveLength(0);
  });

  it("28. returns 409 when optimistic update affects zero rows", async () => {
    const product = await createProduct({
      name: "Test Concurrency",
      stock: 30,
      averageCost: 35,
    });

    const stockBefore = product.stock;
    const avgBefore = product.averageCost;

    // Create mock function for transaction inventoryMovement.create
    const txMovementCreate = vi.fn();

    // Mock $transaction to simulate optimistic concurrency failure
    const transactionSpy = vi.spyOn(appDb, "$transaction").mockImplementationOnce(async (callback: any) => {
      // Create a transaction proxy
      const txProxy = {
        product: {
          findUnique: appDb.product.findUnique.bind(appDb.product),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }), // ← Simulate concurrent modification
        },
        inventoryMovement: {
          create: txMovementCreate, // Should not be called
        },
      };

      // Call the callback with our proxy
      return callback(txProxy);
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "increase",
      quantity: 10,
      unitCost: 50,
      reason: "test",
    });

    // Restore spy
    transactionSpy.mockRestore();

    expect(response.status).toBe(409);
    expect(result.error).toContain("تغير المخزون");

    // Verify tx.inventoryMovement.create was NOT called
    expect(txMovementCreate).not.toHaveBeenCalled();

    // Verify no movement created in database
    const movements = await testDb.inventoryMovement.findMany({
      where: {
        productId: product.id,
        type: "adjustment",
      },
    });

    expect(movements).toHaveLength(0);

    // Verify product unchanged in database (real data, not affected by mock)
    const unchanged = await testDb.product.findUnique({
      where: { id: product.id },
      select: { stock: true, averageCost: true },
    });

    expect(unchanged?.stock).toBe(stockBefore);
    expect(unchanged?.averageCost).toBe(avgBefore);
  });

  it("29. type غير صحيح يرفض 400", async () => {
    const product = await createProduct({
      name: "Test Invalid Type",
      stock: 10,
      averageCost: 30,
    });

    const { response, result } = await adjustInventory({
      productId: product.id,
      type: "invalid_type" as unknown as string,
      quantity: 5,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("increase أو decrease");
  });

  it("30. productId فارغ يرفض 400", async () => {
    const { response, result } = await adjustInventory({
      productId: "   ",
      type: "increase",
      quantity: 5,
      unitCost: 50,
      reason: "test",
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("معرّف");
  });
});
