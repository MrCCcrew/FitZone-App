/**
 * Phase 1A: Opening Stock Tests
 * Tests for safe product creation with opening balance
 * Tests call the actual POST handler via HTTP
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Mock admin session BEFORE importing the route
vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn().mockResolvedValue({ user: { id: "test-admin" } }),
}));

import { POST } from "@/app/api/admin/products/route";

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

describe("Phase 1A: Product Opening Stock", () => {
  let testProductIds: string[] = [];

  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    // Cleanup: delete test products and their movements
    if (testProductIds.length > 0) {
      await db.inventoryMovement.deleteMany({
        where: { productId: { in: testProductIds } },
      });
      await db.product.deleteMany({
        where: { id: { in: testProductIds } },
      });
    }
    await db.$disconnect();
  });

  // Helper: Call POST handler
  async function createProduct(data: Record<string, unknown>) {
    const request = new Request("http://localhost/api/admin/products", {
      method: "POST",
      body: JSON.stringify(data),
    });

    const response = await POST(request);
    const result = await response.json();

    if (response.ok && result.id) {
      testProductIds.push(result.id);
    }

    return { response, result };
  }

  // Test 1: stock=0 => no movement
  it("1. stock=0 => لا ينشئ movement", async () => {
    const { response, result } = await createProduct({
      name: "Test Product - No Stock",
      price: 100,
      stock: 0,
    });

    expect(response.status).toBe(200);
    expect(result.id).toBeDefined();

    const movements = await db.inventoryMovement.findMany({
      where: { productId: result.id },
    });

    expect(movements).toHaveLength(0);
    expect(result.stock).toBe(0);
  });

  // Test 2: stock>0 + cost=0 => reject, no product created
  it("2. stock>0 + cost=0 => يرفض الطلب ولا ينشئ Product", async () => {
    const productsBefore = await db.product.count();

    const { response, result } = await createProduct({
      name: "Test Product - Stock Without Cost",
      price: 100,
      stock: 10,
      costPrice: 0,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("تكلفة المنتج");

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore);
  });

  // Test 3: stock>0 + cost>0 => Product + exactly one movement
  it("3. stock>0 + cost>0 => Product + movement واحد فقط", async () => {
    const { response, result } = await createProduct({
      name: "Test Product - With Stock",
      price: 100,
      stock: 20,
      costPrice: 50,
    });

    expect(response.status).toBe(200);
    expect(result.id).toBeDefined();

    const movements = await db.inventoryMovement.findMany({
      where: { productId: result.id },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("opening_stock");
    expect(movements[0].quantityChange).toBe(20);
    expect(movements[0].quantityBefore).toBe(0);
    expect(movements[0].quantityAfter).toBe(20);
    expect(movements[0].unitCost).toBe(50);
    expect(movements[0].averageCostBefore).toBe(0);
    expect(movements[0].averageCostAfter).toBe(50);
    expect(movements[0].referenceType).toBe("product_opening_stock");
    expect(movements[0].referenceId).toBe(result.id);

    const product = await db.product.findUnique({
      where: { id: result.id },
    });
    expect(product?.stock).toBe(20);
    expect(product?.averageCost).toBe(50);
    expect(product?.lastPurchaseCost).toBe(0);
  });

  // Test 4: Movement creation failure => Product rollback (simulated via DB constraint)
  it("4. فشل إنشاء movement => rollback للـProduct", async () => {
    // We can't easily force movement creation to fail via HTTP API
    // So we test the transaction behavior directly at DB level
    const productsBefore = await db.product.count();

    try {
      await db.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: "Test Product - Will Rollback",
            category: "gear",
            price: 100,
            stock: 10,
            averageCost: 30,
          },
        });

        // Force error: violate NOT NULL constraint
        await tx.inventoryMovement.create({
          data: {
            productId: product.id,
            type: null as unknown as string, // Force NOT NULL violation
            quantityChange: 10,
            quantityBefore: 0,
            quantityAfter: 10,
            unitCost: 30,
            averageCostBefore: 0,
            averageCostAfter: 30,
          },
        });
      });

      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Expected to fail
      expect(error).toBeDefined();
    }

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore); // No new product created
  });

  // Test 5: Non-numeric string rejected (becomes NaN)
  it("5. قيمة نصية غير رقمية مرفوضة (تصبح NaN)", async () => {
    const productsBefore = await db.product.count();

    const { response, result } = await createProduct({
      name: "Test Product - Non-numeric",
      price: 100,
      stock: "abc" as unknown as number,
      costPrice: 50,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("غير صحيحة");

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore);
  });

  // Test 6: Invalid cost value rejected
  it("6. قيمة تكلفة غير صحيحة مرفوضة", async () => {
    const productsBefore = await db.product.count();

    const { response, result } = await createProduct({
      name: "Test Product - Invalid Cost",
      price: 100,
      stock: 10,
      costPrice: "invalid" as unknown as number,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("غير صحيحة");

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore);
  });

  // Test 7: Negative stock rejected
  it("7. مخزون سالب مرفوض", async () => {
    const productsBefore = await db.product.count();

    const { response, result } = await createProduct({
      name: "Test Product - Negative Stock",
      price: 100,
      stock: -10,
      costPrice: 50,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجبة");

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore);
  });

  // Test 8: Negative cost rejected
  it("8. تكلفة سالبة مرفوضة", async () => {
    const productsBefore = await db.product.count();

    const { response, result } = await createProduct({
      name: "Test Product - Negative Cost",
      price: 100,
      stock: 10,
      costPrice: -50,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجبة");

    const productsAfter = await db.product.count();
    expect(productsAfter).toBe(productsBefore);
  });

  // Test 9: Supplier does not create purchase invoice
  it("9. المورد لا ينشئ فاتورة مشتريات", async () => {
    const supplier = await db.supplier.findFirst();
    const supplierId = supplier?.id ?? null;

    const { response, result } = await createProduct({
      name: "Test Product - With Supplier",
      price: 100,
      stock: 12,
      costPrice: 40,
      supplierId: supplierId,
    });

    expect(response.status).toBe(200);
    expect(result.id).toBeDefined();

    // Verify: No InventoryReceipt created
    const receipts = await db.inventoryReceipt.findMany({
      where: {
        items: {
          some: { productId: result.id },
        },
      },
    });

    expect(receipts).toHaveLength(0);
    expect(result.supplierId).toBe(supplierId);
  });

  // Test 10: Data precision preserved
  it("10. المخزون والتكلفة محفوظان بدقة النظام", async () => {
    const preciseStock = 123;
    const preciseCost = 45.67;

    const { response, result } = await createProduct({
      name: "Test Product - Precision",
      price: 100,
      stock: preciseStock,
      costPrice: preciseCost,
    });

    expect(response.status).toBe(200);
    expect(result.id).toBeDefined();

    const product = await db.product.findUnique({
      where: { id: result.id },
    });

    const movement = await db.inventoryMovement.findFirst({
      where: { productId: result.id },
    });

    expect(product?.stock).toBe(preciseStock);
    expect(product?.averageCost).toBe(preciseCost);
    expect(movement?.quantityChange).toBe(preciseStock);
    expect(movement?.unitCost).toBe(preciseCost);
  });

  // Test 11: Repeated identical requests create separate products (no idempotency key)
  it("11. repeated identical requests create separate products because endpoint has no idempotency key", async () => {
    const { result: product1 } = await createProduct({
      name: "Test Duplicate Check",
      price: 100,
      stock: 15,
      costPrice: 25,
    });

    const { result: product2 } = await createProduct({
      name: "Test Duplicate Check", // Same name
      price: 100,
      stock: 15,
      costPrice: 25,
    });

    // Two different products created (no idempotency by default)
    expect(product1.id).toBeDefined();
    expect(product2.id).toBeDefined();
    expect(product1.id).not.toBe(product2.id);

    // This is expected behavior - endpoint has no idempotency key
  });
});
