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
    "REFUSING: Supplier/AP API tests require fitzone_test as fitzone_test_user",
  );
}

const guardState = vi.hoisted(() => ({
  mode: "allowed" as "allowed" | "unauthorized" | "forbidden",
  userId: "supplier-ap-api-admin-placeholder",
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

import {
  DELETE as deleteInvoice,
  GET as getInvoices,
  PATCH as patchInvoice,
  POST as createInvoice,
} from "@/app/api/admin/purchase-invoices/route";

import {
  DELETE as deletePayment,
  GET as getPayments,
  PATCH as patchPayment,
  POST as createPayment,
} from "@/app/api/admin/supplier-payments/route";

const db = new PrismaClient();

let adminId = "";
let supplierId = "";
let testProductId = "";

const journalTypes = [
  "PurchaseInvoice",
  "PurchaseInvoiceReversal",
  "SupplierPayment",
  "SupplierPaymentReversal",
];

async function createLinkedReceipt(invoiceId: string) {
  const invoice = await db.purchaseInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      id: true,
      supplierId: true,
      totalAmount: true,
    },
  });

  const total = Number(invoice.totalAmount);

  return db.inventoryReceipt.create({
    data: {
      referenceNumber: `TEST-API-AP-R-${invoice.id}`,
      supplierId: invoice.supplierId,
      purchaseInvoiceId: invoice.id,
      status: "posted",
      totalCost: total,
      items: {
        create: [
          {
            productId: testProductId,
            quantity: 1,
            unitCost: total,
            totalCost: total,
          },
        ],
      },
    },
  });
}

async function cleanup() {
  await db.journalEntry.deleteMany({
    where: {
      journal: {
        referenceType: {
          in: journalTypes,
        },
      },
    },
  });

  await db.journal.deleteMany({
    where: {
      referenceType: {
        in: journalTypes,
      },
    },
  });

  await db.supplierPaymentAllocation.deleteMany({});
  await db.supplierPayment.deleteMany({});

  await db.inventoryReceipt.deleteMany({
    where: {
      referenceNumber: {
        startsWith: "TEST-API-AP-R-",
      },
    },
  });

  await db.purchaseInvoiceItem.deleteMany({});
  await db.purchaseInvoice.deleteMany({});

  await db.product.deleteMany({
    where: {
      name: "Supplier AP API Receipt Test Product",
    },
  });

  await db.supplier.deleteMany({
    where: {
      code: "TEST-API-AP-SUPPLIER",
    },
  });

  if (adminId) {
    await db.user.deleteMany({
      where: {
        id: adminId,
      },
    });
  }
}

function request(path: string, method: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
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

beforeAll(async () => {
  await db.$connect();
  await cleanup();

  const admin = await db.user.create({
    data: {
      email: `supplier-ap-api-${Date.now()}@test.local`,
      name: "Supplier AP API Test Admin",
      role: "admin",
      adminAccess: true,
    },
  });

  adminId = admin.id;
  guardState.userId = admin.id;

  const supplier = await db.supplier.create({
    data: {
      name: "Supplier AP API Test",
      code: "TEST-API-AP-SUPPLIER",
      isActive: true,
      defaultPaymentTerms: "credit",
    },
  });

  supplierId = supplier.id;

  const product = await db.product.create({
    data: {
      name: "Supplier AP API Receipt Test Product",
      price: 1000,
      category: "test",
      stock: 0,
      reservedStock: 0,
      trackInventory: true,
      averageCost: 0,
      lastPurchaseCost: 0,
      costPrice: 0,
      isActive: true,
      supplierId: supplier.id,
    },
  });

  testProductId = product.id;
});

beforeEach(() => {
  guardState.mode = "allowed";
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("Supplier/AP admin API authorization", () => {
  it("returns 401 when purchase invoices request is unauthorized", async () => {
    guardState.mode = "unauthorized";

    const response = await getInvoices(
      request("/api/admin/purchase-invoices", "GET"),
    );

    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when supplier payments request is forbidden", async () => {
    guardState.mode = "forbidden";

    const response = await getPayments(
      request("/api/admin/supplier-payments", "GET"),
    );

    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("Forbidden");
  });
});

describe("Purchase invoices admin API", () => {
  it("creates, lists and posts a supplier invoice", async () => {
    const createResponse = await createInvoice(
      request("/api/admin/purchase-invoices", "POST", {
        supplierId,
        invoiceNumber: "API-INV-001",
        invoiceDate: "2026-08-29T00:00:00.000Z",
        dueDate: "2026-09-28T00:00:00.000Z",
        paymentTerms: "credit",
        notes: "API integration test",
        items: [
          {
            description: "API test item",
            quantity: 2,
            unitCost: 125,
          },
        ],
      }),
    );

    expect(createResponse.status).toBe(200);

    const created = await createResponse.json();

    expect(created.success).toBe(true);
    expect(created.invoice.status).toBe("draft");
    expect(created.invoice.totalAmount).toBe(250);

    const invoiceId = created.invoice.id as string;

    const savedDraft = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    expect(savedDraft.createdByUserId).toBe(adminId);
    expect(savedDraft.status).toBe("draft");

    const listResponse = await getInvoices(
      request(`/api/admin/purchase-invoices?supplierId=${supplierId}`, "GET"),
    );

    expect(listResponse.status).toBe(200);

    const listBody = await listResponse.json();
    const listed = listBody.invoices.find(
      (row: { id: string }) => row.id === invoiceId,
    );

    expect(listed).toBeDefined();
    expect(listed.totalAmount).toBe(250);
    expect(listed.paidAmount).toBe(0);
    expect(listed.outstandingAmount).toBe(250);
    expect(listed.documentStatus).toBe("draft");
    expect(listed.paymentStatus).toBe("unpaid");

    await createLinkedReceipt(invoiceId);

    const postResponse = await patchInvoice(
      request("/api/admin/purchase-invoices", "PATCH", {
        id: invoiceId,
        action: "post",
      }),
    );

    expect(postResponse.status).toBe(200);

    const postBody = await postResponse.json();

    expect(postBody.success).toBe(true);
    expect(postBody.result.alreadyPosted).toBe(false);
    expect(postBody.balance.documentStatus).toBe("posted");
    expect(postBody.balance.outstandingAmount).toBe(250);

    const savedPosted = await db.purchaseInvoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    expect(savedPosted.status).toBe("posted");
    expect(savedPosted.postedByUserId).toBe(adminId);
    expect(savedPosted.postedAt).not.toBeNull();

    const journal = await db.journal.findUniqueOrThrow({
      where: {
        referenceType_referenceId: {
          referenceType: "PurchaseInvoice",
          referenceId: invoiceId,
        },
      },
    });

    expect(journal.status).toBe("posted");
  });

  it("rejects invalid invoice input with 400", async () => {
    const response = await createInvoice(
      request("/api/admin/purchase-invoices", "POST", {
        supplierId,
        invoiceDate: "not-a-date",
        items: [
          {
            description: "Bad item",
            quantity: 1,
            unitCost: 10,
          },
        ],
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("تاريخ الفاتورة");
  });

  it("rejects unknown invoice action with 400", async () => {
    const response = await patchInvoice(
      request("/api/admin/purchase-invoices", "PATCH", {
        id: "fake-invoice-id",
        action: "unknown",
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("إجراء غير معروف");
  });

  it("blocks direct invoice DELETE with 405", async () => {
    const response = await deleteInvoice();

    expect(response.status).toBe(405);

    const body = await response.json();
    expect(body.error).toContain("الحذف المباشر غير مسموح");
  });
});

describe("Supplier payments admin API", () => {
  it("creates, lists, posts and cancels a supplier payment", async () => {
    const invoiceResponse = await createInvoice(
      request("/api/admin/purchase-invoices", "POST", {
        supplierId,
        invoiceNumber: "API-PAY-INV-001",
        invoiceDate: "2026-08-29T00:00:00.000Z",
        paymentTerms: "credit",
        items: [
          {
            description: "Payment API item",
            quantity: 1,
            unitCost: 300,
          },
        ],
      }),
    );

    const invoiceBody = await invoiceResponse.json();
    const invoiceId = invoiceBody.invoice.id as string;

    await createLinkedReceipt(invoiceId);

    const invoicePost = await patchInvoice(
      request("/api/admin/purchase-invoices", "PATCH", {
        id: invoiceId,
        action: "post",
      }),
    );

    expect(invoicePost.status).toBe(200);

    const paymentResponse = await createPayment(
      request("/api/admin/supplier-payments", "POST", {
        supplierId,
        amount: 125,
        paymentDate: "2026-08-29T12:00:00.000Z",
        paymentMethod: "cash",
        referenceNumber: "PAY-API-001",
        allocations: [
          {
            purchaseInvoiceId: invoiceId,
            amount: 125,
          },
        ],
      }),
    );

    expect(paymentResponse.status).toBe(200);

    const paymentBody = await paymentResponse.json();

    expect(paymentBody.success).toBe(true);
    expect(paymentBody.payment.status).toBe("draft");
    expect(paymentBody.payment.amount).toBe(125);

    const paymentId = paymentBody.payment.id as string;

    const savedDraft = await db.supplierPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    expect(savedDraft.createdByUserId).toBe(adminId);

    const listResponse = await getPayments(
      request(`/api/admin/supplier-payments?supplierId=${supplierId}`, "GET"),
    );

    expect(listResponse.status).toBe(200);

    const listBody = await listResponse.json();
    const listed = listBody.payments.find(
      (row: { id: string }) => row.id === paymentId,
    );

    expect(listed).toBeDefined();
    expect(listed.amount).toBe(125);
    expect(listed.status).toBe("draft");
    expect(listed.allocations).toHaveLength(1);
    expect(listed.allocations[0].purchaseInvoice.id).toBe(invoiceId);

    const postResponse = await patchPayment(
      request("/api/admin/supplier-payments", "PATCH", {
        id: paymentId,
        action: "post",
      }),
    );

    expect(postResponse.status).toBe(200);

    const posted = await db.supplierPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    expect(posted.status).toBe("posted");
    expect(posted.postedByUserId).toBe(adminId);

    const balanceAfterPayment = await db.supplierPaymentAllocation.aggregate({
      where: {
        purchaseInvoiceId: invoiceId,
        supplierPayment: {
          status: "posted",
        },
      },
      _sum: {
        amount: true,
      },
    });

    expect(Number(balanceAfterPayment._sum.amount)).toBe(125);

    const cancelResponse = await patchPayment(
      request("/api/admin/supplier-payments", "PATCH", {
        id: paymentId,
        action: "cancel",
      }),
    );

    expect(cancelResponse.status).toBe(200);

    const cancelled = await db.supplierPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledByUserId).toBe(adminId);

    const originalJournal = await db.journal.findUniqueOrThrow({
      where: {
        referenceType_referenceId: {
          referenceType: "SupplierPayment",
          referenceId: paymentId,
        },
      },
    });

    expect(originalJournal.status).toBe("reversed");

    const reversalJournal = await db.journal.findUniqueOrThrow({
      where: {
        referenceType_referenceId: {
          referenceType: "SupplierPaymentReversal",
          referenceId: paymentId,
        },
      },
    });

    expect(reversalJournal.reversalJournalId).toBe(originalJournal.id);
  });

  it("rejects supplier payment without allocations", async () => {
    const response = await createPayment(
      request("/api/admin/supplier-payments", "POST", {
        supplierId,
        amount: 100,
        paymentDate: "2026-08-29T00:00:00.000Z",
        paymentMethod: "cash",
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("توزيعات الدفعة");
  });

  it("rejects unknown payment action with 400", async () => {
    const response = await patchPayment(
      request("/api/admin/supplier-payments", "PATCH", {
        id: "fake-payment-id",
        action: "unknown",
      }),
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("إجراء غير معروف");
  });

  it("blocks direct payment DELETE with 405", async () => {
    const response = await deletePayment();

    expect(response.status).toBe(405);

    const body = await response.json();
    expect(body.error).toContain("الحذف المباشر غير مسموح");
  });
});
