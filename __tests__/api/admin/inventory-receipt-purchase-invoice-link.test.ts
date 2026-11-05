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
  throw new Error("REFUSING: receipt/invoice link tests require fitzone_test");
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

let supplier1Id: string;
let supplier2Id: string;
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

  await db.inventoryMovement.deleteMany({
    where: {
      referenceType: {
        in: ["inventory_receipt", "inventory_receipt_void"],
      },
      referenceId: {
        in: (
          await db.inventoryReceipt.findMany({
            where: {
              referenceNumber: {
                startsWith: "TEST-LINK-R-",
              },
            },
            select: { id: true },
          })
        ).map((x) => x.id),
      },
    },
  });

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: {
        startsWith: "TEST-LINK-R-",
      },
    },
  });

  await db.purchaseInvoiceItem.deleteMany({
    where: {
      purchaseInvoice: {
        invoiceNumber: {
          startsWith: "TEST-LINK-INV-",
        },
      },
    },
  });

  await db.purchaseInvoice.deleteMany({
    where: {
      invoiceNumber: {
        startsWith: "TEST-LINK-INV-",
      },
    },
  });

  await db.product.deleteMany({
    where: {
      name: "Receipt Link Test Product",
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: {
        in: ["TEST-LINK-S1", "TEST-LINK-S2"],
      },
    },
  });
}

async function createInvoice(
  invoiceNumber: string,
  supplierId = supplier1Id,
  total = 100,
) {
  const { createPurchaseInvoiceDraft } =
    await import("@/lib/supplier-ap-service");

  return createPurchaseInvoiceDraft({
    supplierId,
    invoiceNumber,
    invoiceDate: new Date(),
    items: [
      {
        description: invoiceNumber,
        quantity: 1,
        unitCost: total,
      },
    ],
  });
}

async function postReceipt(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/admin/inventory/receipts/route");

  const request = new Request("http://localhost/api/admin/inventory/receipts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const response = await POST(request);
  const json = await response.json();

  return { response, json };
}

beforeAll(async () => {
  await cleanup();

  const s1 = await db.supplier.create({
    data: {
      name: "Receipt Link Supplier 1",
      code: "TEST-LINK-S1",
      isActive: true,
    },
  });

  const s2 = await db.supplier.create({
    data: {
      name: "Receipt Link Supplier 2",
      code: "TEST-LINK-S2",
      isActive: true,
    },
  });

  supplier1Id = s1.id;
  supplier2Id = s2.id;

  const product = await db.product.create({
    data: {
      name: "Receipt Link Test Product",
      price: 1000,
      stock: 0,
      trackInventory: true,
      averageCost: 0,
      costPrice: 0,
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

describe("Inventory receipt -> purchase invoice link", () => {
  it("links a receipt to a draft purchase invoice and derives the supplier from the invoice", async () => {
    const invoice = await createInvoice("TEST-LINK-INV-001", supplier1Id, 100);

    const { response, json } = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: null,
      referenceNumber: "TEST-LINK-R-001",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 100,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    const receipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: {
        id: json.id,
      },
    });

    expect(receipt.purchaseInvoiceId).toBe(invoice.id);
    expect(receipt.supplierId).toBe(supplier1Id);
    expect(receipt.status).toBe("posted");
    expect(receipt.totalCost).toBe(100);
  });

  it("rejects linking a receipt to a posted invoice", async () => {
    const invoice = await createInvoice("TEST-LINK-INV-002", supplier1Id, 100);

    await db.inventoryReceipt.create({
      data: {
        referenceNumber: "TEST-LINK-R-002-PRE",
        supplierId: supplier1Id,
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

    const { postPurchaseInvoice } = await import("@/lib/supplier-ap-service");

    await postPurchaseInvoice(invoice.id);

    const { response, json } = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-002",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 1,
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/المسودة فقط/);
  });

  it("rejects a supplier mismatch", async () => {
    const invoice = await createInvoice("TEST-LINK-INV-003", supplier1Id, 100);

    const { response, json } = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier2Id,
      referenceNumber: "TEST-LINK-R-003",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 100,
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/لا يطابق مورد/);
  });

  it("rejects receipts that would exceed the purchase invoice total", async () => {
    const invoice = await createInvoice("TEST-LINK-INV-004", supplier1Id, 100);

    const first = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-004-A",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 60,
        },
      ],
    });

    expect(first.response.status).toBe(200);

    const second = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-004-B",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 50,
        },
      ],
    });

    expect(second.response.status).toBe(400);
    expect(second.json.error).toMatch(/سيتجاوز قيمة فاتورة المورد/);
  });

  it("allows multiple linked receipts while their total stays within the invoice amount", async () => {
    const invoice = await createInvoice("TEST-LINK-INV-005", supplier1Id, 100);

    const first = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-005-A",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 40,
        },
      ],
    });

    const second = await postReceipt({
      purchaseInvoiceId: invoice.id,
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-005-B",
      items: [
        {
          productId,
          quantity: 1,
          unitCost: 60,
        },
      ],
    });

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);

    const receipts = await db.inventoryReceipt.findMany({
      where: {
        purchaseInvoiceId: invoice.id,
        status: "posted",
      },
    });

    expect(receipts).toHaveLength(2);
    expect(receipts.reduce((sum, receipt) => sum + receipt.totalCost, 0)).toBe(
      100,
    );
  });

  it("keeps standalone inventory receiving working without a purchase invoice link", async () => {
    const before = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
      },
    });

    const { response, json } = await postReceipt({
      supplierId: supplier1Id,
      referenceNumber: "TEST-LINK-R-STANDALONE",
      items: [
        {
          productId,
          quantity: 2,
          unitCost: 25,
        },
      ],
    });

    expect(response.status).toBe(200);

    const receipt = await db.inventoryReceipt.findUniqueOrThrow({
      where: {
        id: json.id,
      },
    });

    expect(receipt.purchaseInvoiceId).toBeNull();

    const after = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
      },
    });

    expect(after.stock).toBe(before.stock + 2);
  });
});
