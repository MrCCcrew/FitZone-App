import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const inventorySource = readFileSync(
  resolve(process.cwd(), "src/app/admin/sections/Inventory.tsx"),
  "utf8",
);

describe("Supplier AP admin UI contract", () => {
  it("keeps inventory receipt, purchase invoice, and supplier payment as separate UI flows", () => {
    expect(inventorySource).toContain(
      '{ key: "receipts", label: "استلام المخزون" }',
    );
    expect(inventorySource).toContain(
      '{ key: "purchaseInvoices", label: "فواتير الموردين" }',
    );
    expect(inventorySource).toContain(
      '{ key: "supplierPayments", label: "مدفوعات الموردين" }',
    );
  });

  it("keeps inventory receiving on the inventory receipt API", () => {
    expect(inventorySource).toContain('fetch("/api/admin/inventory/receipts"');
  });

  it("creates purchase invoices through the dedicated AP API", () => {
    expect(inventorySource).toContain('fetch("/api/admin/purchase-invoices"');
    expect(inventorySource).toContain("savePurchaseInvoiceDraft");
    expect(inventorySource).toContain("حفظ كمسودة");
  });

  it("creates supplier payments through the dedicated payment API", () => {
    expect(inventorySource).toContain('fetch("/api/admin/supplier-payments"');
    expect(inventorySource).toContain("saveSupplierPaymentDraft");
    expect(inventorySource).toContain("حفظ الدفعة كمسودة");
  });

  it("keeps supplier payment posting limited to cash until another GL account is confirmed", () => {
    expect(inventorySource).toContain('paymentMethod: "cash"');
    expect(inventorySource).toMatch(/طريقة السداد[\s\S]*?النقدي فقط/);
  });

  it("only offers posted invoices with outstanding balances for payment", () => {
    expect(inventorySource).toMatch(
      /invoice\.documentStatus === "posted"[\s\S]*?invoice\.outstandingAmount > 0/,
    );
  });

  it("has a client-side overpayment guard in addition to the server-side guard", () => {
    expect(inventorySource).toContain(
      "selectedSupplierPayableOutstanding",
    );
    expect(inventorySource).toMatch(
      /amount > selectedSupplierPayableOutstanding/,
    );
    expect(inventorySource).toContain("المبلغ أكبر من الرصيد المتبقي");
  });

  it("supports purchase invoice post and cancel actions", () => {
    expect(inventorySource).toContain('action: "post"');
    expect(inventorySource).toContain('action: "cancel"');
    expect(inventorySource).toContain("ترحيل الفاتورة");
    expect(inventorySource).toContain("إلغاء الفاتورة");
  });

  it("supports consignment liabilities as supplier payment targets", () => {
    expect(inventorySource).toContain("consignmentLiabilities");
    expect(inventorySource).toContain("spLiabilityId");
    expect(inventorySource).toContain("consignmentAllocations");
    expect(inventorySource).toContain("مبيعات أمانات");
  });

  it("shows supplier balances and supplier statements with export actions", () => {
    expect(inventorySource).toContain("أرصدة الموردين");
    expect(inventorySource).toContain("كشف حساب المورد");
    expect(inventorySource).toContain("printSupplierBalancesReport");
    expect(inventorySource).toContain("printSupplierStatement");
    expect(inventorySource).toContain("تصدير CSV");
  });

  it("supports supplier payment post and cancel actions", () => {
    expect(inventorySource).toContain("postSupplierPaymentFromUi");
    expect(inventorySource).toContain("cancelSupplierPaymentFromUi");
    expect(inventorySource).toContain("ترحيل الدفعة");
    expect(inventorySource).toContain("إلغاء الدفعة");
  });

  it("does not expose direct DELETE calls for AP financial documents", () => {
    expect(inventorySource).not.toMatch(
      /fetch\("\/api\/admin\/purchase-invoices"[\s\S]{0,300}?method:\s*"DELETE"/,
    );
    expect(inventorySource).not.toMatch(
      /fetch\("\/api\/admin\/supplier-payments"[\s\S]{0,300}?method:\s*"DELETE"/,
    );
  });
});
