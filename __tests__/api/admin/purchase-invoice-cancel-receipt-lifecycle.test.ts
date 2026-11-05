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
  throw new Error(
    "REFUSING: cancellation lifecycle test requires fitzone_test",
  );
}

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    session: {
      user: {
        id: "test-admin",
      },
    },
  })),
}));

const db = new PrismaClient();

const SUPPLIER_CODE = "TEST-CANCEL-LIFE-SUP";
const PRODUCT_NAME = "Cancel Lifecycle Product";
const INVOICE_NUMBER = "TEST-CANCEL-LIFE-INV";
const RECEIPT_NUMBER = "TEST-CANCEL-LIFE-R";

async function cleanup() {
  const receipts = await db.inventoryReceipt.findMany({
    where: {
      referenceNumber: RECEIPT_NUMBER,
    },
    select: {
      id: true,
    },
  });

  const receiptIds = receipts.map((x) => x.id);

  if (receiptIds.length > 0) {
    await db.inventoryMovement.deleteMany({
      where: {
        referenceId: {
          in: receiptIds,
        },
      },
    });
  }

  const invoices = await db.purchaseInvoice.findMany({
    where: {
      invoiceNumber: INVOICE_NUMBER,
    },
    select: {
      id: true,
    },
  });

  const invoiceIds = invoices.map((x) => x.id);

  if (invoiceIds.length > 0) {
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

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: RECEIPT_NUMBER,
    },
  });

  await db.purchaseInvoiceItem.deleteMany({
    where: {
      purchaseInvoice: {
        invoiceNumber: INVOICE_NUMBER,
      },
    },
  });

  await db.purchaseInvoice.deleteMany({
    where: {
      invoiceNumber: INVOICE_NUMBER,
    },
  });

  await db.product.deleteMany({
    where: {
      name: PRODUCT_NAME,
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: SUPPLIER_CODE,
    },
  });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Purchase invoice cancellation -> receipt lifecycle", () => {
  it("reverses financial invoice, keeps stock, then allows receipt void", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Cancellation Lifecycle Supplier",
        code: SUPPLIER_CODE,
        isActive: true,
      },
    });

    const product = await db.product.create({
      data: {
        name: PRODUCT_NAME,
        category: "test",
        price: 200,
        stock: 0,
        trackInventory: true,
        averageCost: 0,
        costPrice: 0,
        isActive: true,
      },
    });

    const {
      createPurchaseInvoiceDraft,
      postPurchaseInvoice,
      cancelPurchaseInvoice,
    } = await import("@/lib/supplier-ap-service");

    const invoice = await createPurchaseInvoiceDraft({
      supplierId: supplier.id,
      invoiceNumber: INVOICE_NUMBER,
      invoiceDate: new Date(),
      items: [
        {
          description: "Cancellation lifecycle",
          quantity: 2,
          unitCost: 50,
        },
      ],
    });

    const { POST, PATCH } =
      await import("@/app/api/admin/inventory/receipts/route");

    const receiptResponse = await POST(
      new Request("http://localhost/api/admin/inventory/receipts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          purchaseInvoiceId: invoice.id,
          supplierId: supplier.id,
          referenceNumber: RECEIPT_NUMBER,
          items: [
            {
              productId: product.id,
              quantity: 2,
              unitCost: 50,
            },
          ],
        }),
      }),
    );

    const receiptBody = await receiptResponse.json();

    expect(receiptResponse.status).toBe(200);

    const receiptId = receiptBody.id as string;

    await postPurchaseInvoice(invoice.id);

    const beforeCancelProduct = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(beforeCancelProduct.stock).toBe(2);
    expect(Number(beforeCancelProduct.averageCost)).toBe(50);

    await cancelPurchaseInvoice(invoice.id);

    const cancelledInvoice = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });

    expect(cancelledInvoice.status).toBe("cancelled");

    const afterCancelReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receiptId },
    });

    expect(afterCancelReceipt.status).toBe("posted");
    expect(afterCancelReceipt.purchaseInvoiceId).toBe(invoice.id);

    const afterCancelProduct = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    // Financial cancellation must not touch inventory.
    expect(afterCancelProduct.stock).toBe(2);
    expect(Number(afterCancelProduct.averageCost)).toBe(50);

    const originalJournal = await db.journal.findUniqueOrThrow({
      where: {
        referenceType_referenceId: {
          referenceType: "PurchaseInvoice",
          referenceId: invoice.id,
        },
      },
    });

    expect(originalJournal.status).toBe("reversed");

    const reversalJournal = await db.journal.findUniqueOrThrow({
      where: {
        referenceType_referenceId: {
          referenceType: "PurchaseInvoiceReversal",
          referenceId: invoice.id,
        },
      },
    });

    expect(reversalJournal.status).toBe("posted");

    const voidResponse = await PATCH(
      new Request("http://localhost/api/admin/inventory/receipts", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: receiptId,
          action: "void",
        }),
      }),
    );

    const voidBody = await voidResponse.json();

    expect(voidResponse.status).toBe(200);
    expect(voidBody.success).toBe(true);

    const finalReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receiptId },
    });

    expect(finalReceipt.status).toBe("cancelled");

    const finalProduct = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(finalProduct.stock).toBe(0);

    expect(
      await db.inventoryMovement.count({
        where: {
          referenceType: "inventory_receipt_void",
          referenceId: receiptId,
        },
      }),
    ).toBe(1);
  });
});
