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
    "REFUSING: inventory receipt AP guard test requires fitzone_test",
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

let supplierId: string;
let productId: string;

async function cleanup() {
  await db.journalEntry.deleteMany({
    where: {
      journal: {
        referenceType: {
          in: ["PurchaseInvoice", "PurchaseInvoiceReversal"],
        },
      },
    },
  });

  await db.journal.deleteMany({
    where: {
      referenceType: {
        in: ["PurchaseInvoice", "PurchaseInvoiceReversal"],
      },
    },
  });

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: {
        startsWith: "TEST-VOID-AP-",
      },
    },
  });

  await db.purchaseInvoiceItem.deleteMany({
    where: {
      purchaseInvoice: {
        invoiceNumber: {
          startsWith: "TEST-VOID-AP-",
        },
      },
    },
  });

  await db.purchaseInvoice.deleteMany({
    where: {
      invoiceNumber: {
        startsWith: "TEST-VOID-AP-",
      },
    },
  });

  await db.product.deleteMany({
    where: {
      name: "Receipt Void AP Guard Product",
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: "TEST-VOID-AP-SUP",
    },
  });
}

beforeAll(async () => {
  await cleanup();

  const supplier = await db.supplier.create({
    data: {
      name: "Receipt Void AP Guard Supplier",
      code: "TEST-VOID-AP-SUP",
      isActive: true,
    },
  });

  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      name: "Receipt Void AP Guard Product",
      price: 100,
      stock: 10,
      trackInventory: true,
      averageCost: 100,
      costPrice: 100,
      lastPurchaseCost: 100,
      isActive: true,
      category: "test",
    },
  });

  productId = product.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Inventory receipt AP linkage guard", () => {
  it("blocks voiding a receipt linked to a posted purchase invoice", async () => {
    const { createPurchaseInvoiceDraft, postPurchaseInvoice } =
      await import("@/lib/supplier-ap-service");

    const invoice = await createPurchaseInvoiceDraft({
      supplierId,
      invoiceNumber: "TEST-VOID-AP-INV-001",
      invoiceDate: new Date(),
      items: [
        {
          description: "Receipt void protection",
          quantity: 1,
          unitCost: 100,
        },
      ],
    });

    const receipt = await db.inventoryReceipt.create({
      data: {
        referenceNumber: "TEST-VOID-AP-R-001",
        supplierId,
        purchaseInvoiceId: invoice.id,
        status: "posted",
        totalCost: 100,
        items: {
          create: [
            {
              productId,
              quantity: 1,
              unitCost: 100,
              totalCost: 100,
            },
          ],
        },
      },
    });

    await postPurchaseInvoice(invoice.id);

    const { PATCH } = await import("@/app/api/admin/inventory/receipts/route");

    const request = new Request(
      "http://localhost/api/admin/inventory/receipts",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: receipt.id,
          action: "void",
        }),
      },
    );

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/فاتورة مورد مرحلة/);

    const savedReceipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: { id: receipt.id },
    });

    expect(savedReceipt.status).toBe("posted");

    const savedProduct = await db.product.findUniqueOrThrow({
      where: { id: productId },
    });

    expect(savedProduct.stock).toBe(10);
    expect(savedProduct.averageCost).toBe(100);

    expect(
      await db.inventoryMovement.count({
        where: {
          referenceType: "inventory_receipt_void",
          referenceId: receipt.id,
        },
      }),
    ).toBe(0);
  });
});
