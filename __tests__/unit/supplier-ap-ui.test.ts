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

  it("loads supplier balances and statements from the dedicated server report API", () => {
    expect(inventorySource).toContain(
      "/api/admin/supplier-reports?mode=balances",
    );

    expect(inventorySource).toContain(
      'mode: "statement"',
    );

    expect(inventorySource).toContain(
      "loadSupplierStatement",
    );

    expect(inventorySource).not.toContain(
      "const supplierBalances = useMemo",
    );

    expect(inventorySource).not.toContain(
      "function cairoDateKey",
    );
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
  it("keeps inactive suppliers available for statements but blocks settlement", () => {
    expect(inventorySource).toContain(
      "supplierBalances.map",
    );

    expect(inventorySource).toContain(
      "لا يمكن تسجيل دفعة لمورد غير نشط",
    );

    expect(inventorySource).toContain(
      "لا يمكن تسجيل دفعة لمورد محذوف",
    );

    expect(inventorySource).toContain(
      "row.isDeleted",
    );
  });
  it("loads complete outstanding payables for the selected supplier", () => {
    expect(inventorySource).toContain(
      "/api/admin/purchase-invoices?supplierId=",
    );
    expect(inventorySource).toContain(
      "/api/admin/supplier-payments?supplierId=",
    );
    expect(inventorySource).toContain("outstandingOnly=1");
    expect(inventorySource).toContain("supplierPaymentInvoices");
    expect(inventorySource).toContain("supplierPaymentLiabilities");
    expect(inventorySource).toContain("supplierPayablesLoading");
    expect(inventorySource).toContain("supplierPayablesError");
  });

  it("handles supplier report loading errors and historical statement suppliers", () => {
    expect(inventorySource).toContain("statementSuppliers.map");
    expect(inventorySource).toContain("supplierBalancesLoading");
    expect(inventorySource).toContain("supplierBalancesError");
    expect(inventorySource).toContain("supplierStatementLoading");
    expect(inventorySource).toContain("supplierStatementError");
    expect(inventorySource).toContain("new AbortController()");
  });

  it("resets balance-table settlement to invoice source", () => {
    expect(inventorySource).toMatch(
      /setSpSupplierId\(\s*row\.supplierId,\s*\);\s*setSpSourceType\("invoice"\);/,
    );
  });

  it("uses complete supplier-specific payable arrays when selecting a target", () => {
    expect(inventorySource).toContain("const invoice = supplierPaymentInvoices.find(");
    expect(inventorySource).toContain("supplierPaymentLiabilities.find(");
  });

});
