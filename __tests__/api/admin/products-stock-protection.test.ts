/**
 * Phase 1B: Stock Protection Tests
 * Tests for preventing direct stock modification via PATCH
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Mock admin session BEFORE importing the route
vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn().mockResolvedValue({ user: { id: "test-admin" } }),
}));

import { PATCH, POST } from "@/app/api/admin/products/route";

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL,
    },
  },
});

describe("Phase 1B: PATCH Stock Protection", () => {
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

  // Helper: Create product
  const createProduct = async (data: Record<string, unknown>) => {
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
  };

  // Helper: PATCH product
  const patchProduct = async (data: Record<string, unknown>) => {
    const request = new Request("http://localhost/api/admin/products", {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    const response = await PATCH(request);
    const result = await response.json();

    return { response, result };
  };

  // Test 1: PATCH without stock succeeds
  it("1. PATCH بدون stock ينجح", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 1",
      price: 100,
      stock: 50,
      costPrice: 25,
    });

    const { response } = await patchProduct({
      id: product.id,
      name: "Updated Name",
      price: 150,
    });

    expect(response.status).toBe(200);

    const updated = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(updated?.name).toBe("Updated Name");
    expect(updated?.price).toBe(150);
    expect(updated?.stock).toBe(50); // Unchanged
  });

  // Test 2: PATCH with same stock succeeds
  it("2. PATCH مع نفس stock ينجح", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 2",
      price: 100,
      stock: 30,
      costPrice: 20,
    });

    const { response } = await patchProduct({
      id: product.id,
      name: "Updated Name 2",
      stock: 30, // Same as current
    });

    expect(response.status).toBe(200);

    const updated = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(updated?.name).toBe("Updated Name 2");
    expect(updated?.stock).toBe(30); // Unchanged
  });

  // Test 3: PATCH with different stock rejects 400
  it("3. PATCH مع stock مختلف يرفض 400", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 3",
      price: 100,
      stock: 40,
      costPrice: 30,
    });

    const { response, result } = await patchProduct({
      id: product.id,
      stock: 100, // Different from current (40)
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("لا يمكن تعديل المخزون");
    expect(result.error).toContain("تسوية المخزون");

    const unchanged = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(unchanged?.stock).toBe(40); // Stock NOT changed
  });

  // Test 4: PATCH with negative stock rejects
  it("4. PATCH مع stock سالب يرفض", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 4",
      price: 100,
      stock: 20,
      costPrice: 15,
    });

    const { response, result } = await patchProduct({
      id: product.id,
      stock: -10,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("موجبة");

    const unchanged = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(unchanged?.stock).toBe(20);
  });

  // Test 5: PATCH with NaN rejects
  it("5. PATCH مع NaN يرفض", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 5",
      price: 100,
      stock: 15,
      costPrice: 10,
    });

    const { response, result } = await patchProduct({
      id: product.id,
      stock: "invalid" as unknown as number,
    });

    expect(response.status).toBe(400);
    expect(result.error).toContain("غير صحيحة");

    const unchanged = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(unchanged?.stock).toBe(15);
  });

  // Test 6: PATCH with Infinity rejects (Infinity → null → 0 via JSON)
  it("6. PATCH مع Infinity يرفض", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 6",
      price: 100,
      stock: 25,
      costPrice: 12,
    });

    // Note: Infinity becomes null in JSON, then Number(null) = 0
    // So this tests stock change from 25 to 0
    const { response, result } = await patchProduct({
      id: product.id,
      stock: Infinity,
    });

    expect(response.status).toBe(400);
    // Infinity → null → 0, which is different from current stock (25)
    expect(result.error).toContain("لا يمكن تعديل المخزون");

    const unchanged = await db.product.findUnique({
      where: { id: product.id },
    });
    expect(unchanged?.stock).toBe(25);
  });

  // Test 7: PATCH for non-existent product returns 404
  it("7. PATCH لمنتج غير موجود يرجع 404", async () => {
    const { response, result } = await patchProduct({
      id: "non-existent-id-12345",
      name: "Test",
    });

    expect(response.status).toBe(404);
    expect(result.error).toContain("غير موجود");
  });

  // Test 8: After rejection, Product.stock in DB unchanged
  it("8. بعد الرفض، Product.stock في DB لم يتغير", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 7",
      price: 100,
      stock: 60,
      costPrice: 35,
    });

    const stockBefore = product.stock;

    // Try to change stock
    await patchProduct({
      id: product.id,
      stock: 999,
    });

    const after = await db.product.findUnique({
      where: { id: product.id },
      select: { stock: true },
    });

    expect(after?.stock).toBe(stockBefore);
    expect(after?.stock).toBe(60);
  });

  // Test 9: Name, price, supplier modifications still work
  it("9. تعديل الاسم والسعر والمورد يظل يعمل", async () => {
    const supplier = await db.supplier.findFirst();

    const { result: product } = await createProduct({
      name: "Test Product 8",
      price: 100,
      stock: 25,
      costPrice: 20,
    });

    const { response } = await patchProduct({
      id: product.id,
      name: "New Name",
      price: 200,
      supplierId: supplier?.id ?? null,
    });

    expect(response.status).toBe(200);

    const updated = await db.product.findUnique({
      where: { id: product.id },
    });

    expect(updated?.name).toBe("New Name");
    expect(updated?.price).toBe(200);
    expect(updated?.supplierId).toBe(supplier?.id ?? null);
    expect(updated?.stock).toBe(25); // Unchanged
  });

  // Test 10: No InventoryMovement created from PATCH
  it("10. لا InventoryMovement تُنشأ من PATCH المنتج", async () => {
    const { result: product } = await createProduct({
      name: "Test Product 9",
      price: 100,
      stock: 45,
      costPrice: 30,
    });

    // Count movements before PATCH
    const movementsBefore = await db.inventoryMovement.count({
      where: { productId: product.id },
    });

    // PATCH with same stock
    await patchProduct({
      id: product.id,
      name: "Updated via PATCH",
      stock: 45, // Same value
    });

    // Count movements after PATCH
    const movementsAfter = await db.inventoryMovement.count({
      where: { productId: product.id },
    });

    // No new movement should be created
    expect(movementsAfter).toBe(movementsBefore);

    // Verify only opening movement exists (from creation)
    const movements = await db.inventoryMovement.findMany({
      where: { productId: product.id },
    });

    expect(movements).toHaveLength(1); // Only opening stock
    expect(movements[0].type).toBe("opening_stock");
  });
});
