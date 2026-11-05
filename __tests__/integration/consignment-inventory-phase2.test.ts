import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createConsignmentReceipt } from "@/lib/consignment-inventory-service";

let supplierId: string;
let productId: string;
let variantId: string;
let invoiceId: string;

const referenceNumber = `TEST-CONSIGNMENT-${Date.now()}`;

async function cleanup() {
  await db.consignmentMovement
    .deleteMany({
      where: { referenceId: invoiceId || "__none__" },
    })
    .catch(() => undefined);

  const receipts = await db.consignmentReceipt.findMany({
    where: {
      OR: [
        { referenceNumber },
        ...(invoiceId ? [{ purchaseInvoiceId: invoiceId }] : []),
      ],
    },
    select: { id: true },
  });

  const receiptIds = receipts.map((row) => row.id);

  if (receiptIds.length) {
    const lots = await db.consignmentLot.findMany({
      where: { receiptId: { in: receiptIds } },
      select: { id: true },
    });

    const lotIds = lots.map((row) => row.id);

    if (lotIds.length) {
      await db.consignmentMovement.deleteMany({
        where: { lotId: { in: lotIds } },
      });
    }

    await db.consignmentLot.deleteMany({
      where: { receiptId: { in: receiptIds } },
    });

    await db.consignmentReceipt.deleteMany({
      where: { id: { in: receiptIds } },
    });
  }

  if (invoiceId) {
    await db.purchaseInvoiceItem.deleteMany({
      where: { purchaseInvoiceId: invoiceId },
    });

    await db.purchaseInvoice.deleteMany({
      where: { id: invoiceId },
    });
  }

  if (variantId) {
    await db.productVariant.deleteMany({
      where: { id: variantId },
    });
  }

  if (productId) {
    await db.inventoryMovement.deleteMany({
      where: { productId },
    });

    await db.product.deleteMany({
      where: { id: productId },
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
      name: `Phase2 Consignment Supplier ${Date.now()}`,
      isActive: true,
      supportsConsignment: true,
    },
  });

  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      name: `Phase2 Consignment Product ${Date.now()}`,
      price: 250,
      category: "test",
      stock: 7,
      reservedStock: 2,
      averageCost: 81.25,
      lastPurchaseCost: 79.5,
      costPrice: 82,
      trackInventory: true,
      isActive: true,
      supplierId,
    },
  });

  productId = product.id;

  const variant = await db.productVariant.create({
    data: {
      productId,
      size: "M",
      color: "Black",
      sku: `CONS-VAR-${Date.now()}`,
      stock: 3,
      isActive: true,
    },
  });

  variantId = variant.id;

  const invoice = await db.purchaseInvoice.create({
    data: {
      supplierId,
      invoiceNumber: `CONS-INV-${Date.now()}`,
      invoiceDate: new Date(),
      supplyType: "consignment",
      subtotal: 180,
      totalAmount: 180,
      status: "draft",
      items: {
        create: [
          {
            productId,
            variantId,
            description: "Phase 2 consignment test item",
            sku: variant.sku,
            quantity: 2,
            unitCost: 90,
            totalCost: 180,
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

describe("Phase 2 consignment inventory foundation", () => {
  it("creates receipt, lot and RECEIVE movement without mutating owned inventory or accounting", async () => {
    const beforeProduct = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        reservedStock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const beforeInventoryMovementCount = await db.inventoryMovement.count({
      where: { productId },
    });

    const beforeJournalCount = await db.journalEntry.count();

    const result = await createConsignmentReceipt({
      supplierId,
      purchaseInvoiceId: invoiceId,
      referenceNumber,
      notes: "Phase 2 integration test",
      items: [
        {
          productId,
          variantId,
          quantity: 2,
          unitCost: 90,
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result?.supplierId).toBe(supplierId);
    expect(result?.purchaseInvoiceId).toBe(invoiceId);
    expect(result?.status).toBe("posted");
    expect(Number(result?.totalDeclaredCost)).toBe(180);

    expect(result?.lots).toHaveLength(1);

    const lot = result!.lots[0];

    expect(lot.productId).toBe(productId);
    expect(lot.variantId).toBe(variantId);
    expect(lot.quantityReceived).toBe(2);
    expect(lot.quantityAvailable).toBe(2);
    expect(lot.quantitySold).toBe(0);
    expect(lot.quantityReturned).toBe(0);
    expect(Number(lot.unitCost)).toBe(90);
    expect(lot.status).toBe("open");

    expect(lot.movements).toHaveLength(1);

    const movement = lot.movements[0];

    expect(movement.type).toBe("RECEIVE");
    expect(movement.quantityChange).toBe(2);
    expect(movement.quantityBefore).toBe(0);
    expect(movement.quantityAfter).toBe(2);
    expect(Number(movement.unitCost)).toBe(90);
    expect(movement.referenceType).toBe("ConsignmentReceipt");
    expect(movement.referenceId).toBe(result!.id);

    const afterProduct = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        reservedStock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(afterProduct).toEqual(beforeProduct);

    const afterInventoryMovementCount = await db.inventoryMovement.count({
      where: { productId },
    });

    expect(afterInventoryMovementCount).toBe(beforeInventoryMovementCount);

    const afterJournalCount = await db.journalEntry.count();

    expect(afterJournalCount).toBe(beforeJournalCount);
  });

  it("rejects a normal purchase invoice", async () => {
    const invoice = await db.purchaseInvoice.create({
      data: {
        supplierId,
        invoiceNumber: `NORMAL-${Date.now()}`,
        invoiceDate: new Date(),
        supplyType: "purchase",
        subtotal: 90,
        totalAmount: 90,
        status: "draft",
        items: {
          create: [
            {
              productId,
              description: "Normal purchase test",
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
        purchaseInvoiceId: invoice.id,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    ).rejects.toThrow(
      "Consignment receipt can only link to a consignment purchase invoice",
    );

    await db.purchaseInvoiceItem.deleteMany({
      where: { purchaseInvoiceId: invoice.id },
    });

    await db.purchaseInvoice.delete({
      where: { id: invoice.id },
    });
  });
});
