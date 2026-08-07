/**
 * Phase 2C: Inventory Reservation Service
 *
 * Manages the reservation model where:
 * - Order creation reserves stock (reservedStock += qty)
 * - Payment confirmation converts reservation to sale (stock -= qty, reservedStock -= qty)
 * - Failure/cancellation releases reservation (reservedStock -= qty)
 *
 * Invariant: 0 <= reservedStock <= stock
 * Available stock = stock - reservedStock
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

interface ProductQuantity {
  productId: string;
  quantity: number;
}

interface ReservationResult {
  success: boolean;
  productId: string;
  reserved: number;
  availableBefore: number;
  availableAfter: number;
}

interface SaleConversionResult {
  success: boolean;
  productId: string;
  stockBefore: number;
  stockAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  costPrice: number;
  movementId: string;
}

/**
 * Reserve stock for pending order
 *
 * @param tx - Transaction client
 * @param items - Products and quantities to reserve
 * @param orderId - Order reference ID
 * @returns Array of reservation results
 * @throws Error if insufficient available stock or optimistic conflict
 */
export async function reserveOrderInventory(
  tx: TransactionClient,
  items: ProductQuantity[],
  orderId: string
): Promise<ReservationResult[]> {
  // Aggregate quantities by productId
  const productQuantities = new Map<string, number>();
  for (const item of items) {
    const current = productQuantities.get(item.productId) || 0;
    productQuantities.set(item.productId, current + item.quantity);
  }

  const results: ReservationResult[] = [];

  // Reserve each product
  for (const [productId, totalQuantity] of productQuantities) {
    // Fresh read inside transaction
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedStock: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Skip non-tracked products
    if (!product.trackInventory) {
      results.push({
        success: true,
        productId,
        reserved: 0,
        availableBefore: Infinity,
        availableAfter: Infinity,
      });
      continue;
    }

    // Check available stock
    const availableStock = product.stock - product.reservedStock;

    if (availableStock < totalQuantity) {
      throw new Error(
        `المخزون المتاح غير كافٍ لـ ${product.name}. المطلوب: ${totalQuantity}، المتاح: ${availableStock}`
      );
    }

    // Optimistic lock: increment reservedStock only if stock and reservedStock unchanged
    const updated = await tx.product.updateMany({
      where: {
        id: productId,
        stock: product.stock,
        reservedStock: product.reservedStock,
      },
      data: {
        reservedStock: { increment: totalQuantity },
      },
    });

    if (updated.count === 0) {
      throw new Error(
        `تم تغيير المخزون لـ ${product.name} أثناء معالجة الطلب. يرجى المحاولة مرة أخرى.`
      );
    }

    results.push({
      success: true,
      productId,
      reserved: totalQuantity,
      availableBefore: availableStock,
      availableAfter: availableStock - totalQuantity,
    });
  }

  return results;
}

/**
 * Convert reservation to sale on payment confirmation
 *
 * @param tx - Transaction client
 * @param items - Products and quantities to convert
 * @param orderId - Order reference ID
 * @returns Array of sale conversion results
 * @throws Error if reservation doesn't exist or optimistic conflict
 */
export async function confirmOrderInventorySale(
  tx: TransactionClient,
  items: ProductQuantity[],
  orderId: string
): Promise<SaleConversionResult[]> {
  // Aggregate quantities by productId
  const productQuantities = new Map<string, number>();
  for (const item of items) {
    const current = productQuantities.get(item.productId) || 0;
    productQuantities.set(item.productId, current + item.quantity);
  }

  const results: SaleConversionResult[] = [];

  // Convert each product reservation to sale
  for (const [productId, totalQuantity] of productQuantities) {
    // Fresh read inside transaction
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedStock: true,
        averageCost: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Skip non-tracked products
    if (!product.trackInventory) {
      results.push({
        success: true,
        productId,
        stockBefore: 0,
        stockAfter: 0,
        reservedBefore: 0,
        reservedAfter: 0,
        costPrice: 0,
        movementId: "",
      });
      continue;
    }

    // Verify reservation exists
    if (product.reservedStock < totalQuantity) {
      throw new Error(
        `حجز غير كافٍ لـ ${product.name}. المطلوب: ${totalQuantity}، المحجوز: ${product.reservedStock}`
      );
    }

    // Verify physical stock
    if (product.stock < totalQuantity) {
      throw new Error(
        `مخزون فعلي غير كافٍ لـ ${product.name}. المطلوب: ${totalQuantity}، المتاح: ${product.stock}`
      );
    }

    // Capture COGS at confirmation time
    const costSnapshot = product.averageCost;

    // Optimistic lock: decrement both stock and reservedStock atomically
    const updated = await tx.product.updateMany({
      where: {
        id: productId,
        stock: product.stock,
        reservedStock: product.reservedStock,
      },
      data: {
        stock: { decrement: totalQuantity },
        reservedStock: { decrement: totalQuantity },
      },
    });

    if (updated.count === 0) {
      throw new Error(
        `تم تغيير المخزون لـ ${product.name} أثناء تأكيد الدفع. يرجى المحاولة مرة أخرى.`
      );
    }

    // Create sale movement
    const movement = await tx.inventoryMovement.create({
      data: {
        productId,
        type: "sale",
        quantityChange: -totalQuantity,
        quantityBefore: product.stock,
        quantityAfter: product.stock - totalQuantity,
        unitCost: costSnapshot,
        averageCostBefore: product.averageCost,
        averageCostAfter: product.averageCost, // Phase 2C: averageCost unchanged on sale
        referenceType: "Order",
        referenceId: orderId,
        reason: `بيع - طلب #${orderId.slice(-8)}`,
      },
    });

    results.push({
      success: true,
      productId,
      stockBefore: product.stock,
      stockAfter: product.stock - totalQuantity,
      reservedBefore: product.reservedStock,
      reservedAfter: product.reservedStock - totalQuantity,
      costPrice: costSnapshot,
      movementId: movement.id,
    });
  }

  return results;
}

/**
 * Release reservation on failure/cancellation/expiry
 *
 * @param tx - Transaction client
 * @param items - Products and quantities to release
 * @param orderId - Order reference ID
 * @returns Array of release results
 * @throws Error on optimistic conflict
 */
export async function releaseOrderReservation(
  tx: TransactionClient,
  items: ProductQuantity[],
  orderId: string
): Promise<ReservationResult[]> {
  // Aggregate quantities by productId
  const productQuantities = new Map<string, number>();
  for (const item of items) {
    const current = productQuantities.get(item.productId) || 0;
    productQuantities.set(item.productId, current + item.quantity);
  }

  const results: ReservationResult[] = [];

  // Release each product reservation
  for (const [productId, totalQuantity] of productQuantities) {
    // Fresh read inside transaction
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        stock: true,
        reservedStock: true,
        trackInventory: true,
      },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Skip non-tracked products
    if (!product.trackInventory) {
      results.push({
        success: true,
        productId,
        reserved: 0,
        availableBefore: Infinity,
        availableAfter: Infinity,
      });
      continue;
    }

    // Verify reservation exists
    if (product.reservedStock < totalQuantity) {
      // Already released or never reserved - this is OK (idempotent)
      results.push({
        success: true,
        productId,
        reserved: 0,
        availableBefore: product.stock - product.reservedStock,
        availableAfter: product.stock - product.reservedStock,
      });
      continue;
    }

    const availableBefore = product.stock - product.reservedStock;

    // Optimistic lock: decrement reservedStock only
    const updated = await tx.product.updateMany({
      where: {
        id: productId,
        stock: product.stock,
        reservedStock: product.reservedStock,
      },
      data: {
        reservedStock: { decrement: totalQuantity },
      },
    });

    if (updated.count === 0) {
      throw new Error(
        `تم تغيير المخزون لـ ${product.name} أثناء إلغاء الحجز. يرجى المحاولة مرة أخرى.`
      );
    }

    results.push({
      success: true,
      productId,
      reserved: -totalQuantity,
      availableBefore,
      availableAfter: availableBefore + totalQuantity,
    });
  }

  return results;
}

/**
 * Update OrderItem cost prices after sale conversion
 *
 * @param tx - Transaction client
 * @param orderId - Order ID
 * @param saleResults - Sale conversion results with cost prices
 */
export async function updateOrderItemCostPrices(
  tx: TransactionClient,
  orderId: string,
  saleResults: SaleConversionResult[]
): Promise<void> {
  const costPriceMap = new Map<string, number>();
  for (const result of saleResults) {
    if (result.costPrice > 0) {
      costPriceMap.set(result.productId, result.costPrice);
    }
  }

  // Update each order item with captured cost price
  for (const [productId, costPrice] of costPriceMap) {
    await tx.orderItem.updateMany({
      where: {
        orderId,
        productId,
      },
      data: {
        costPrice,
      },
    });
  }
}
