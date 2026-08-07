/**
 * Test Utilities for Phase 2B Tests
 */

import { db } from "@/lib/db";

export async function createMockUser(data: { email: string; name?: string }) {
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name || "Test User",
      role: "user",
      phone: "01000000000",
      password: "test",
    },
    select: {
      id: true,
      email: true,
    },
  });

  return user;
}

export async function createMockProduct(data: {
  name: string;
  price: number;
  stock: number;
  trackInventory: boolean;
  averageCost?: number;
}) {
  const product = await db.product.create({
    data: {
      name: data.name,
      price: data.price,
      stock: data.stock,
      trackInventory: data.trackInventory,
      averageCost: data.averageCost || 0,
      costPrice: data.averageCost || 0,
      isActive: true,
      category: "test", // Required field
    },
    select: {
      id: true,
      name: true,
    },
  });

  return product;
}

export async function cleanupTestData(data: {
  userIds?: string[];
  productIds?: string[];
  orderIds?: string[];
}) {
  // Delete in correct order (dependencies first)
  if (data.orderIds && data.orderIds.length > 0) {
    await db.inventoryMovement.deleteMany({
      where: { referenceId: { in: data.orderIds } },
    });
    await db.orderItem.deleteMany({
      where: { orderId: { in: data.orderIds } },
    });
    await db.order.deleteMany({
      where: { id: { in: data.orderIds } },
    });
  }

  if (data.productIds && data.productIds.length > 0) {
    await db.inventoryMovement.deleteMany({
      where: { productId: { in: data.productIds } },
    });
    await db.orderItem.deleteMany({
      where: { productId: { in: data.productIds } },
    });
    await db.product.deleteMany({
      where: { id: { in: data.productIds } },
    });
  }

  if (data.userIds && data.userIds.length > 0) {
    await db.notification.deleteMany({
      where: { userId: { in: data.userIds } },
    });
    await db.wallet.deleteMany({
      where: { userId: { in: data.userIds } },
    });
    await db.rewardPoints.deleteMany({
      where: { userId: { in: data.userIds } },
    });
    await db.order.deleteMany({
      where: { userId: { in: data.userIds } },
    });
    await db.user.deleteMany({
      where: { id: { in: data.userIds } },
    });
  }
}
