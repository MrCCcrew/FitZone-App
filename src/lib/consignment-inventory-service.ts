import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type TransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type ConsignmentReceiptItemInput = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitCost: number;
};

export type CreateConsignmentReceiptInput = {
  supplierId: string;
  purchaseInvoiceId?: string | null;
  referenceNumber?: string | null;
  receivedAt?: Date | null;
  notes?: string | null;
  performedByUserId?: string | null;
  items: ConsignmentReceiptItemInput[];
};

function normalizeId(value: unknown, field: string): string {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}

function normalizeOptionalId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return parsed;
}

function requirePositiveMoney(value: unknown, field: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }

  return Math.round(parsed * 100) / 100;
}

async function lockPurchaseInvoice(
  tx: TransactionClient,
  purchaseInvoiceId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT id
      FROM PurchaseInvoice
      WHERE id = ${purchaseInvoiceId}
      FOR UPDATE
    `,
  );
}

export async function createConsignmentReceipt(
  input: CreateConsignmentReceiptInput,
) {
  const supplierId = normalizeId(input.supplierId, "supplierId");
  const purchaseInvoiceId = normalizeOptionalId(input.purchaseInvoiceId);
  const referenceNumber = String(input.referenceNumber ?? "").trim() || null;

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Consignment receipt must contain at least one item");
  }

  const normalizedItems = input.items.map((item) => ({
    productId: normalizeId(item.productId, "productId"),
    variantId: normalizeOptionalId(item.variantId),
    quantity: requirePositiveInteger(item.quantity, "quantity"),
    unitCost: requirePositiveMoney(item.unitCost, "unitCost"),
  }));

  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: {
        id: supplierId,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        supportsConsignment: true,
      },
    });

    if (!supplier) {
      throw new Error("Supplier not found or inactive");
    }

    if (!supplier.supportsConsignment) {
      throw new Error("Supplier is not enabled for consignment transactions");
    }

    if (referenceNumber) {
      const existingReceipt = await tx.consignmentReceipt.findUnique({
        where: { referenceNumber },
        select: { id: true },
      });

      if (existingReceipt) {
        throw new Error(
          `Consignment receipt reference ${referenceNumber} already exists`,
        );
      }
    }

    let linkedInvoice: {
      id: string;
      supplierId: string;
      supplyType: string;
      status: string;
      items: Array<{
        productId: string | null;
        variantId: string | null;
        quantity: number;
        unitCost: Prisma.Decimal;
      }>;
    } | null = null;

    if (purchaseInvoiceId) {
      await lockPurchaseInvoice(tx, purchaseInvoiceId);

      linkedInvoice = await tx.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
        select: {
          id: true,
          supplierId: true,
          supplyType: true,
          status: true,
          items: {
            select: {
              productId: true,
              variantId: true,
              quantity: true,
              unitCost: true,
            },
          },
        },
      });

      if (!linkedInvoice) {
        throw new Error("Purchase invoice not found");
      }

      if (linkedInvoice.supplierId !== supplier.id) {
        throw new Error(
          "Consignment receipt supplier does not match purchase invoice supplier",
        );
      }

      if (linkedInvoice.supplyType !== "consignment") {
        throw new Error(
          "Consignment receipt can only link to a consignment purchase invoice",
        );
      }

      if (linkedInvoice.status !== "draft") {
        throw new Error(
          "Consignment receipt can only link to a draft purchase invoice",
        );
      }
    }

    const productIds = [
      ...new Set(normalizedItems.map((item) => item.productId)),
    ];

    const variantIds = [
      ...new Set(
        normalizedItems
          .map((item) => item.variantId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const products = await tx.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        supplierId: true,
        sku: true,
      },
    });

    if (products.length !== productIds.length) {
      throw new Error(
        "One or more consignment receipt products were not found",
      );
    }

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const product of products) {
      if (product.supplierId !== supplier.id) {
        throw new Error(
          `Product "${product.name}" does not belong to the selected supplier`,
        );
      }
    }

    const variants = variantIds.length
      ? await tx.productVariant.findMany({
          where: {
            id: { in: variantIds },
            isActive: true,
          },
          select: {
            id: true,
            productId: true,
            sku: true,
          },
        })
      : [];

    if (variants.length !== variantIds.length) {
      throw new Error(
        "One or more consignment product variants were not found or inactive",
      );
    }

    const variantMap = new Map(
      variants.map((variant) => [variant.id, variant]),
    );

    let totalDeclaredMinor = 0;

    const persistedItems = normalizedItems.map((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }

      const variant = item.variantId ? variantMap.get(item.variantId) : null;

      if (variant && variant.productId !== product.id) {
        throw new Error(
          `Selected variant does not belong to product "${product.name}"`,
        );
      }

      const lineMinor = Math.round(item.unitCost * 100) * item.quantity;

      totalDeclaredMinor += lineMinor;

      return {
        product,
        variant,
        quantity: item.quantity,
        unitCost: item.unitCost,
        sku: variant?.sku ?? product.sku ?? null,
      };
    });

    if (linkedInvoice) {
      const keyFor = (productId: string, variantId: string | null) =>
        `${productId}::${variantId ?? "__NO_VARIANT__"}`;

      const invoiceContract = new Map<
        string,
        {
          quantity: number;
          unitCostMinor: number;
          productId: string;
          variantId: string | null;
        }
      >();

      for (const invoiceItem of linkedInvoice.items) {
        if (!invoiceItem.productId) {
          throw new Error(
            "Linked consignment purchase invoice contains a legacy item without product linkage",
          );
        }

        const key = keyFor(invoiceItem.productId, invoiceItem.variantId);
        const unitCostMinor = Math.round(Number(invoiceItem.unitCost) * 100);
        const existing = invoiceContract.get(key);

        if (existing) {
          if (existing.unitCostMinor !== unitCostMinor) {
            throw new Error(
              "Linked consignment purchase invoice has ambiguous duplicate item costs",
            );
          }

          existing.quantity += invoiceItem.quantity;
        } else {
          invoiceContract.set(key, {
            quantity: invoiceItem.quantity,
            unitCostMinor,
            productId: invoiceItem.productId,
            variantId: invoiceItem.variantId,
          });
        }
      }

      const requestedByKey = new Map<
        string,
        {
          quantity: number;
          unitCostMinor: number;
          productName: string;
        }
      >();

      for (const item of persistedItems) {
        const key = keyFor(item.product.id, item.variant?.id ?? null);
        const unitCostMinor = Math.round(item.unitCost * 100);
        const existing = requestedByKey.get(key);

        if (existing) {
          if (existing.unitCostMinor !== unitCostMinor) {
            throw new Error(
              `Duplicate receipt lines for product "${item.product.name}" must use the same unit cost`,
            );
          }

          existing.quantity += item.quantity;
        } else {
          requestedByKey.set(key, {
            quantity: item.quantity,
            unitCostMinor,
            productName: item.product.name,
          });
        }
      }

      const previousLots = await tx.consignmentLot.findMany({
        where: {
          receipt: {
            purchaseInvoiceId: linkedInvoice.id,
            status: "posted",
          },
        },
        select: {
          productId: true,
          variantId: true,
          quantityReceived: true,
        },
      });

      const previouslyReceivedByKey = new Map<string, number>();

      for (const lot of previousLots) {
        const key = keyFor(lot.productId, lot.variantId);

        previouslyReceivedByKey.set(
          key,
          (previouslyReceivedByKey.get(key) ?? 0) + lot.quantityReceived,
        );
      }

      for (const [key, requested] of requestedByKey) {
        const contract = invoiceContract.get(key);

        if (!contract) {
          throw new Error(
            `Product "${requested.productName}" / selected variant is not included in the linked consignment purchase invoice`,
          );
        }

        if (requested.unitCostMinor !== contract.unitCostMinor) {
          throw new Error(
            `Receipt unit cost for product "${requested.productName}" does not match the linked consignment purchase invoice`,
          );
        }

        const previouslyReceived = previouslyReceivedByKey.get(key) ?? 0;

        if (previouslyReceived + requested.quantity > contract.quantity) {
          throw new Error(
            `Consignment receipt quantity for product "${requested.productName}" exceeds the remaining quantity on the linked purchase invoice`,
          );
        }
      }
    }

    const receipt = await tx.consignmentReceipt.create({
      data: {
        referenceNumber,
        supplierId: supplier.id,
        purchaseInvoiceId: linkedInvoice?.id ?? null,
        receivedAt: input.receivedAt ?? new Date(),
        status: "posted",
        totalDeclaredCost: new Prisma.Decimal(totalDeclaredMinor / 100),
        notes: String(input.notes ?? "").trim() || null,
        performedByUserId: input.performedByUserId ?? null,
      },
    });

    for (const item of persistedItems) {
      const lot = await tx.consignmentLot.create({
        data: {
          receiptId: receipt.id,
          supplierId: supplier.id,
          productId: item.product.id,
          variantId: item.variant?.id ?? null,
          sku: item.sku,
          quantityReceived: item.quantity,
          quantityAvailable: item.quantity,
          quantitySold: 0,
          quantityReturned: 0,
          unitCost: new Prisma.Decimal(item.unitCost),
          status: "open",
        },
      });

      await tx.consignmentMovement.create({
        data: {
          lotId: lot.id,
          supplierId: supplier.id,
          productId: item.product.id,
          variantId: item.variant?.id ?? null,
          type: "RECEIVE",
          quantityChange: item.quantity,
          quantityBefore: 0,
          quantityAfter: item.quantity,
          unitCost: new Prisma.Decimal(item.unitCost),
          referenceType: "ConsignmentReceipt",
          referenceId: receipt.id,
          reason: "Initial consignment receipt",
          notes: String(input.notes ?? "").trim() || null,
          actorUserId: input.performedByUserId ?? null,
        },
      });
    }

    // IMPORTANT:
    // No Product.stock mutation.
    // No Product.reservedStock mutation.
    // No Product.averageCost / lastPurchaseCost mutation.
    // No InventoryMovement creation.
    // No GL / Journal posting.
    // Sale allocation is Phase 3.

    return tx.consignmentReceipt.findUnique({
      where: { id: receipt.id },
      include: {
        supplier: true,
        purchaseInvoice: true,
        lots: {
          include: {
            product: true,
            variant: true,
            movements: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
  });
}
