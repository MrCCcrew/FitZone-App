import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
    "REFUSING: consignment API tests require fitzone_test as fitzone_test_user",
  );
}

const guardState = vi.hoisted(() => ({
  mode: "allowed" as "allowed" | "unauthorized" | "forbidden",
  userId: "consignment-api-admin-placeholder",
}));

vi.mock("@/lib/admin-guard", async () => {
  const { NextResponse } = await import("next/server");

  return {
    requireAdminFeature: vi.fn(async (feature: string) => {
      if (feature !== "inventory") {
        throw new Error(`Unexpected admin feature: ${feature}`);
      }

      if (guardState.mode === "unauthorized") {
        return {
          error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
      }

      if (guardState.mode === "forbidden") {
        return {
          error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        };
      }

      return {
        session: {
          user: {
            id: guardState.userId,
          },
        },
        role: "admin",
        permissions: ["inventory"],
      };
    }),
  };
});

import { GET, POST } from "@/app/api/admin/consignment/receipts/route";

const db = new PrismaClient();

let adminId = "";
let supplierId = "";
let otherSupplierId = "";
let unsupportedSupplierId = "";
let productId = "";
let otherProductId = "";
let variantId = "";
let otherVariantId = "";
let consignmentInvoiceId = "";
let normalInvoiceId = "";

const prefix = `TEST-CONS-API-${Date.now()}`;

function request(method: string, body?: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/consignment/receipts", {
    method,
    headers:
      body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function cleanup() {
  const supplierIds = [
    supplierId,
    otherSupplierId,
    unsupportedSupplierId,
  ].filter(Boolean);

  if (supplierIds.length) {
    await db.consignmentMovement.deleteMany({
      where: { supplierId: { in: supplierIds } },
    });

    await db.consignmentLot.deleteMany({
      where: { supplierId: { in: supplierIds } },
    });

    await db.consignmentReceipt.deleteMany({
      where: { supplierId: { in: supplierIds } },
    });

    await db.purchaseInvoiceItem.deleteMany({
      where: {
        purchaseInvoice: {
          supplierId: { in: supplierIds },
        },
      },
    });

    await db.purchaseInvoice.deleteMany({
      where: { supplierId: { in: supplierIds } },
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

  if (supplierIds.length) {
    await db.supplier.deleteMany({
      where: { id: { in: supplierIds } },
    });
  }

  if (adminId) {
    await db.user.deleteMany({
      where: { id: adminId },
    });
  }
}

beforeAll(async () => {
  await db.$connect();

  const dbName = await db.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  expect(dbName[0]?.db).toBe("fitzone_test");

  const admin = await db.user.create({
    data: {
      email: `${prefix}@test.local`,
      name: "Consignment API Test Admin",
      role: "admin",
      adminAccess: true,
    },
  });

  adminId = admin.id;
  guardState.userId = admin.id;

  const supplier = await db.supplier.create({
    data: {
      name: `${prefix}-SUPPLIER`,
      code: `${prefix}-S1`,
      isActive: true,
      supportsConsignment: true,
    },
  });

  supplierId = supplier.id;

  const otherSupplier = await db.supplier.create({
    data: {
      name: `${prefix}-OTHER-SUPPLIER`,
      code: `${prefix}-S2`,
      isActive: true,
      supportsConsignment: true,
    },
  });

  otherSupplierId = otherSupplier.id;

  const unsupportedSupplier = await db.supplier.create({
    data: {
      name: `${prefix}-UNSUPPORTED`,
      code: `${prefix}-S3`,
      isActive: true,
      supportsConsignment: false,
    },
  });

  unsupportedSupplierId = unsupportedSupplier.id;

  const product = await db.product.create({
    data: {
      name: `${prefix}-PRODUCT`,
      price: 250,
      category: "test",
      stock: 9,
      reservedStock: 2,
      averageCost: 75,
      lastPurchaseCost: 70,
      costPrice: 80,
      trackInventory: true,
      isActive: true,
      supplierId,
    },
  });

  productId = product.id;

  const otherProduct = await db.product.create({
    data: {
      name: `${prefix}-OTHER-PRODUCT`,
      price: 300,
      category: "test",
      stock: 4,
      reservedStock: 0,
      averageCost: 60,
      lastPurchaseCost: 55,
      costPrice: 65,
      trackInventory: true,
      isActive: true,
      supplierId: otherSupplierId,
    },
  });

  otherProductId = otherProduct.id;

  const variant = await db.productVariant.create({
    data: {
      productId,
      size: "M",
      color: "Black",
      sku: `${prefix}-V1`,
      stock: 3,
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
      stock: 2,
      isActive: true,
    },
  });

  otherVariantId = otherVariant.id;

  const consignmentInvoice = await db.purchaseInvoice.create({
    data: {
      supplierId,
      invoiceNumber: `${prefix}-INV-C`,
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
            description: "Consignment API test",
            sku: variant.sku,
            quantity: 2,
            unitCost: 90,
            totalCost: 180,
          },
        ],
      },
    },
  });

  consignmentInvoiceId = consignmentInvoice.id;

  const normalInvoice = await db.purchaseInvoice.create({
    data: {
      supplierId,
      invoiceNumber: `${prefix}-INV-P`,
      invoiceDate: new Date(),
      supplyType: "purchase",
      subtotal: 90,
      totalAmount: 90,
      status: "draft",
      items: {
        create: [
          {
            productId,
            description: "Normal purchase",
            quantity: 1,
            unitCost: 90,
            totalCost: 90,
          },
        ],
      },
    },
  });

  normalInvoiceId = normalInvoice.id;
});

beforeEach(() => {
  guardState.mode = "allowed";
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Consignment receipts admin API authorization", () => {
  it("returns 401 for unauthorized GET", async () => {
    guardState.mode = "unauthorized";

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns 403 for forbidden POST", async () => {
    guardState.mode = "forbidden";

    const response = await POST(
      request("POST", {
        supplierId,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("Consignment receipts admin API", () => {
  it("creates and lists a consignment receipt without touching owned inventory or accounting", async () => {
    const beforeProduct = await db.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stock: true,
        reservedStock: true,
        averageCost: true,
        lastPurchaseCost: true,
      },
    });

    const beforeInventoryMovements = await db.inventoryMovement.count({
      where: { productId },
    });

    const beforeConsignmentJournals = await db.journal.count({
      where: {
        referenceType: "ConsignmentReceipt",
      },
    });

    const referenceNumber = `${prefix}-R1`;

    const response = await POST(
      request("POST", {
        supplierId,
        purchaseInvoiceId: consignmentInvoiceId,
        referenceNumber,
        notes: "API integration test",
        items: [
          {
            productId,
            variantId,
            quantity: 2,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(200);

    const created = await response.json();

    expect(created.success).toBe(true);
    expect(created.id).toBeTruthy();

    const saved = await db.consignmentReceipt.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        lots: {
          include: {
            movements: true,
          },
        },
      },
    });

    expect(saved.supplierId).toBe(supplierId);
    expect(saved.purchaseInvoiceId).toBe(consignmentInvoiceId);
    expect(saved.status).toBe("posted");
    expect(Number(saved.totalDeclaredCost)).toBe(180);
    expect(saved.lots).toHaveLength(1);

    expect(saved.lots[0].quantityReceived).toBe(2);
    expect(saved.lots[0].quantityAvailable).toBe(2);
    expect(saved.lots[0].quantitySold).toBe(0);
    expect(saved.lots[0].quantityReturned).toBe(0);

    expect(saved.lots[0].movements).toHaveLength(1);
    expect(saved.lots[0].movements[0].type).toBe("RECEIVE");

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

    expect(
      await db.inventoryMovement.count({
        where: { productId },
      }),
    ).toBe(beforeInventoryMovements);

    expect(
      await db.journal.count({
        where: {
          referenceType: "ConsignmentReceipt",
        },
      }),
    ).toBe(beforeConsignmentJournals);

    const listResponse = await GET();

    expect(listResponse.status).toBe(200);

    const rows = await listResponse.json();

    const listed = rows.find((row: { id: string }) => row.id === created.id);

    expect(listed).toBeDefined();
    expect(listed.supplierId).toBe(supplierId);
    expect(listed.lots).toHaveLength(1);
    expect(listed.lots[0].quantityAvailable).toBe(2);
  });

  it("rejects supplier not enabled for consignment", async () => {
    const response = await POST(
      request("POST", {
        supplierId: unsupportedSupplierId,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain("not enabled for consignment");
  });

  it("rejects normal purchase invoice", async () => {
    const response = await POST(
      request("POST", {
        supplierId,
        purchaseInvoiceId: normalInvoiceId,
        items: [
          {
            productId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain(
      "can only link to a consignment purchase invoice",
    );
  });

  it("rejects product belonging to another supplier", async () => {
    const response = await POST(
      request("POST", {
        supplierId,
        items: [
          {
            productId: otherProductId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain("does not belong to the selected supplier");
  });

  it("rejects variant belonging to another product", async () => {
    const response = await POST(
      request("POST", {
        supplierId,
        items: [
          {
            productId,
            variantId: otherVariantId,
            quantity: 1,
            unitCost: 90,
          },
        ],
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain("Selected variant does not belong to product");
  });
});
