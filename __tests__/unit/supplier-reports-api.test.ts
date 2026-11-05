import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/app/api/admin/supplier-reports/route.ts",
  "utf8",
);

describe("Supplier reports API contract", () => {
  it("is protected by the inventory admin feature guard", () => {
    expect(source).toContain(
      'requireAdminFeature("inventory")',
    );
  });

  it("does not cap supplier accounting reports with take pagination", () => {
    expect(source).not.toMatch(/\btake\s*:/);
  });

  it("calculates invoice balances only from posted supplier payments", () => {
    expect(source).toContain(
      "db.supplierPaymentAllocation.findMany",
    );
    expect(source).toContain(
      'status: "posted"',
    );
    expect(source).toContain(
      "invoiceOutstandingBySupplier",
    );
  });

  it("includes consignment liabilities including supplier credits", () => {
    expect(source).toContain(
      "db.consignmentSupplierLiability.findMany",
    );
    expect(source).toContain(
      "toMinor(liability.grossAmount) -",
    );
    expect(source).toContain(
      "toMinor(liability.paidAmount) -",
    );
    expect(source).toContain(
      "toMinor(liability.reversedAmount)",
    );
  });

  it("does not hide inactive suppliers from accounting balances", () => {
    expect(source).toContain(
      "isActive: supplier.isActive",
    );
    expect(source).not.toContain(
      "supplier.isActive &&",
    );
  });

  it("keeps deleted suppliers visible when a balance still exists", () => {
    expect(source).toContain(
      "!row.isDeleted ||",
    );
    expect(source).toContain(
      "Math.abs(toMinor(row.totalOutstanding)) > 0",
    );
  });

  it("builds opening and closing supplier statement balances server-side", () => {
    expect(source).toContain(
      "const openingMinor = events",
    );
    expect(source).toContain(
      "openingBalance: fromMinor(openingMinor)",
    );
    expect(source).toContain(
      "closingBalance: fromMinor(",
    );
  });

  it("includes posted and cancelled accounting document events", () => {
    expect(source).toContain(
      'type: "إلغاء فاتورة"',
    );
    expect(source).toContain(
      'type: "إلغاء سداد"',
    );
    expect(source).toContain(
      'type: "عكس استحقاق"',
    );
  });

  it("validates supplier statement date ranges", () => {
    expect(source).toContain(
      "validDateKey",
    );
    expect(source).toContain(
      "rawFrom > rawTo",
    );
  });
  it("returns historical suppliers separately from current balances", () => {
    expect(source).toContain("statementSuppliers");
    expect(source).toContain("activitySupplierIds");
    expect(source).toContain("historicalPayments");
    expect(source).toContain("postedAt: {");
    expect(source).toContain('invoice.status !== "posted"');
  });

});