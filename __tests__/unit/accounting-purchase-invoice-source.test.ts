import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const api = readFileSync("src/app/api/admin/accounting/route.ts", "utf8");

const ui = readFileSync("src/app/admin/sections/Accounting.tsx", "utf8");

describe("Accounting purchase invoice source contract", () => {
  it("uses PurchaseInvoice as the financial purchase source", () => {
    expect(api).toContain("db.purchaseInvoice.findMany");
    expect(api).not.toContain("db.inventoryReceipt.findMany");
  });

  it("recognizes only posted purchase invoices by invoice date", () => {
    expect(api).toContain('status: "posted"');
    expect(api).toContain('createDateRangeFilter("invoiceDate", from, to)');
  });

  it("uses PurchaseInvoice total and count for accounting KPIs", () => {
    expect(api).toContain("purchaseInvoices.reduce");
    expect(api).toContain("purchaseInvoiceCount: purchaseInvoices.length");
    expect(api).toContain("Number(invoice.totalAmount)");
  });

  it("uses linked posted receipts only for physical product detail", () => {
    expect(api).toContain("receipts:");
    expect(api).toContain("invoice.receipts.flatMap");
    expect(api).toContain("productName: item.product.name");
  });

  it("does not expose destructive purchase deletion in Accounting UI", () => {
    expect(ui).not.toContain("deletePurchases");
    expect(ui).not.toContain("selPurchases");
    expect(ui).not.toContain("togglePurchase");
    expect(ui).not.toContain("purchasesAllRef");
    expect(ui).not.toContain("فاتورة مشتريات نهائياً");
  });

  it("keeps purchase viewing and printing available", () => {
    expect(ui).toContain("setExpandedPurchase");
    expect(ui).toContain("printPurchaseInvoice");
  });
});
