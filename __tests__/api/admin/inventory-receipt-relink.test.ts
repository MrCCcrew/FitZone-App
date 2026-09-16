import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error("REFUSING: receipt relink API tests require fitzone_test");
}

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    session: {
      user: {
        id: null,
        role: "admin",
      },
    },
  })),
}));

const db = new PrismaClient();

const PREFIX = "TEST-RELINK-API-";

let supplierId: string;
let productId: string;

async function cleanup() {
  await db.auditLog.deleteMany({
    where: {
      action: "relink_inventory_receipt_purchase_invoice",
      targetType: "InventoryReceipt",
    },
  });

  await db.inventoryReceiptInvoiceLinkHistory.deleteMany({
    where: {
      receipt: {
        referenceNumber: {
          startsWith: PREFIX,
        },
      },
    },
  });

  const receipts = await db.inventoryReceipt.findMany({
    where: {
      referenceNumber: {
        startsWith: PREFIX,
      },
    },
    select: { id: true },
  });

  const receiptIds = receipts.map((x) => x.id);

  if (receiptIds.length) {
    await db.inventoryMovement.deleteMany({
      where: {
        referenceId: {
          in: receiptIds,
        },
      },
    });
  }

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: {
        startsWith: PREFIX,
      },
    },
  });

  const invoices = await db.purchaseInvoice.findMany({
    where: {
      invoiceNumber: {
        startsWith: PREFIX,
      },
    },
    select: { id: true },
  });

  const invoiceIds = invoices.map((x) => x.id);

  if (invoiceIds.length) {
    await db.journalEntry.deleteMany({
      where: {
        journal: {
          referenceId: {
            in: invoiceIds,
          },
        },
      },
    });

    await db.journal.deleteMany({
      where: {
        referenceId: {
          in: invoiceIds,
        },
      },
    });
  }

  await db.purchaseInvoiceItem.deleteMany({
    where: {
      purchaseInvoice: {
        invoiceNumber: {
          startsWith: PREFIX,
        },
      },
    },
  });

  await db.purchaseInvoice.deleteMany({
    where: {
      invoiceNumber: {
        startsWith: PREFIX,
      },
    },
  });

  await db.product.deleteMany({
    where: {
      name: `${PREFIX}PRODUCT`,
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: `${PREFIX}SUP`,
    },
  });
}

beforeAll(async () => {
  await cleanup();

  const supplier = await db.supplier.create({
    data: {
      name: "Relink API Supplier",
      code: `${PREFIX}SUP`,
      isActive: true,
    },
  });

  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      name: `${PREFIX}PRODUCT`,
      category: "test",
      price: 500,
      stock: 5,
      trackInventory: true,
      averageCost: 33,
      costPrice: 33,
      lastPurchaseCost: 50,
      isActive: true,
    },
  });

  productId = product.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

async function createInvoice(number: string, total: number) {
  const { createPurchaseInvoiceDraft } =
    await import("@/lib/supplier-ap-service");

  return createPurchaseInvoiceDraft({
    supplierId,
    invoiceNumber: number,
    invoiceDate: new Date(),
    items: [
      {
        description: number,
        quantity: 1,
        unitCost: total,
      },
    ],
  });
}

async function createReceipt(invoiceId: string, number: string, total: number) {
  return db.inventoryReceipt.create({
    data: {
      referenceNumber: number,
      purchaseInvoiceId: invoiceId,
      supplierId,
      status: "posted",
      totalCost: total,
      items: {
        create: [
          {
            productId,
            quantity: 1,
            unitCost: total,
            totalCost: total,
          },
        ],
      },
    },
  });
}

describe("PATCH inventory receipt relink API", () => {
  it("relinks a receipt and writes history + audit without inventory/accounting mutation", async () => {
    const { postPurchaseInvoice, cancelPurchaseInvoice } =
      await import("@/lib/supplier-ap-service");

    const { PATCH } = await import("@/app/api/admin/inventory/receipts/route");

    const oldInvoice = await createInvoice(`${PREFIX}OLD-001`, 100);

    const receipt = await createReceipt(oldInvoice.id, `${PREFIX}R-001`, 100);

    await postPurchaseInvoice(oldInvoice.id);
    await cancelPurchaseInvoice(oldInvoice.id);

    const newInvoice = await createInvoice(`${PREFIX}NEW-001`, 100);

    const productBefore = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const movementCountBefore = await db.inventoryMovement.count({
      where: { productId },
    });

    const journalCountBefore = await db.journal.count({});

    const response = await PATCH(
      new Request("http://localhost/api/admin/inventory/receipts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: receipt.id,
          action: "relink_purchase_invoice",
          newPurchaseInvoiceId: newInvoice.id,
          reason: "API relink test correction",
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.result.fromPurchaseInvoiceId).toBe(oldInvoice.id);
    expect(body.result.toPurchaseInvoiceId).toBe(newInvoice.id);

    const savedReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    expect(savedReceipt.purchaseInvoiceId).toBe(newInvoice.id);

    const history =
      await db.inventoryReceiptInvoiceLinkHistory.findFirstOrThrow({
        where: {
          receiptId: receipt.id,
          fromPurchaseInvoiceId: oldInvoice.id,
          toPurchaseInvoiceId: newInvoice.id,
        },
      });

    expect(history.reason).toBe("API relink test correction");

    const audit = await db.auditLog.findFirst({
      where: {
        action: "relink_inventory_receipt_purchase_invoice",
        targetType: "InventoryReceipt",
        targetId: receipt.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    expect(audit).not.toBeNull();

    const details = JSON.parse(audit!.details ?? "{}");

    expect(details.oldPurchaseInvoiceId).toBe(oldInvoice.id);
    expect(details.newPurchaseInvoiceId).toBe(newInvoice.id);
    expect(details.historyId).toBe(history.id);
    expect(details.reason).toBe("API relink test correction");

    const productAfter = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    expect(productAfter).toEqual(productBefore);

    expect(
      await db.inventoryMovement.count({
        where: { productId },
      }),
    ).toBe(movementCountBefore);

    expect(await db.journal.count({})).toBe(journalCountBefore);
  });

  it("rejects missing target invoice", async () => {
    const { PATCH } = await import("@/app/api/admin/inventory/receipts/route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/inventory/receipts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: "x",
          action: "relink_purchase_invoice",
          reason: "test",
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/فاتورة المورد الجديدة مطلوبة/);
  });

  it("rejects missing reason", async () => {
    const { PATCH } = await import("@/app/api/admin/inventory/receipts/route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/inventory/receipts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: "x",
          action: "relink_purchase_invoice",
          newPurchaseInvoiceId: "y",
          reason: "   ",
        }),
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/سبب تغيير الربط مطلوب/);
  });
});
