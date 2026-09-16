import { db } from "@/lib/db";

export type SaleableStockSnapshot = {
  productId: string;
  variantId: string | null;
  ownedAvailable: number;
  consignmentAvailable: number;
  totalAvailable: number;
  trackInventory: boolean;
};

type SaleableItemKey = {
  productId: string;
  variantId?: string | null;
};

function key(productId: string, variantId: string | null) {
  return `${productId}::${variantId ?? "__BASE__"}`;
}

/**
 * Product-card availability.
 *
 * Owned stock keeps its existing Product-level semantics.
 * Consignment availability includes every open lot belonging to the product,
 * including variant-specific lots, because the customer can enter the product
 * and choose one of those variants.
 */
export async function getSaleableStockByProductIds(
  productIds: string[],
): Promise<Map<string, SaleableStockSnapshot>> {
  const ids = [...new Set(productIds.filter(Boolean))];

  if (ids.length === 0) {
    return new Map();
  }

  const [products, lots] = await Promise.all([
    db.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        stock: true,
        reservedStock: true,
        trackInventory: true,
      },
    }),

    db.consignmentLot.findMany({
      where: {
        productId: { in: ids },
        status: "open",
      },
      select: {
        productId: true,
        quantityAvailable: true,
        quantityReserved: true,
      },
    }),
  ]);

  const consignmentByProduct = new Map<string, number>();

  for (const lot of lots) {
    const available = Math.max(
      0,
      lot.quantityAvailable - lot.quantityReserved,
    );

    consignmentByProduct.set(
      lot.productId,
      (consignmentByProduct.get(lot.productId) ?? 0) + available,
    );
  }

  const result = new Map<string, SaleableStockSnapshot>();

  for (const product of products) {
    const ownedAvailable = product.trackInventory
      ? Math.max(0, product.stock - product.reservedStock)
      : 0;

    const consignmentAvailable = product.trackInventory
      ? (consignmentByProduct.get(product.id) ?? 0)
      : 0;

    result.set(product.id, {
      productId: product.id,
      variantId: null,
      ownedAvailable,
      consignmentAvailable,
      totalAvailable: product.trackInventory
        ? ownedAvailable + consignmentAvailable
        : Number.MAX_SAFE_INTEGER,
      trackInventory: product.trackInventory,
    });
  }

  return result;
}

/**
 * Checkout/allocation availability for an exact requested variant.
 *
 * IMPORTANT:
 * - Owned inventory preserves the application's current Product-level model.
 * - Consignment inventory is exact:
 *      variantId X -> only lot.variantId X
 *      variantId null -> only variant-less lots
 *
 * We never infer a variant from size/color text.
 */
export async function getSaleableStockForItems(
  items: SaleableItemKey[],
): Promise<Map<string, SaleableStockSnapshot>> {
  const normalized = Array.from(
    new Map(
      items
        .filter((item) => item.productId)
        .map((item) => [
          key(item.productId, item.variantId ?? null),
          {
            productId: item.productId,
            variantId: item.variantId ?? null,
          },
        ]),
    ).values(),
  );

  if (normalized.length === 0) {
    return new Map();
  }

  const productIds = [
    ...new Set(normalized.map((item) => item.productId)),
  ];

  const [products, lots] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        stock: true,
        reservedStock: true,
        trackInventory: true,
      },
    }),

    db.consignmentLot.findMany({
      where: {
        productId: { in: productIds },
        status: "open",
      },
      select: {
        productId: true,
        variantId: true,
        quantityAvailable: true,
        quantityReserved: true,
      },
    }),
  ]);

  const productById = new Map(
    products.map((product) => [product.id, product]),
  );

  const result = new Map<string, SaleableStockSnapshot>();

  for (const item of normalized) {
    const product = productById.get(item.productId);
    if (!product) continue;

    const ownedAvailable = product.trackInventory
      ? Math.max(0, product.stock - product.reservedStock)
      : 0;

    const consignmentAvailable = product.trackInventory
      ? lots
          .filter(
            (lot) =>
              lot.productId === item.productId &&
              (lot.variantId ?? null) === item.variantId,
          )
          .reduce(
            (sum, lot) =>
              sum +
              Math.max(
                0,
                lot.quantityAvailable - lot.quantityReserved,
              ),
            0,
          )
      : 0;

    result.set(key(item.productId, item.variantId), {
      productId: item.productId,
      variantId: item.variantId,
      ownedAvailable,
      consignmentAvailable,
      totalAvailable: product.trackInventory
        ? ownedAvailable + consignmentAvailable
        : Number.MAX_SAFE_INTEGER,
      trackInventory: product.trackInventory,
    });
  }

  return result;
}

export function getSaleableItemKey(
  productId: string,
  variantId?: string | null,
) {
  return key(productId, variantId ?? null);
}
