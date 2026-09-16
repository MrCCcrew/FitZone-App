import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createPurchaseInvoiceDraft,
  postPurchaseInvoice,
} from "@/lib/supplier-ap-service";

const RUN_ID = `PHASE1-${Date.now()}`;
const SUPPLIER_A_CODE = `${RUN_ID}-SUP-A`;
const SUPPLIER_B_CODE = `${RUN_ID}-SUP-B`;

let supplierAId = "";
let supplierBId = "";
let productAId = "";
let productBId = "";
let variantAId = "";
let variantBId = "";

async function cleanup() {
  const invoices = await db.purchaseInvoice.findMany({
    where: {
      supplier: {
        code: {
          in: [SUPPLIER_A_CODE, SUPPLIER_B_CODE],
        },
      },
    },
    select: { id: true },
  });

  const invoiceIds = invoices.map((invoice) => invoice.id);

  if (invoiceIds.length) {
    await db.purchaseInvoiceItem.deleteMany({
      where: { purchaseInvoiceId: { in: invoiceIds } },
    });

    await db.purchaseInvoice.deleteMany({
      where: { id: { in: invoiceIds } },
    });
  }

  if (variantAId || variantBId) {
    await db.productVariant.deleteMany({
      where: {
        id: {
          in: [variantAId, variantBId].filter(Boolean),
        },
      },
    });
  }

  if (productAId || productBId) {
    await db.product.deleteMany({
      where: {
        id: {
          in: [productAId, productBId].filter(Boolean),
        },
      },
    });
  }

  await db.supplier.deleteMany({
    where: {
      code: {
        in: [SUPPLIER_A_CODE, SUPPLIER_B_CODE],
      },
    },
  });
}

beforeAll(async () => {
  const rows = await db.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;

  if (rows[0]?.db !== "fitzone_test") {
    throw new Error(
      `REFUSING: Phase 1 tests require fitzone_test, got ${rows[0]?.db}`,
    );
  }

  await cleanup();

  const supplierA = await db.supplier.create({
    data: {
      name: "Phase 1 Supplier A",
      code: SUPPLIER_A_CODE,
      isActive: true,
      supportsConsignment: true,
    },
  });

  const supplierB = await db.supplier.create({
    data: {
      name: "Phase 1 Supplier B",
      code: SUPPLIER_B_CODE,
      isActive: true,
      supportsConsignment: true,
    },
  });

  supplierAId = supplierA.id;
  supplierBId = supplierB.id;

  const productA = await db.product.create({
    data: {
      name: "Phase 1 Product A",
      price: 200,
      category: "test",
      stock: 7,
      reservedStock: 0,
      averageCost: 40,
      lastPurchaseCost: 40,
      costPrice: 45,
      supplierId: supplierA.id,
      isActive: true,
    },
  });

  const productB = await db.product.create({
    data: {
      name: "Phase 1 Product B",
      price: 300,
      category: "test",
      stock: 9,
      reservedStock: 0,
      averageCost: 55,
      lastPurchaseCost: 55,
      costPrice: 60,
      supplierId: supplierB.id,
      isActive: true,
    },
  });

  productAId = productA.id;
  productBId = productB.id;

  const variantA = await db.productVariant.create({
    data: {
      productId: productA.id,
      size: "M",
      color: "Black",
      sku: `${RUN_ID}-VAR-A`,
      stock: 3,
      costPrice: 47,
      isActive: true,
    },
  });

  const variantB = await db.productVariant.create({
    data: {
      productId: productB.id,
      size: "L",
      color: "White",
      sku: `${RUN_ID}-VAR-B`,
      stock: 4,
      costPrice: 62,
      isActive: true,
    },
  });

  variantAId = variantA.id;
  variantBId = variantB.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Purchase invoice product links + consignment Phase 1", () => {
  it("creates a normal purchase draft with product + variant snapshots", async () => {
    const invoice = await createPurchaseInvoiceDraft({
      supplierId: supplierAId,
      invoiceDate: new Date(),
      supplyType: "purchase",
      items: [
        {
          productId: productAId,
          variantId: variantAId,
          quantity: 2,
          unitCost: 47,
        },
      ],
    });

    expect(invoice.supplyType).toBe("purchase");
    expect(invoice.status).toBe("draft");
    expect(invoice.items).toHaveLength(1);

    const item = invoice.items[0];

    expect(item.productId).toBe(productAId);
    expect(item.variantId).toBe(variantAId);
    expect(item.description).toContain("Phase 1 Product A");
    expect(item.description).toContain("M");
    expect(item.description).toContain("Black");
    expect(item.sku).toBe(`${RUN_ID}-VAR-A`);
    expect(Number(item.totalCost)).toBe(94);
  });

  it("creates a consignment draft without changing owned stock or WAC", async () => {
    const before = await db.product.findUniqueOrThrow({
      where: { id: productAId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const invoice = await createPurchaseInvoiceDraft({
      supplierId: supplierAId,
      invoiceDate: new Date(),
      supplyType: "consignment",
      items: [
        {
          productId: productAId,
          variantId: variantAId,
          quantity: 5,
          unitCost: 47,
        },
      ],
    });

    expect(invoice.supplyType).toBe("consignment");
    expect(invoice.status).toBe("draft");

    const after = await db.product.findUniqueOrThrow({
      where: { id: productAId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(after).toEqual(before);

    const journals = await db.journal.count({
      where: {
        referenceType: "PurchaseInvoice",
        referenceId: invoice.id,
      },
    });

    expect(journals).toBe(0);
  });

  it("rejects product belonging to another supplier", async () => {
    await expect(
      createPurchaseInvoiceDraft({
        supplierId: supplierAId,
        invoiceDate: new Date(),
        supplyType: "purchase",
        items: [
          {
            productId: productBId,
            quantity: 1,
            unitCost: 60,
          },
        ],
      }),
    ).rejects.toThrow("does not belong to the selected supplier");
  });

  it("rejects variant belonging to another product", async () => {
    await expect(
      createPurchaseInvoiceDraft({
        supplierId: supplierAId,
        invoiceDate: new Date(),
        supplyType: "purchase",
        items: [
          {
            productId: productAId,
            variantId: variantBId,
            quantity: 1,
            unitCost: 62,
          },
        ],
      }),
    ).rejects.toThrow("Selected variant does not belong to product");
  });

  it("blocks consignment from standard purchase posting and leaves it untouched", async () => {
    const invoice = await createPurchaseInvoiceDraft({
      supplierId: supplierAId,
      invoiceDate: new Date(),
      supplyType: "consignment",
      items: [
        {
          productId: productAId,
          variantId: variantAId,
          quantity: 1,
          unitCost: 47,
        },
      ],
    });

    const beforeProduct = await db.product.findUniqueOrThrow({
      where: { id: productAId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    await expect(postPurchaseInvoice(invoice.id)).rejects.toThrow(
      "Consignment invoices cannot be posted through the standard purchase accounting flow",
    );

    const saved = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: {
        status: true,
        postedAt: true,
      },
    });

    expect(saved.status).toBe("draft");
    expect(saved.postedAt).toBeNull();

    const journalCount = await db.journal.count({
      where: {
        referenceType: "PurchaseInvoice",
        referenceId: invoice.id,
      },
    });

    expect(journalCount).toBe(0);

    const afterProduct = await db.product.findUniqueOrThrow({
      where: { id: productAId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(afterProduct).toEqual(beforeProduct);
  });
});
