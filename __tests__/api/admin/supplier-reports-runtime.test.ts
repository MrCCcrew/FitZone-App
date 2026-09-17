import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),

  supplierFindMany: vi.fn(),
  supplierFindUnique: vi.fn(),

  purchaseInvoiceFindMany: vi.fn(),

  supplierPaymentAllocationFindMany: vi.fn(),

  liabilityFindMany: vi.fn(),

  supplierPaymentFindMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
}));

vi.mock("@/lib/db", () => ({
  db: {
    supplier: {
      findMany: mocks.supplierFindMany,
      findUnique: mocks.supplierFindUnique,
    },

    purchaseInvoice: {
      findMany: mocks.purchaseInvoiceFindMany,
    },

    supplierPaymentAllocation: {
      findMany: mocks.supplierPaymentAllocationFindMany,
    },

    consignmentSupplierLiability: {
      findMany: mocks.liabilityFindMany,
    },

    supplierPayment: {
      findMany: mocks.supplierPaymentFindMany,
    },
  },
}));

import { GET } from "@/app/api/admin/supplier-reports/route";

describe("supplier reports runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireAdminFeature.mockResolvedValue({
      role: "admin",
      permissions: ["inventory"],
    });

    mocks.supplierFindMany.mockResolvedValue([]);
    mocks.supplierFindUnique.mockResolvedValue(null);

    mocks.purchaseInvoiceFindMany.mockResolvedValue([]);

    mocks.supplierPaymentAllocationFindMany.mockResolvedValue([]);

    mocks.liabilityFindMany.mockResolvedValue([]);

    mocks.supplierPaymentFindMany.mockResolvedValue([]);
  });

  it("returns the admin guard response without querying accounting data", async () => {
    mocks.requireAdminFeature.mockResolvedValueOnce({
      error: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/supplier-reports?mode=balances",
      ),
    );

    expect(response.status).toBe(403);

    expect(
      mocks.supplierFindMany,
    ).not.toHaveBeenCalled();

    expect(
      mocks.purchaseInvoiceFindMany,
    ).not.toHaveBeenCalled();
  });

  it("calculates complete supplier balances and preserves credits", async () => {
    mocks.supplierFindMany.mockResolvedValue([
      {
        id: "s1",
        name: "Supplier Active",
        code: "S001",
        isActive: true,
        deletedAt: null,
      },
      {
        id: "s2",
        name: "Supplier Inactive",
        code: "S002",
        isActive: false,
        deletedAt: null,
      },
      {
        id: "s3",
        name: "Supplier Deleted Balance",
        code: "S003",
        isActive: false,
        deletedAt: new Date("2026-09-01T12:00:00Z"),
      },
      {
        id: "s4",
        name: "Supplier Deleted Zero",
        code: "S004",
        isActive: false,
        deletedAt: new Date("2026-09-01T12:00:00Z"),
      },
    ]);

    mocks.purchaseInvoiceFindMany.mockResolvedValue([
      {
        id: "i1",
        supplierId: "s1",
        totalAmount: 100,
        status: "posted",
      },
      {
        id: "i2",
        supplierId: "s2",
        totalAmount: 50,
        status: "posted",
      },
      {
        id: "i3",
        supplierId: "s3",
        totalAmount: 20,
        status: "posted",
      },
      {
        id: "i4",
        supplierId: "s4",
        totalAmount: 75,
        status: "cancelled",
      },
    ]);

    mocks.supplierPaymentAllocationFindMany.mockResolvedValue([
      {
        purchaseInvoiceId: "i1",
        amount: 40,
      },
      {
        purchaseInvoiceId: "i2",
        amount: 10,
      },
      {
        purchaseInvoiceId: "i3",
        amount: 20,
      },
    ]);

    mocks.liabilityFindMany.mockResolvedValue([
      {
        supplierId: "s1",
        grossAmount: 30,
        paidAmount: 10,
        reversedAmount: 0,
      },
      {
        supplierId: "s2",
        grossAmount: 10,
        paidAmount: 0,
        reversedAmount: 15,
      },
      {
        supplierId: "s3",
        grossAmount: 12,
        paidAmount: 0,
        reversedAmount: 0,
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/supplier-reports?mode=balances",
      ),
    );

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload.balances).toEqual([
      {
        supplierId: "s1",
        supplierName: "Supplier Active",
        supplierCode: "S001",
        isActive: true,
        isDeleted: false,
        invoiceOutstanding: 60,
        consignmentOutstanding: 20,
        totalOutstanding: 80,
      },
      {
        supplierId: "s2",
        supplierName: "Supplier Inactive",
        supplierCode: "S002",
        isActive: false,
        isDeleted: false,
        invoiceOutstanding: 40,
        consignmentOutstanding: -5,
        totalOutstanding: 35,
      },
      {
        supplierId: "s3",
        supplierName: "Supplier Deleted Balance",
        supplierCode: "S003",
        isActive: false,
        isDeleted: true,
        invoiceOutstanding: 0,
        consignmentOutstanding: 12,
        totalOutstanding: 12,
      },
    ]);

    expect(
      payload.balances.some(
        (row: { supplierId: string }) =>
          row.supplierId === "s4",
      ),
    ).toBe(false);

    expect(
      payload.statementSuppliers.map(
        (row: { supplierId: string }) => row.supplierId,
      ),
    ).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("reconstructs opening, activity, cancellations, and closing balance", async () => {
    mocks.supplierFindUnique.mockResolvedValue({
      id: "s1",
      name: "Supplier One",
      code: "S001",
      isActive: true,
      deletedAt: null,
    });

    mocks.purchaseInvoiceFindMany.mockResolvedValue([
      {
        id: "invoice-old",
        invoiceNumber: "OLD-1",
        totalAmount: 100,
        status: "posted",
        postedAt: new Date(
          "2026-09-01T12:00:00Z",
        ),
        cancelledAt: null,
      },
      {
        id: "invoice-range",
        invoiceNumber: "INV-2",
        totalAmount: 50,
        status: "cancelled",
        postedAt: new Date(
          "2026-09-12T12:00:00Z",
        ),
        cancelledAt: new Date(
          "2026-09-15T12:00:00Z",
        ),
      },
    ]);

    mocks.liabilityFindMany.mockResolvedValue([
      {
        id: "liability-1",
        orderId: "order-12345678",
        grossAmount: 30,
        reversedAmount: 10,
        source: "sale",
        createdAt: new Date(
          "2026-09-13T12:00:00Z",
        ),
        reversedAt: new Date(
          "2026-09-16T12:00:00Z",
        ),
      },
    ]);

    mocks.supplierPaymentFindMany.mockResolvedValue([
      {
        id: "payment-old",
        amount: 20,
        paymentDate: new Date(
          "2026-09-05T12:00:00Z",
        ),
        referenceNumber: "PAY-OLD",
        status: "posted",
        postedAt: new Date(
          "2026-09-05T12:00:00Z",
        ),
        cancelledAt: null,
      },
      {
        id: "payment-range",
        amount: 25,
        paymentDate: new Date(
          "2026-09-14T12:00:00Z",
        ),
        referenceNumber: "PAY-2",
        status: "cancelled",
        postedAt: new Date(
          "2026-09-14T12:00:00Z",
        ),
        cancelledAt: new Date(
          "2026-09-17T12:00:00Z",
        ),
      },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/supplier-reports" +
          "?mode=statement" +
          "&supplierId=s1" +
          "&from=2026-09-10" +
          "&to=2026-09-17",
      ),
    );

    expect(response.status).toBe(200);

    const payload = await response.json();
    const statement = payload.statement;

    expect(statement.supplier).toEqual({
      id: "s1",
      name: "Supplier One",
      code: "S001",
      isActive: true,
      isDeleted: false,
    });

    expect(statement.openingBalance).toBe(80);

    expect(statement.debitTotal).toBe(105);
    expect(statement.creditTotal).toBe(85);

    expect(statement.closingBalance).toBe(100);

    expect(statement.entries).toHaveLength(6);

    expect(
      statement.entries.map(
        (entry: { type: string }) => entry.type,
      ),
    ).toEqual([
      "فاتورة مشتريات",
      "استحقاق أمانات",
      "سداد مورد",
      "إلغاء فاتورة",
      "عكس استحقاق",
      "إلغاء سداد",
    ]);

    expect(
      statement.entries.at(-1)?.balance,
    ).toBe(100);
  });

  it("rejects invalid statement ranges before querying statement data", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/supplier-reports" +
          "?mode=statement" +
          "&supplierId=s1" +
          "&from=2026-09-20" +
          "&to=2026-09-10",
      ),
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error).toBe(
      "تاريخ البداية يجب ألا يكون بعد تاريخ النهاية",
    );

    expect(
      mocks.supplierFindUnique,
    ).not.toHaveBeenCalled();
  });
});