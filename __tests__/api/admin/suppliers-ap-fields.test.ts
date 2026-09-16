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
    "REFUSING: supplier API tests require fitzone_test as fitzone_test_user",
  );
}

const guardState = vi.hoisted(() => ({
  mode: "allowed" as "allowed" | "unauthorized" | "forbidden",
  userId: "supplier-api-test-admin",
}));

vi.mock("@/lib/admin-guard", async () => {
  const { NextResponse } = await import("next/server");

  return {
    requireAdminFeature: vi.fn(async (feature: string) => {
      if (feature !== "inventory") {
        throw new Error(`Unexpected feature: ${feature}`);
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

import { DELETE, GET, PATCH, POST } from "@/app/api/admin/suppliers/route";

const db = new PrismaClient();

let createdIds: string[] = [];

function request(method: string, body?: Record<string, unknown>, query = "") {
  return new Request(`http://localhost/api/admin/suppliers${query}`, {
    method,
    headers:
      body === undefined
        ? undefined
        : {
            "content-type": "application/json",
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function cleanup() {
  if (createdIds.length) {
    await db.supplierPaymentAllocation.deleteMany({
      where: {
        supplierPayment: {
          supplierId: { in: createdIds },
        },
      },
    });

    await db.supplierPayment.deleteMany({
      where: {
        supplierId: { in: createdIds },
      },
    });

    await db.purchaseInvoiceItem.deleteMany({
      where: {
        purchaseInvoice: {
          supplierId: { in: createdIds },
        },
      },
    });

    await db.purchaseInvoice.deleteMany({
      where: {
        supplierId: { in: createdIds },
      },
    });

    await db.product.updateMany({
      where: {
        supplierId: { in: createdIds },
      },
      data: {
        supplierId: null,
      },
    });

    await db.supplier.deleteMany({
      where: {
        id: { in: createdIds },
      },
    });
  }

  createdIds = [];

  await db.supplier.deleteMany({
    where: {
      code: {
        startsWith: "TEST-SUP-API-",
      },
    },
  });
}

beforeAll(async () => {
  await db.$connect();
  await cleanup();
});

beforeEach(() => {
  guardState.mode = "allowed";
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Supplier API — commercial/AP fields", () => {
  it("creates supplier with all new commercial fields", async () => {
    const response = await POST(
      request("POST", {
        name: "Supplier Commercial Test",
        code: "TEST-SUP-API-001",
        phone: "01000000000",
        defaultPaymentTerms: "credit",
        creditDays: 30,
        creditLimit: 25000.5,
        supportsConsignment: true,
        supportsPrivateLabel: true,
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    const supplier = body.supplier;

    createdIds.push(supplier.id);

    expect(supplier.code).toBe("TEST-SUP-API-001");
    expect(supplier.defaultPaymentTerms).toBe("credit");
    expect(supplier.creditDays).toBe(30);
    expect(supplier.creditLimit).toBe(25000.5);
    expect(supplier.supportsConsignment).toBe(true);
    expect(supplier.supportsPrivateLabel).toBe(true);

    const saved = await db.supplier.findUniqueOrThrow({
      where: { id: supplier.id },
    });

    expect(saved.code).toBe("TEST-SUP-API-001");
    expect(saved.defaultPaymentTerms).toBe("credit");
    expect(saved.creditDays).toBe(30);
    expect(Number(saved.creditLimit)).toBe(25000.5);
    expect(saved.supportsConsignment).toBe(true);
    expect(saved.supportsPrivateLabel).toBe(true);
  });

  it("updates new supplier fields without losing supplier identity", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Supplier Update Test",
        code: "TEST-SUP-API-002",
        isActive: true,
      },
    });

    createdIds.push(supplier.id);

    const response = await POST(
      request("POST", {
        id: supplier.id,
        name: "Supplier Update Test",
        code: "TEST-SUP-API-002",
        defaultPaymentTerms: "mixed",
        creditDays: 45,
        creditLimit: 50000,
        supportsConsignment: false,
        supportsPrivateLabel: true,
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.supplier.id).toBe(supplier.id);
    expect(body.supplier.defaultPaymentTerms).toBe("mixed");
    expect(body.supplier.creditDays).toBe(45);
    expect(body.supplier.creditLimit).toBe(50000);
    expect(body.supplier.supportsPrivateLabel).toBe(true);
  });

  it("lists the new supplier fields in GET", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Supplier GET Test",
        code: "TEST-SUP-API-003",
        defaultPaymentTerms: "cash",
        creditDays: 0,
        creditLimit: 1000,
        supportsConsignment: true,
        supportsPrivateLabel: false,
      },
    });

    createdIds.push(supplier.id);

    const response = await GET(request("GET"));

    expect(response.status).toBe(200);

    const body = await response.json();

    const row = body.suppliers.find(
      (item: { id: string }) => item.id === supplier.id,
    );

    expect(row).toBeDefined();
    expect(row.code).toBe("TEST-SUP-API-003");
    expect(row.defaultPaymentTerms).toBe("cash");
    expect(row.creditDays).toBe(0);
    expect(row.creditLimit).toBe(1000);
    expect(row.supportsConsignment).toBe(true);
    expect(row.supportsPrivateLabel).toBe(false);
  });

  it("blocks supplier deletion when purchase invoices exist", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Supplier Invoice Delete Guard",
        code: "TEST-SUP-API-004",
        isActive: true,
      },
    });

    createdIds.push(supplier.id);

    await db.purchaseInvoice.create({
      data: {
        supplierId: supplier.id,
        invoiceNumber: "DELETE-GUARD-INV",
        invoiceDate: new Date(),
        subtotal: 100,
        totalAmount: 100,
        status: "draft",
      },
    });

    const response = await DELETE(
      request("DELETE", undefined, `?id=${supplier.id}`),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain("مستندات مالية");

    const stillExists = await db.supplier.findUnique({
      where: {
        id: supplier.id,
      },
    });

    expect(stillExists).not.toBeNull();
    expect(stillExists?.deletedAt).toBeNull();
  });

  it("blocks supplier deletion when supplier payments exist", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Supplier Payment Delete Guard",
        code: "TEST-SUP-API-005",
        isActive: true,
      },
    });

    createdIds.push(supplier.id);

    await db.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        amount: 50,
        paymentDate: new Date(),
        paymentMethod: "cash",
        status: "draft",
      },
    });

    const response = await DELETE(
      request("DELETE", undefined, `?id=${supplier.id}`),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toContain("مستندات مالية");

    const saved = await db.supplier.findUniqueOrThrow({
      where: {
        id: supplier.id,
      },
    });

    expect(saved.deletedAt).toBeNull();
    expect(saved.isActive).toBe(true);
  });

  it("soft deletes supplier with no financial documents", async () => {
    const supplier = await db.supplier.create({
      data: {
        name: "Supplier Safe Delete",
        code: "TEST-SUP-API-006",
        isActive: true,
      },
    });

    createdIds.push(supplier.id);

    const response = await DELETE(
      request("DELETE", undefined, `?id=${supplier.id}`),
    );

    expect(response.status).toBe(200);

    const saved = await db.supplier.findUniqueOrThrow({
      where: {
        id: supplier.id,
      },
    });

    expect(saved.isActive).toBe(false);
    expect(saved.deletedAt).not.toBeNull();
  });

  it("returns 401 when unauthorized", async () => {
    guardState.mode = "unauthorized";

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when forbidden", async () => {
    guardState.mode = "forbidden";

    const response = await PATCH(
      request("PATCH", {
        id: "fake",
        isActive: false,
      }),
    );

    expect(response.status).toBe(403);
  });
});

describe("Supplier API — validation", () => {
  it("rejects invalid payment terms", async () => {
    const response = await POST(
      request("POST", {
        name: "Invalid Terms Supplier",
        code: "TEST-SUP-API-VAL-001",
        defaultPaymentTerms: "later",
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("شروط السداد");
  });

  it("rejects non-numeric creditDays", async () => {
    const response = await POST(
      request("POST", {
        name: "Invalid Credit Days",
        code: "TEST-SUP-API-VAL-002",
        creditDays: "abc" as unknown as number,
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("أيام الائتمان");
  });

  it("rejects fractional creditDays", async () => {
    const response = await POST(
      request("POST", {
        name: "Fractional Credit Days",
        code: "TEST-SUP-API-VAL-003",
        creditDays: 10.5,
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("أيام الائتمان");
  });

  it("rejects negative creditDays", async () => {
    const response = await POST(
      request("POST", {
        name: "Negative Credit Days",
        code: "TEST-SUP-API-VAL-004",
        creditDays: -1,
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("أيام الائتمان");
  });

  it("rejects invalid or negative creditLimit", async () => {
    for (const creditLimit of [-1, "abc" as unknown as number]) {
      const response = await POST(
        request("POST", {
          name: "Invalid Credit Limit",
          code: `TEST-SUP-API-VAL-${String(creditLimit)}`,
          creditLimit,
        }),
      );

      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain("حد الائتمان");
    }
  });
});
