import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createConsignmentReceipt } from "@/lib/consignment-inventory-service";

let supplierId = "";
let productId = "";
let otherProductId = "";
let variantId = "";
let otherVariantId = "";
let invoiceId = "";

const prefix = `TEST-CONS-RECON-${Date.now()}`;

async function cleanup() {
  if (supplierId) {
    await db.consignmentMovement.deleteMany({
      where: { supplierId },
    });

    await db.consignmentLot.deleteMany({
      where: { supplierId },
    });

    await db.consignmentReceipt.deleteMany({
      where: { supplierId },
    });

    await db.purchaseInvoiceItem.deleteMany({
      where: {
        purchaseInvoice: {
          supplierId,
        },
      },
    });

    await db.purchaseInvoice.deleteMany({
      where: { supplierId },
    });
  }

  const variantIds = [variantId, otherVariantId].filter(Boolean);

  if (variantIds.length) {
    await db.productVariant.deleteMany({
      where: { id: { in: variantIds } },
    });
  }

  const productIds = [productId, otherProductId].filter(Boolean);

  if (productIds.length) {
    await db.inventoryMovement.deleteMany({
      where: { productId: { in: productIds } },
    });

    await db.product.deleteMany({
      where: { id: { in: productIds } },
    });
  }

  if (supplierId) {
    await db.supplier.deleteMany({
      where: { id: supplierId },
    });
  }
}

beforeAll(async () => {
  const dbName = await db.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  expect(dbName[0]?.db).toBe("fitzone_test");

  const supplier = await db.supplier.create({
    data: {
      name: `${prefix}-SUPPLIER`,
      code: `${prefix}-S`,
      isActive: true,
      supportsConsignment: true,
    },
  });

  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      name: `${prefix}-PRODUCT`,
      price: 200,
      category: "test",
      stock: 5,
      reservedStock: 1,
      averageCost: 70,
      lastPurchaseCost: 65,
      costPrice: 75,
      trackInventory: true,
      isActive: true,
      supplierId,
    },
  });

  productId = product.id;

  const otherProduct = await db.product.create({
    data: {
      name: `${prefix}-OTHER-PRODUCT`,
      price: 210,
      category: "test",
      stock: 0,
      reservedStock: 0,
      averageCost: 0,
      lastPurchaseCost: 0,
      costPrice: 80,
      trackInventory: true,
      isActive: true,
      supplierId,
    },
  });

  otherProductId = otherProduct.id;

  const variant = await db.productVariant.create({
    data: {
      productId,
      size: "M",
      color: "Black",
      sku: `${prefix}-V1`,
      stock: 0,
      isActive: true,
    },
  });

  variantId = variant.id;

  const otherVariant = await db.productVariant.create({
    data: {
      productId: otherProductId,
      size: "L",
      color: "White",
      sku: `${prefix}-V2`,
      stock: 0,
      isActive: true,
    },
  });

  otherVariantId = otherVariant.id;

  const invoice = await db.purchaseInvoice.create({
    data: {
      supplierId,
      invoiceNumber: `${prefix}-INV`,
      invoiceDate: new Date(),
      supplyType: "consignment",
      subtotal: 360,
      totalAmount: 360,
      status: "draft",
      items: {
        create: [
          {
            productId,
            variantId,
            description: "Consignment contract line",
            sku: variant.sku,
            quantity: 4,
            unitCost: 90,
            totalCost: 360,
          },
        ],
      },
    },
  });

  invoiceId = invoice.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Phase 2 consignment invoice reconciliation", () => {
  it("allows partial receipt and then the exact remaining quantity", async () => {
    const first = await createConsignmentReceipt({
      supplierId,
      purchaseInvoiceId: invoiceId,
      referenceNumber: `${prefix}-R1`,
      items: [
        {
          productId,
          variantId,
          quantity: 2,
          unitCost: 90,
        },
      ],
    });

    expect(first?.lots[0].quantityReceived).toBe(2);

    const second = await createConsignmentReceipt({
      supplierId,
      purchaseInvoiceId: invoiceId,
      referenceNumber: `${prefix}-R2`,
      items: [
        {
          productId,
          variantId,
          quantity: 2,
          unitCost: 90,
        },
      ],
    });

    expect(second?.lots[0].quantityReceived).toBe(2);

    const totalReceived = await db.consignmentLot.aggregate({
      where: {
        receipt: {
          purchaseInvoiceId: invoiceId,
          status: "posted",
        },
        productId,
        variantId,
      },
      _sum: {
        quantityReceived: true,
      },
    });

    expect(totalReceived._sum.quantityReceived).toBe(4);
  });

  it("rejects receiving more than the invoice quantity", async () => {
    await expect(
      createConsignmentReceipt({
        supplierId,
        purchaseInvoiceId: invoiceId,
        referenceNumber: `${prefix}-OVER`,
        items: [
          {
            productId,
            variantId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    ).rejects.toThrow(
      "exceeds the remaining quantity on the linked purchase invoice",
    );
  });

  it("rejects product/variant not present on linked invoice", async () => {
    await expect(
      createConsignmentReceipt({
        supplierId,
        purchaseInvoiceId: invoiceId,
        referenceNumber: `${prefix}-WRONG-ITEM`,
        items: [
          {
            productId: otherProductId,
            variantId: otherVariantId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    ).rejects.toThrow(
      "is not included in the linked consignment purchase invoice",
    );
  });

  it("rejects unit cost different from linked invoice", async () => {
    const separateInvoice = await db.purchaseInvoice.create({
      data: {
        supplierId,
        invoiceNumber: `${prefix}-INV-COST`,
        invoiceDate: new Date(),
        supplyType: "consignment",
        subtotal: 90,
        totalAmount: 90,
        status: "draft",
        items: {
          create: [
            {
              productId,
              variantId,
              description: "Cost reconciliation line",
              quantity: 1,
              unitCost: 90,
              totalCost: 90,
            },
          ],
        },
      },
    });

    await expect(
      createConsignmentReceipt({
        supplierId,
        purchaseInvoiceId: separateInvoice.id,
        referenceNumber: `${prefix}-BAD-COST`,
        items: [
          {
            productId,
            variantId,
            quantity: 1,
            unitCost: 95,
          },
        ],
      }),
    ).rejects.toThrow("does not match the linked consignment purchase invoice");
  });
});
