import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const invoiceSource = readFileSync(
  "src/app/api/admin/purchase-invoices/route.ts",
  "utf8",
);

const paymentSource = readFileSync(
  "src/app/api/admin/supplier-payments/route.ts",
  "utf8",
);

describe("Supplier payable API contract", () => {
  it("uncaps supplier-specific outstanding invoices", () => {
    expect(invoiceSource).toContain(
      "take: supplierId && outstandingOnly ? undefined : 200",
    );
    expect(invoiceSource).toContain("outstandingOnly");
    expect(invoiceSource).toContain("row.outstandingAmount > 0");
  });

  it("uncaps supplier-specific outstanding liabilities", () => {
    expect(paymentSource).toContain(
      "take: supplierId && outstandingOnly ? undefined : 500",
    );
    expect(paymentSource).toContain("outstandingOnly");
    expect(paymentSource).toContain(
      'in: ["open", "partial"]',
    );
  });
});
