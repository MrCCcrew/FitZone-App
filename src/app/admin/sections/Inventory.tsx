"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "../types";
import {
  printSupplierBalancesReport,
  printSupplierStatement,
} from "@/lib/print-pdf";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  code?: string | null;
  defaultPaymentTerms?: string | null;
  creditDays?: number | null;
  creditLimit?: number | null;
  supportsConsignment?: boolean;
};

type ReceiptItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

type Receipt = {
  id: string;
  referenceNumber: string | null;
  supplierId: string | null;
  supplierName: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
  } | null;
  invoiceDate: string | null;
  notes: string | null;
  receivedAt: string;
  totalCost: number;
  status: string;
  items: ReceiptItem[];
};

type Movement = {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number | null;
  createdAt: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
};

type DraftItem = { productId: string; quantity: number; unitCost: number };

type PurchaseInvoiceRow = {
  id: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    code: string | null;
  };
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  supplyType: "purchase" | "consignment";
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  documentStatus: string;
  paymentStatus: string;
  notes: string | null;
  items: Array<{
    id: string;
    productId: string | null;
    variantId: string | null;
    description: string;
    sku: string | null;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

type PurchaseInvoiceDraftItem = {
  productId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
};

type SupplierPaymentRow = {
  id: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    code: string | null;
  };
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  status: string;
  notes: string | null;
  postedAt?: string | null;
  cancelledAt?: string | null;
};

type ConsignmentLiabilityRow = {
  id: string;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    code: string | null;
  };
  orderId: string;
  orderItemId: string;
  orderInventoryAllocationId: string;
  quantity: number;
  unitCost: number;
  grossAmount: number;
  paidAmount: number;
  reversedAmount: number;
  outstandingAmount: number;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  reversedAt: string | null;
};

type SupplierStatementEntry = {
  date: string;
  dateKey: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type SupplierBalanceRow = {
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  isActive: boolean;
  isDeleted: boolean;
  invoiceOutstanding: number;
  consignmentOutstanding: number;
  totalOutstanding: number;
};

type SupplierStatementData = {
  supplier: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    isDeleted: boolean;
  } | null;
  from: string | null;
  to: string | null;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  entries: SupplierStatementEntry[];
};

const EMPTY_SUPPLIER_STATEMENT: SupplierStatementData = {
  supplier: null,
  from: null,
  to: null,
  openingBalance: 0,
  debitTotal: 0,
  creditTotal: 0,
  closingBalance: 0,
  entries: [],
};

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv =
    "\uFEFF" +
    rows
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

type ConsignmentReceiptLotRow = {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variant: {
    id: string;
    size: string | null;
    color: string | null;
    sku: string | null;
  } | null;
  sku: string | null;
  quantityReceived: number;
  quantityAvailable: number;
  quantitySold: number;
  quantityReturned: number;
  unitCost: number;
  status: string;
};

type ConsignmentReceiptRow = {
  id: string;
  referenceNumber: string | null;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  purchaseInvoiceId: string | null;
  purchaseInvoice: {
    id: string;
    invoiceNumber: string | null;
    invoiceDate: string;
    supplyType: string;
    status: string;
  } | null;
  receivedAt: string;
  status: string;
  totalDeclaredCost: number;
  notes: string | null;
  lots: ConsignmentReceiptLotRow[];
};

type ConsignmentDraftItem = {
  productId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
};

type ConsignmentSelectableItem = {
  productId: string;
  variantId: string;
  product: Product;
  invoiceQuantity: number | null;
  previouslyReceived: number;
  remainingQuantity: number | null;
  invoiceUnitCost: number | null;
};

const CARD = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 16,
  padding: 20,
} as const;

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 10,
  color: "#fff4f8",
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "8px 18px",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
    background: active ? "#e91e63" : "rgba(255,255,255,.08)",
    color: active ? "#fff" : "#d7aabd",
    transition: "all .2s",
  };
}

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  purchase: { label: "شراء", color: "#4ade80" },
  sale: { label: "مبيعات", color: "#f87171" },
  adjustment: { label: "تسوية", color: "#ffd166" },
  order_deduction: { label: "خصم طلب", color: "#f87171" },
  order_restore: { label: "إعادة طلب", color: "#4ade80" },
  manual: { label: "يدوي", color: "#a78bfa" },
};

const LOW_STOCK_THRESHOLD = 10;
const MOVS_PER_PAGE = 30;

type InventoryProps = {
  onNavigateSection?: (section: "suppliers" | "products") => void;
};

export default function Inventory({
  onNavigateSection,
}: InventoryProps = {}) {
  const [workflowStep, setWorkflowStep] = useState<number>(2);
  const [tab, setTab] = useState<
    | "receipts"
    | "consignmentReceipts"
    | "purchaseInvoices"
    | "supplierPayments"
    | "adjustments"
    | "movements"
    | "alerts"
    | "reports"
  >("purchaseInvoices");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<
    PurchaseInvoiceRow[]
  >([]);
  const [supplierPayments, setSupplierPayments] = useState<
    SupplierPaymentRow[]
  >([]);

  const [consignmentLiabilities, setConsignmentLiabilities] = useState<
    ConsignmentLiabilityRow[]
  >([]);

  const [consignmentReceipts, setConsignmentReceipts] = useState<
    ConsignmentReceiptRow[]
  >([]);

  const [crSupplierId, setCrSupplierId] = useState("");
  const [crPurchaseInvoiceId, setCrPurchaseInvoiceId] = useState("");
  const [crReferenceNumber, setCrReferenceNumber] = useState("");
  const [crReceivedAt, setCrReceivedAt] = useState("");
  const [crNotes, setCrNotes] = useState("");
  const [crDraftItem, setCrDraftItem] = useState<ConsignmentDraftItem>({
    productId: "",
    variantId: "",
    quantity: 1,
    unitCost: 0,
  });
  const [crItems, setCrItems] = useState<ConsignmentDraftItem[]>([]);
  const [crSaving, setCrSaving] = useState(false);

  const [piSupplierId, setPiSupplierId] = useState("");
  const [piInvoiceNumber, setPiInvoiceNumber] = useState("");
  const [piInvoiceDate, setPiInvoiceDate] = useState("");
  const [piDueDate, setPiDueDate] = useState("");
  const [piPaymentTerms, setPiPaymentTerms] = useState("");
  const [piSupplyType, setPiSupplyType] = useState<"purchase" | "consignment">(
    "purchase",
  );
  const [piNotes, setPiNotes] = useState("");
  const [piDraftItem, setPiDraftItem] = useState<PurchaseInvoiceDraftItem>({
    productId: "",
    variantId: "",
    quantity: 1,
    unitCost: 0,
  });
  const [piItems, setPiItems] = useState<PurchaseInvoiceDraftItem[]>([]);
  const [piSaving, setPiSaving] = useState(false);

  const [spSupplierId, setSpSupplierId] = useState("");
  const [spSourceType, setSpSourceType] = useState<
    "invoice" | "consignment"
  >("invoice");
  const [spInvoiceId, setSpInvoiceId] = useState("");
  const [spLiabilityId, setSpLiabilityId] = useState("");
  const [spAmount, setSpAmount] = useState("");
  const [spPaymentDate, setSpPaymentDate] = useState("");
  const [spReferenceNumber, setSpReferenceNumber] = useState("");
  const [spNotes, setSpNotes] = useState("");
  const [spSaving, setSpSaving] = useState(false);

  const [supplierPaymentInvoices, setSupplierPaymentInvoices] = useState<
    PurchaseInvoiceRow[]
  >([]);

  const [supplierPaymentLiabilities, setSupplierPaymentLiabilities] =
    useState<ConsignmentLiabilityRow[]>([]);

  const [supplierPayablesLoading, setSupplierPayablesLoading] =
    useState(false);

  const [supplierPayablesError, setSupplierPayablesError] =
    useState("");

  const [statementSupplierId, setStatementSupplierId] = useState("");
  const [statementFrom, setStatementFrom] = useState("");
  const [statementTo, setStatementTo] = useState("");

  const [supplierBalances, setSupplierBalances] = useState<
    SupplierBalanceRow[]
  >([]);

  const [statementSuppliers, setStatementSuppliers] = useState<
    SupplierBalanceRow[]
  >([]);

  const [supplierBalancesLoading, setSupplierBalancesLoading] =
    useState(false);

  const [supplierBalancesError, setSupplierBalancesError] =
    useState("");

  const [supplierStatementLoading, setSupplierStatementLoading] =
    useState(false);

  const [supplierStatementError, setSupplierStatementError] =
    useState("");

  const [statementData, setStatementData] =
    useState<SupplierStatementData>(
      EMPTY_SUPPLIER_STATEMENT,
    );

  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  // Receipt form
  const [supplierId, setSupplierId] = useState("");
  const [receiptPurchaseInvoiceId, setReceiptPurchaseInvoiceId] = useState("");
  const [relinkReceiptId, setRelinkReceiptId] = useState<string | null>(null);
  const [relinkPurchaseInvoiceId, setRelinkPurchaseInvoiceId] = useState("");
  const [relinkReason, setRelinkReason] = useState("");
  const [relinkSaving, setRelinkSaving] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItem, setDraftItem] = useState<DraftItem>({
    productId: "",
    quantity: 1,
    unitCost: 0,
  });
  const [items, setItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Movement filters
  const [movType, setMovType] = useState("all");
  const [movSearch, setMovSearch] = useState("");
  const [movPage, setMovPage] = useState(1);

  // Adjustment form
  const [adjProduct, setAdjProduct] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [adjQuantity, setAdjQuantity] = useState<string>("");
  const [adjUnitCost, setAdjUnitCost] = useState<string>("");
  const [adjReason, setAdjReason] = useState<string>("");
  const [adjNotes, setAdjNotes] = useState<string>("");
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [adjErrors, setAdjErrors] = useState<string[]>([]);
  const [adjApiError, setAdjApiError] = useState<string>("");
  const [adjSuccess, setAdjSuccess] = useState<string>("");
  const adjustmentSubmitLockRef = useRef<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        prodFetch,
        suppFetch,
        recFetch,
        consignmentRecFetch,
        invoiceFetch,
        paymentFetch,
        movFetch,
      ] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/suppliers", { cache: "no-store" }),
        fetch("/api/admin/inventory/receipts", { cache: "no-store" }),
        fetch("/api/admin/consignment/receipts", { cache: "no-store" }),
        fetch("/api/admin/purchase-invoices", { cache: "no-store" }),
        fetch("/api/admin/supplier-payments", { cache: "no-store" }),
        fetch("/api/admin/inventory/movements", { cache: "no-store" }),
      ]);

      if (
        !prodFetch.ok ||
        !suppFetch.ok ||
        !recFetch.ok ||
        !consignmentRecFetch.ok ||
        !invoiceFetch.ok ||
        !paymentFetch.ok ||
        !movFetch.ok
      ) {
        console.error("[LOAD_DATA] Some endpoints failed");
        return null;
      }

      const [
        prodRes,
        suppRes,
        recRes,
        consignmentRecRes,
        invoiceRes,
        paymentRes,
        movRes,
      ] = await Promise.all([
        prodFetch.json(),
        suppFetch.json(),
        recFetch.json(),
        consignmentRecFetch.json(),
        invoiceFetch.json(),
        paymentFetch.json(),
        movFetch.json(),
      ]);

      const loadedProducts = Array.isArray(prodRes) ? prodRes : [];
      const loadedSuppliers = Array.isArray(suppRes?.suppliers)
        ? suppRes.suppliers
        : [];
      const loadedReceipts = Array.isArray(recRes) ? recRes : [];
      const loadedConsignmentReceipts = Array.isArray(consignmentRecRes)
        ? consignmentRecRes
        : [];
      const loadedPurchaseInvoices = Array.isArray(invoiceRes?.invoices)
        ? invoiceRes.invoices
        : [];
      const loadedSupplierPayments = Array.isArray(paymentRes?.payments)
        ? paymentRes.payments
        : [];

      const loadedConsignmentLiabilities = Array.isArray(
        paymentRes?.consignmentLiabilities,
      )
        ? paymentRes.consignmentLiabilities
        : [];

      const loadedMovements = Array.isArray(movRes) ? movRes : [];

      setProducts(loadedProducts);
      setSuppliers(loadedSuppliers);
      setReceipts(loadedReceipts);
      setConsignmentReceipts(loadedConsignmentReceipts);
      setPurchaseInvoices(loadedPurchaseInvoices);
      setSupplierPayments(loadedSupplierPayments);
      setConsignmentLiabilities(loadedConsignmentLiabilities);
      setMovements(loadedMovements);

      return {
        products: loadedProducts,
        suppliers: loadedSuppliers,
        receipts: loadedReceipts,
        consignmentReceipts: loadedConsignmentReceipts,
        purchaseInvoices: loadedPurchaseInvoices,
        supplierPayments: loadedSupplierPayments,
        consignmentLiabilities: loadedConsignmentLiabilities,
        movements: loadedMovements,
      };
    } catch (error) {
      console.error("[LOAD_DATA]", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const productLookup = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const receiptTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
    [items],
  );

  const receiptDraftInvoices = useMemo(
    () =>
      purchaseInvoices.filter(
        (invoice) =>
          invoice.documentStatus === "draft" &&
          (!supplierId || invoice.supplierId === supplierId),
      ),
    [purchaseInvoices, supplierId],
  );

  const selectedReceiptPurchaseInvoice = useMemo(
    () =>
      purchaseInvoices.find(
        (invoice) => invoice.id === receiptPurchaseInvoiceId,
      ) ?? null,
    [purchaseInvoices, receiptPurchaseInvoiceId],
  );

  const addItem = () => {
    if (!draftItem.productId || draftItem.quantity <= 0) return;
    setItems((prev) => [
      ...prev.filter((i) => i.productId !== draftItem.productId),
      { ...draftItem },
    ]);
    setDraftItem({ productId: "", quantity: 1, unitCost: 0 });
  };

  const clearForm = () => {
    setSupplierId("");
    setReceiptPurchaseInvoiceId("");
    setReferenceNumber("");
    setInvoiceDate("");
    setNotes("");
    setItems([]);
    setDraftItem({ productId: "", quantity: 1, unitCost: 0 });
  };

  const relinkReceiptPurchaseInvoice = async () => {
    if (!relinkReceiptId) return;

    if (!relinkPurchaseInvoiceId) {
      alert("اختر فاتورة المورد الجديدة.");
      return;
    }

    if (!relinkReason.trim()) {
      alert("سبب تغيير الربط مطلوب.");
      return;
    }

    setRelinkSaving(true);

    try {
      const res = await fetch("/api/admin/inventory/receipts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: relinkReceiptId,
          action: "relink_purchase_invoice",
          newPurchaseInvoiceId: relinkPurchaseInvoiceId,
          reason: relinkReason.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        alert(data.error ?? "تعذر تغيير فاتورة المورد المرتبطة.");
        return;
      }

      setRelinkReceiptId(null);
      setRelinkPurchaseInvoiceId("");
      setRelinkReason("");

      await loadData();
    } finally {
      setRelinkSaving(false);
    }
  };

  const saveReceipt = async () => {
    if (!items.length) {
      alert("يرجى إضافة منتجات للفاتورة.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || null,
          purchaseInvoiceId: receiptPurchaseInvoiceId || null,
          referenceNumber: referenceNumber || null,
          invoiceDate: invoiceDate || null,
          notes: notes || null,
          items,
        }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "تعذر حفظ الفاتورة.");
        return;
      }
      clearForm();
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const purchaseInvoiceProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.active &&
          Boolean(piSupplierId) &&
          product.supplierId === piSupplierId,
      ),
    [products, piSupplierId],
  );

  const selectedPurchaseInvoiceProduct = useMemo(
    () =>
      purchaseInvoiceProducts.find(
        (product) => product.id === piDraftItem.productId,
      ) ?? null,
    [purchaseInvoiceProducts, piDraftItem.productId],
  );

  const selectedPurchaseInvoiceVariant = useMemo(
    () =>
      selectedPurchaseInvoiceProduct?.variants?.find(
        (variant) => variant.id === piDraftItem.variantId,
      ) ?? null,
    [selectedPurchaseInvoiceProduct, piDraftItem.variantId],
  );

  const selectedConsignmentPurchaseInvoice = useMemo(
    () =>
      purchaseInvoices.find((invoice) => invoice.id === crPurchaseInvoiceId) ??
      null,
    [purchaseInvoices, crPurchaseInvoiceId],
  );

  const consignmentSelectableItems = useMemo<
    ConsignmentSelectableItem[]
  >(() => {
    if (!crSupplierId) return [];

    if (!selectedConsignmentPurchaseInvoice) {
      return products
        .filter(
          (product) => product.active && product.supplierId === crSupplierId,
        )
        .flatMap((product) => {
          if (product.variants?.length) {
            return product.variants
              .filter((variant) => variant.isActive)
              .map((variant) => ({
                productId: product.id,
                variantId: variant.id,
                product,
                invoiceQuantity: null,
                previouslyReceived: 0,
                remainingQuantity: null,
                invoiceUnitCost: null,
              }));
          }

          return [
            {
              productId: product.id,
              variantId: "",
              product,
              invoiceQuantity: null,
              previouslyReceived: 0,
              remainingQuantity: null,
              invoiceUnitCost: null,
            },
          ];
        });
    }

    const receivedByKey = new Map<string, number>();

    for (const receipt of consignmentReceipts) {
      if (
        receipt.purchaseInvoiceId !== selectedConsignmentPurchaseInvoice.id ||
        receipt.status !== "posted"
      ) {
        continue;
      }

      for (const lot of receipt.lots) {
        const key = `${lot.productId}::${lot.variantId ?? ""}`;

        receivedByKey.set(
          key,
          (receivedByKey.get(key) ?? 0) + lot.quantityReceived,
        );
      }
    }

    const invoiceByKey = new Map<
      string,
      {
        productId: string;
        variantId: string;
        quantity: number;
        unitCost: number;
      }
    >();

    for (const item of selectedConsignmentPurchaseInvoice.items) {
      if (!item.productId) continue;

      const variantId = item.variantId ?? "";
      const key = `${item.productId}::${variantId}`;
      const existing = invoiceByKey.get(key);

      if (existing) {
        if (
          Math.round(existing.unitCost * 100) !==
          Math.round(item.unitCost * 100)
        ) {
          continue;
        }

        existing.quantity += item.quantity;
      } else {
        invoiceByKey.set(key, {
          productId: item.productId,
          variantId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        });
      }
    }

    const result: ConsignmentSelectableItem[] = [];

    for (const line of invoiceByKey.values()) {
      const product = products.find(
        (item) =>
          item.id === line.productId &&
          item.active &&
          item.supplierId === crSupplierId,
      );

      if (!product) continue;

      if (
        line.variantId &&
        !product.variants?.some(
          (variant) => variant.id === line.variantId && variant.isActive,
        )
      ) {
        continue;
      }

      const key = `${line.productId}::${line.variantId}`;
      const previouslyReceived = receivedByKey.get(key) ?? 0;
      const remainingQuantity = Math.max(0, line.quantity - previouslyReceived);

      result.push({
        productId: line.productId,
        variantId: line.variantId,
        product,
        invoiceQuantity: line.quantity,
        previouslyReceived,
        remainingQuantity,
        invoiceUnitCost: line.unitCost,
      });
    }

    return result;
  }, [
    crSupplierId,
    products,
    selectedConsignmentPurchaseInvoice,
    consignmentReceipts,
  ]);

  const selectedConsignmentItem = useMemo(
    () =>
      consignmentSelectableItems.find(
        (item) =>
          item.productId === crDraftItem.productId &&
          item.variantId === crDraftItem.variantId,
      ) ?? null,
    [consignmentSelectableItems, crDraftItem.productId, crDraftItem.variantId],
  );

  const consignmentReceiptTotal = useMemo(
    () => crItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    [crItems],
  );

  const addConsignmentItem = () => {
    if (!selectedConsignmentItem) {
      alert("اختر المنتج أولًا.");
      return;
    }

    if (!Number.isInteger(crDraftItem.quantity) || crDraftItem.quantity <= 0) {
      alert("الكمية يجب أن تكون رقمًا صحيحًا أكبر من صفر.");
      return;
    }

    if (crDraftItem.unitCost <= 0) {
      alert("تكلفة الوحدة يجب أن تكون أكبر من صفر.");
      return;
    }

    if (
      selectedConsignmentItem.remainingQuantity != null &&
      crDraftItem.quantity > selectedConsignmentItem.remainingQuantity
    ) {
      alert(
        `الكمية المطلوبة أكبر من المتبقي في الفاتورة (${selectedConsignmentItem.remainingQuantity}).`,
      );
      return;
    }

    const nextItem: ConsignmentDraftItem = {
      productId: selectedConsignmentItem.productId,
      variantId: selectedConsignmentItem.variantId,
      quantity: crDraftItem.quantity,
      unitCost: selectedConsignmentItem.invoiceUnitCost ?? crDraftItem.unitCost,
    };

    setCrItems((prev) => [
      ...prev.filter(
        (item) =>
          !(
            item.productId === nextItem.productId &&
            item.variantId === nextItem.variantId
          ),
      ),
      nextItem,
    ]);

    setCrDraftItem({
      productId: "",
      variantId: "",
      quantity: 1,
      unitCost: 0,
    });
  };

  const clearConsignmentReceiptForm = () => {
    setCrSupplierId("");
    setCrPurchaseInvoiceId("");
    setCrReferenceNumber("");
    setCrReceivedAt("");
    setCrNotes("");
    setCrItems([]);
    setCrDraftItem({
      productId: "",
      variantId: "",
      quantity: 1,
      unitCost: 0,
    });
  };

  const saveConsignmentReceipt = async () => {
    if (!crSupplierId) {
      alert("اختر المورد.");
      return;
    }

    if (!crItems.length) {
      alert("أضف بندًا واحدًا على الأقل.");
      return;
    }

    let receivedAt: string | null = null;

    if (crReceivedAt) {
      const parsed = new Date(crReceivedAt);

      if (Number.isNaN(parsed.getTime())) {
        alert("تاريخ الاستلام غير صالح.");
        return;
      }

      receivedAt = parsed.toISOString();
    }

    setCrSaving(true);

    try {
      const res = await fetch("/api/admin/consignment/receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplierId: crSupplierId,
          purchaseInvoiceId: crPurchaseInvoiceId || null,
          referenceNumber: crReferenceNumber.trim() || null,
          receivedAt,
          notes: crNotes.trim() || null,
          items: crItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        id?: string;
        error?: string;
      };

      if (!res.ok) {
        alert(data.error ?? "تعذر حفظ استلام الأمانات.");
        return;
      }

      clearConsignmentReceiptForm();
      await loadData();
    } finally {
      setCrSaving(false);
    }
  };

  const purchaseInvoiceTotal = useMemo(
    () => piItems.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    [piItems],
  );

  const clearPurchaseInvoiceForm = () => {
    setPiSupplierId("");
    setPiInvoiceNumber("");
    setPiInvoiceDate("");
    setPiDueDate("");
    setPiPaymentTerms("");
    setPiSupplyType("purchase");
    setPiNotes("");
    setPiItems([]);
    setPiDraftItem({
      productId: "",
      variantId: "",
      quantity: 1,
      unitCost: 0,
    });
  };

  const addPurchaseInvoiceItem = () => {
    if (!piSupplierId) {
      alert("يجب اختيار المورد أولًا");
      return;
    }

    if (!piDraftItem.productId) {
      alert("يجب اختيار المنتج");
      return;
    }

    const product = purchaseInvoiceProducts.find(
      (item) => item.id === piDraftItem.productId,
    );

    if (!product) {
      alert("المنتج غير تابع للمورد المختار");
      return;
    }

    const variants = product.variants ?? [];

    if (variants.length > 0 && !piDraftItem.variantId) {
      alert("يجب اختيار المقاس / اللون");
      return;
    }

    if (
      piDraftItem.variantId &&
      !variants.some((variant) => variant.id === piDraftItem.variantId)
    ) {
      alert("الاختيار غير تابع للمنتج");
      return;
    }

    if (!Number.isInteger(piDraftItem.quantity) || piDraftItem.quantity <= 0) {
      alert("الكمية يجب أن تكون عددًا صحيحًا أكبر من صفر");
      return;
    }

    if (!Number.isFinite(piDraftItem.unitCost) || piDraftItem.unitCost <= 0) {
      alert("تكلفة الوحدة يجب أن تكون أكبر من صفر");
      return;
    }

    setPiItems((prev) => [
      ...prev,
      {
        productId: piDraftItem.productId,
        variantId: piDraftItem.variantId,
        quantity: piDraftItem.quantity,
        unitCost: piDraftItem.unitCost,
      },
    ]);

    setPiDraftItem({
      productId: "",
      variantId: "",
      quantity: 1,
      unitCost: 0,
    });
  };

  const savePurchaseInvoiceDraft = async () => {
    if (!piSupplierId) {
      alert("يجب اختيار المورد");
      return;
    }

    if (!piInvoiceDate) {
      alert("تاريخ الفاتورة مطلوب");
      return;
    }

    if (!piItems.length) {
      alert("يجب إضافة بند واحد على الأقل");
      return;
    }

    setPiSaving(true);

    try {
      const res = await fetch("/api/admin/purchase-invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplierId: piSupplierId,
          invoiceNumber: piInvoiceNumber.trim() || null,
          invoiceDate: piInvoiceDate,
          dueDate: piDueDate || null,
          paymentTerms: piPaymentTerms || null,
          supplyType: piSupplyType,
          notes: piNotes.trim() || null,
          items: piItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        alert(data.error ?? "تعذر إنشاء فاتورة المورد");
        return;
      }

      clearPurchaseInvoiceForm();
      await loadData();
    } finally {
      setPiSaving(false);
    }
  };

  const loadSupplierPayables = useCallback(
    async (signal?: AbortSignal) => {
      if (!spSupplierId) {
        setSupplierPaymentInvoices([]);
        setSupplierPaymentLiabilities([]);
        setSupplierPayablesError("");
        setSupplierPayablesLoading(false);
        return;
      }

      setSupplierPaymentInvoices([]);
      setSupplierPaymentLiabilities([]);
      setSupplierPayablesError("");
      setSupplierPayablesLoading(true);

      const encodedSupplierId = encodeURIComponent(spSupplierId);

      try {
        const [invoiceRes, liabilityRes] = await Promise.all([
          fetch(
            `/api/admin/purchase-invoices?supplierId=${encodedSupplierId}&status=posted&outstandingOnly=1`,
            { cache: "no-store", signal },
          ),
          fetch(
            `/api/admin/supplier-payments?supplierId=${encodedSupplierId}&outstandingOnly=1`,
            { cache: "no-store", signal },
          ),
        ]);

        const invoiceData =
          (await invoiceRes.json().catch(() => ({}))) as {
            invoices?: PurchaseInvoiceRow[];
            error?: string;
          };

        const liabilityData =
          (await liabilityRes.json().catch(() => ({}))) as {
            consignmentLiabilities?: ConsignmentLiabilityRow[];
            error?: string;
          };

        if (!invoiceRes.ok || !liabilityRes.ok) {
          throw new Error(
            invoiceData.error ??
              liabilityData.error ??
              "تعذر تحميل مستحقات المورد",
          );
        }

        setSupplierPaymentInvoices(
          Array.isArray(invoiceData.invoices)
            ? invoiceData.invoices
            : [],
        );

        setSupplierPaymentLiabilities(
          Array.isArray(liabilityData.consignmentLiabilities)
            ? liabilityData.consignmentLiabilities
            : [],
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("[SUPPLIER_PAYABLES]", error);
        setSupplierPaymentInvoices([]);
        setSupplierPaymentLiabilities([]);
        setSupplierPayablesError(
          error instanceof Error
            ? error.message
            : "تعذر تحميل مستحقات المورد",
        );
      } finally {
        if (!signal?.aborted) {
          setSupplierPayablesLoading(false);
        }
      }
    },
    [spSupplierId],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadSupplierPayables(controller.signal);

    return () => controller.abort();
  }, [
    loadSupplierPayables,
    purchaseInvoices,
    supplierPayments,
    consignmentLiabilities,
  ]);

  const eligibleSupplierPaymentInvoices = useMemo(
    () =>
      supplierPaymentInvoices.filter(
        (invoice) =>
          invoice.supplierId === spSupplierId &&
          invoice.documentStatus === "posted" &&
          invoice.outstandingAmount > 0,
      ),
    [supplierPaymentInvoices, spSupplierId],
  );

  const selectedSupplierPaymentInvoice = useMemo(
    () =>
      supplierPaymentInvoices.find(
        (invoice) => invoice.id === spInvoiceId,
      ) ?? null,
    [supplierPaymentInvoices, spInvoiceId],
  );

  const eligibleSupplierPaymentLiabilities = useMemo(
    () =>
      supplierPaymentLiabilities.filter(
        (liability) =>
          liability.supplierId === spSupplierId &&
          liability.outstandingAmount > 0,
      ),
    [supplierPaymentLiabilities, spSupplierId],
  );

  const selectedSupplierPaymentLiability = useMemo(
    () =>
      supplierPaymentLiabilities.find(
        (liability) => liability.id === spLiabilityId,
      ) ?? null,
    [supplierPaymentLiabilities, spLiabilityId],
  );

  const selectedSupplierPayableOutstanding =
    spSourceType === "invoice"
      ? selectedSupplierPaymentInvoice?.outstandingAmount ?? 0
      : selectedSupplierPaymentLiability?.outstandingAmount ?? 0;
  const loadSupplierBalances = useCallback(
    async (signal?: AbortSignal) => {
      setSupplierBalancesError("");
      setSupplierBalancesLoading(true);

      try {
        const res = await fetch(
          "/api/admin/supplier-reports?mode=balances",
          {
            cache: "no-store",
            signal,
          },
        );

        const data = (await res.json().catch(() => ({}))) as {
          balances?: SupplierBalanceRow[];
          statementSuppliers?: SupplierBalanceRow[];
          error?: string;
        };

        if (!res.ok) {
          throw new Error(
            data.error ??
              "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0623\u0631\u0635\u062f\u0629 \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646",
          );
        }

        setSupplierBalances(
          Array.isArray(data.balances)
            ? data.balances
            : [],
        );

        setStatementSuppliers(
          Array.isArray(data.statementSuppliers)
            ? data.statementSuppliers
            : [],
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("[SUPPLIER_BALANCES_REPORT]", error);

        setSupplierBalancesError(
          error instanceof Error
            ? error.message
            : "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0623\u0631\u0635\u062f\u0629 \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646",
        );
      } finally {
        if (!signal?.aborted) {
          setSupplierBalancesLoading(false);
        }
      }
    },
    [],
  );

  const loadSupplierStatement = useCallback(
    async (signal?: AbortSignal) => {
      if (!statementSupplierId) {
        setStatementData(EMPTY_SUPPLIER_STATEMENT);
        setSupplierStatementError("");
        setSupplierStatementLoading(false);
        return;
      }

      setStatementData(EMPTY_SUPPLIER_STATEMENT);
      setSupplierStatementError("");
      setSupplierStatementLoading(true);

      const params = new URLSearchParams({
        mode: "statement",
        supplierId: statementSupplierId,
      });

      if (statementFrom) {
        params.set("from", statementFrom);
      }

      if (statementTo) {
        params.set("to", statementTo);
      }

      try {
        const res = await fetch(
          `/api/admin/supplier-reports?${params.toString()}`,
          {
            cache: "no-store",
            signal,
          },
        );

        const data = (await res.json().catch(() => ({}))) as {
          statement?: SupplierStatementData;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(
            data.error ??
              "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0643\u0634\u0641 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0631\u062f",
          );
        }

        setStatementData(
          data.statement ??
            EMPTY_SUPPLIER_STATEMENT,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error("[SUPPLIER_STATEMENT_REPORT]", error);

        setSupplierStatementError(
          error instanceof Error
            ? error.message
            : "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0643\u0634\u0641 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0631\u062f",
        );
      } finally {
        if (!signal?.aborted) {
          setSupplierStatementLoading(false);
        }
      }
    },
    [
      statementSupplierId,
      statementFrom,
      statementTo,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadSupplierBalances(controller.signal);

    return () => {
      controller.abort();
    };
  }, [
    loadSupplierBalances,
    purchaseInvoices,
    supplierPayments,
    consignmentLiabilities,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    void loadSupplierStatement(controller.signal);

    return () => {
      controller.abort();
    };
  }, [
    loadSupplierStatement,
    purchaseInvoices,
    supplierPayments,
    consignmentLiabilities,
  ]);
  const exportSupplierBalancesCsv = () => {
    downloadCsv(
      "fitzone-supplier-balances.csv",
      [
        [
          "المورد",
          "الكود",
          "فواتير مشتريات مستحقة",
          "مبيعات أمانات مستحقة",
          "إجمالي الرصيد",
        ],
        ...supplierBalances.map((row) => [
          row.supplierName,
          row.supplierCode ?? "",
          row.invoiceOutstanding.toFixed(2),
          row.consignmentOutstanding.toFixed(2),
          row.totalOutstanding.toFixed(2),
        ]),
      ],
    );
  };

  const exportSupplierStatementCsv = () => {
    if (!statementData.supplier) {
      alert("اختر المورد أولًا");
      return;
    }

    downloadCsv(
      `fitzone-supplier-statement-${statementData.supplier.name}.csv`,
      [
        ["المورد", statementData.supplier.name],
        [
          "الفترة",
          `${statementFrom || "البداية"} إلى ${statementTo || "حتى الآن"}`,
        ],
        ["الرصيد الافتتاحي", statementData.openingBalance.toFixed(2)],
        [],
        [
          "التاريخ",
          "النوع",
          "المرجع",
          "البيان",
          "مدين",
          "دائن",
          "الرصيد",
        ],
        ...statementData.entries.map((entry) => [
          entry.dateKey,
          entry.type,
          entry.reference,
          entry.description,
          entry.debit.toFixed(2),
          entry.credit.toFixed(2),
          entry.balance.toFixed(2),
        ]),
        [],
        ["الرصيد الختامي", statementData.closingBalance.toFixed(2)],
      ],
    );
  };

  const clearSupplierPaymentForm = () => {
    setSpSupplierId("");
    setSpSourceType("invoice");
    setSpInvoiceId("");
    setSpLiabilityId("");
    setSpAmount("");
    setSpPaymentDate("");
    setSpReferenceNumber("");
    setSpNotes("");
  };

  const saveSupplierPaymentDraft = async () => {
    if (!spSupplierId) {
      alert("يجب اختيار المورد");
      return;
    }

    if (
      spSourceType === "invoice" &&
      (!spInvoiceId || !selectedSupplierPaymentInvoice)
    ) {
      alert("يجب اختيار فاتورة مورد");
      return;
    }

    if (
      spSourceType === "consignment" &&
      (!spLiabilityId || !selectedSupplierPaymentLiability)
    ) {
      alert("يجب اختيار استحقاق أمانات");
      return;
    }

    if (!spPaymentDate) {
      alert("تاريخ السداد مطلوب");
      return;
    }

    const amount = Number(spAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("مبلغ السداد يجب أن يكون أكبر من صفر");
      return;
    }

    if (amount > selectedSupplierPayableOutstanding) {
      alert(
        `المبلغ أكبر من الرصيد المتبقي (${selectedSupplierPayableOutstanding.toLocaleString("ar-EG")} ج.م)`,
      );
      return;
    }

    setSpSaving(true);

    try {
      const res = await fetch("/api/admin/supplier-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supplierId: spSupplierId,
          amount,
          paymentDate: spPaymentDate,
          paymentMethod: "cash",
          referenceNumber: spReferenceNumber.trim() || null,
          notes: spNotes.trim() || null,
          allocations:
            spSourceType === "invoice"
              ? [
                  {
                    purchaseInvoiceId: spInvoiceId,
                    amount,
                  },
                ]
              : [],
          consignmentAllocations:
            spSourceType === "consignment"
              ? [
                  {
                    liabilityId: spLiabilityId,
                    amount,
                  },
                ]
              : [],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        alert(data.error ?? "تعذر إنشاء دفعة المورد");
        return;
      }

      clearSupplierPaymentForm();
      await loadData();
    } finally {
      setSpSaving(false);
    }
  };

  const postSupplierPaymentFromUi = async (paymentId: string) => {
    const res = await fetch("/api/admin/supplier-payments", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: paymentId,
        action: "post",
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!res.ok) {
      alert(data.error ?? "تعذر ترحيل دفعة المورد");
      return;
    }

    await loadData();
  };

  const cancelSupplierPaymentFromUi = async (paymentId: string) => {
    if (
      !window.confirm("تأكيد إلغاء دفعة المورد؟ سيتم إنشاء قيد عكسي محاسبي.")
    ) {
      return;
    }

    const res = await fetch("/api/admin/supplier-payments", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: paymentId,
        action: "cancel",
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!res.ok) {
      alert(data.error ?? "تعذر إلغاء دفعة المورد");
      return;
    }

    await loadData();
  };

  // ══════════════════════════════════════════════════════════════
  // ADJUSTMENT HELPERS
  // ══════════════════════════════════════════════════════════════

  const invalidatePreview = () => {
    setShowPreview(false);
  };

  const clearAdjustmentMessages = () => {
    setAdjErrors([]);
    setAdjApiError("");
    setAdjSuccess("");
  };

  const clearAdjustmentForm = () => {
    setAdjProduct(null);
    setAdjType("increase");
    setAdjQuantity("");
    setAdjUnitCost("");
    setAdjReason("");
    setAdjNotes("");
    setShowPreview(false);
    setAdjErrors([]);
    // ✅ Don't clear messages (adjApiError/adjSuccess)
  };

  const validateForm = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!adjProduct) {
      errors.push("يجب اختيار منتج");
      return { valid: false, errors };
    }

    const quantity = Number(adjQuantity);
    if (!Number.isFinite(quantity)) {
      errors.push("الكمية يجب أن تكون رقم صحيح");
    } else if (!Number.isInteger(quantity)) {
      errors.push("الكمية يجب أن تكون عدد صحيح (بدون كسور)");
    } else if (quantity <= 0) {
      errors.push("الكمية يجب أن تكون أكبر من صفر");
    } else if (adjType === "decrease" && quantity > adjProduct.stock) {
      errors.push(
        `الكمية المخصومة (${quantity}) أكبر من المخزون المتاح (${adjProduct.stock})`,
      );
    }

    if (adjType === "increase") {
      const unitCost = Number(adjUnitCost);
      if (!Number.isFinite(unitCost)) {
        errors.push("تكلفة الوحدة يجب أن تكون رقم صحيح");
      } else if (unitCost <= 0) {
        errors.push("تكلفة الوحدة يجب أن تكون أكبر من صفر");
      }
    }

    if (typeof adjReason !== "string" || adjReason.trim().length === 0) {
      errors.push("سبب التسوية مطلوب");
    }

    return { valid: errors.length === 0, errors };
  };

  const calculatePreview = () => {
    const validation = validateForm();
    if (!validation.valid || !adjProduct) return null;

    const quantity = Number(adjQuantity);
    const currentStock = adjProduct.stock;
    const currentAvg = adjProduct.averageCost ?? 0;

    if (adjType === "increase") {
      const unitCost = Number(adjUnitCost);
      const newStock = currentStock + quantity;
      const newAvg =
        newStock > 0
          ? (currentStock * currentAvg + quantity * unitCost) / newStock
          : unitCost;

      return {
        stockBefore: currentStock,
        stockChange: `+${quantity}`,
        stockAfter: newStock,
        avgBefore: currentAvg,
        avgChange: unitCost,
        avgAfter: newAvg,
      };
    } else {
      const newStock = currentStock - quantity;
      return {
        stockBefore: currentStock,
        stockChange: `-${quantity}`,
        stockAfter: newStock,
        avgBefore: currentAvg,
        avgChange: null,
        avgAfter: currentAvg,
      };
    }
  };

  const submitAdjustment = async () => {
    if (adjustmentSubmitLockRef.current) {
      console.warn("[ADJUSTMENT] Double submit prevented");
      return;
    }

    if (!showPreview || !adjProduct) {
      console.warn("[ADJUSTMENT] Invalid state for submission");
      return;
    }

    const validation = validateForm();
    if (!validation.valid) {
      setAdjErrors(validation.errors);
      setShowPreview(false);
      return;
    }

    adjustmentSubmitLockRef.current = true;
    setSubmitting(true);
    setAdjErrors([]);
    setAdjApiError("");
    setAdjSuccess("");

    const productId = adjProduct.id;
    const type = adjType;
    const quantity = Number(adjQuantity);
    const unitCost = type === "increase" ? Number(adjUnitCost) : undefined;
    const reason = adjReason.trim();
    const notesValue = adjNotes.trim();

    try {
      const payload: Record<string, unknown> = {
        productId,
        type,
        quantity,
        reason,
      };

      if (type === "increase" && unitCost != null) {
        payload.unitCost = unitCost;
      }

      if (notesValue) {
        payload.notes = notesValue;
      }

      const res = await fetch("/api/admin/inventory/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: { error?: string; [key: string]: unknown } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: "فشل قراءة استجابة الخادم" };
      }

      if (res.ok) {
        const refreshed = await loadData();

        // ✅ Clear form first
        clearAdjustmentForm();

        if (refreshed) {
          // ✅ Success: refresh succeeded
          setAdjSuccess("✅ تمت التسوية بنجاح!");
          setTimeout(() => setAdjSuccess(""), 5000);
        } else {
          // ✅ Success + refresh failure
          setAdjSuccess("✅ تمت التسوية بنجاح!");
          setAdjApiError(
            "تمت التسوية ولكن تعذر تحديث العرض. يرجى تحديث الصفحة.",
          );
          // ✅ Don't clear messages
        }
        return;
      }

      if (res.status === 400) {
        setAdjApiError(data.error ?? "خطأ في البيانات المرسلة");
        return;
      }

      if (res.status === 404) {
        await loadData();
        // ✅ Clear form first, then set error
        clearAdjustmentForm();
        setAdjApiError(data.error ?? "المنتج غير موجود (تم حذفه من النظام)");
        return;
      }

      if (res.status === 409) {
        const refreshed = await loadData();

        if (refreshed) {
          // ✅ Refresh succeeded
          const freshProduct = refreshed.products.find(
            (p) => p.id === productId,
          );
          if (freshProduct) {
            setAdjProduct(freshProduct);
            setAdjApiError(
              (data.error ?? "تغير المخزون أثناء التسوية") +
                "\n\nتم تحديث بيانات المنتج. يرجى مراجعة الرصيد والمتوسط الجديد وإعادة المحاولة.",
            );
          } else {
            // Product deleted during conflict
            clearAdjustmentForm();
            setAdjApiError("❌ المنتج لم يعد موجوداً في النظام");
            return;
          }
        } else {
          // ✅ Refresh failed - stale data warning
          setAdjApiError(
            (data.error ?? "تغير المخزون أثناء التسوية") +
              "، وتعذر تحديث البيانات تلقائياً.\n\nحدّث الصفحة قبل إعادة المحاولة.",
          );
        }

        setShowPreview(false);
        return;
      }

      if (res.status === 422) {
        const refreshed = await loadData();

        if (refreshed) {
          // ✅ Refresh succeeded
          const freshProduct = refreshed.products.find(
            (p) => p.id === productId,
          );
          if (freshProduct) {
            setAdjProduct(freshProduct);
            setAdjApiError(
              data.error ?? "الكمية المطلوبة أكبر من المخزون المتاح",
            );
          } else {
            clearAdjustmentForm();
            setAdjApiError("❌ المنتج لم يعد موجوداً");
            return;
          }
        } else {
          // ✅ Refresh failed - stale data warning
          setAdjApiError(
            (data.error ?? "الكمية المطلوبة أكبر من المخزون المتاح") +
              "\n\nتعذر تحديث الرصيد الحالي. حدّث الصفحة قبل إعادة المحاولة.",
          );
        }

        setShowPreview(false);
        return;
      }

      if (res.status === 500) {
        setAdjApiError(
          "حدث خطأ في الخادم:\n" +
            (data.error ?? "خطأ غير متوقع") +
            "\n\nيرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني.",
        );
        return;
      }

      setAdjApiError(
        `خطأ غير متوقع (${res.status}): ${data.error ?? "غير معروف"}`,
      );
    } catch (error) {
      console.error("[ADJUSTMENT_SUBMIT]", error);
      setAdjApiError(
        "فشل الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.",
      );
    } finally {
      adjustmentSubmitLockRef.current = false;
      setSubmitting(false);
    }
  };

  // Movements
  const filteredMovements = useMemo(() => {
    let list = movements;
    if (movType !== "all") list = list.filter((m) => m.type === movType);
    if (movSearch.trim())
      list = list.filter((m) => m.productName.includes(movSearch.trim()));
    return list;
  }, [movements, movType, movSearch]);

  const movementPages = Math.max(
    1,
    Math.ceil(filteredMovements.length / MOVS_PER_PAGE),
  );
  const pagedMovements = filteredMovements.slice(
    (movPage - 1) * MOVS_PER_PAGE,
    movPage * MOVS_PER_PAGE,
  );

  // Alerts
  const outOfStock = useMemo(
    () => products.filter((p) => p.stock === 0 && p.active),
    [products],
  );
  const lowStock = useMemo(
    () =>
      products.filter(
        (p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD && p.active,
      ),
    [products],
  );

  // Reports
  const totalCostValue = useMemo(
    () => products.reduce((sum, p) => sum + (p.averageCost ?? 0) * p.stock, 0),
    [products],
  );
  const totalSellingValue = useMemo(
    () => products.reduce((sum, p) => sum + p.price * p.stock, 0),
    [products],
  );
  const totalReceiptsCost = useMemo(
    () => receipts.reduce((sum, r) => sum + r.totalCost, 0),
    [receipts],
  );

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 300,
          color: "#d7aabd",
        }}
      >
        جاري التحميل...
      </div>
    );
  }

  const alertCount = outOfStock.length + lowStock.length;

  return (
    <div style={{ direction: "rtl" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{ fontSize: 22, fontWeight: 900, color: "#fff4f8", margin: 0 }}
        >
          المخزون والمشتريات
        </h1>
        <p style={{ color: "#d7aabd", fontSize: 13, marginTop: 4 }}>
          إدارة فواتير الشراء وحركة المخزون والتنبيهات والتقارير
        </p>
      </div>

      {/* Purchase-to-sale guided workflow */}
      <div
        style={{
          ...CARD,
          marginBottom: 20,
          padding: 16,
          background:
            "linear-gradient(135deg, rgba(190,24,93,.12), rgba(255,255,255,.035))",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#fff4f8",
                fontWeight: 900,
                fontSize: 15,
              }}
            >
              دورة تسجيل المشتريات وتجهيز المنتج للبيع
            </div>

            <div
              style={{
                color: "#d7aabd",
                fontSize: 11,
                marginTop: 4,
                lineHeight: 1.7,
              }}
            >
              اتبعي الخطوات بالترتيب لتجنب تسجيل استلام أو ترحيل فاتورة بشكل غير صحيح.
            </div>
          </div>

          <div
            style={{
              color: "#f9a8d4",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            الخطوة الحالية: {workflowStep} من 6
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(150px,1fr))",
            gap: 8,
          }}
        >
          {[
            {
              step: 1,
              title: "المورد",
              description: "اختيار أو إنشاء المورد",
              action: () => {
                setWorkflowStep(1);
                onNavigateSection?.("suppliers");
              },
            },
            {
              step: 2,
              title: "فاتورة الشراء",
              description: "إنشاء الفاتورة كمسودة",
              action: () => {
                setWorkflowStep(2);
                setTab("purchaseInvoices");
              },
            },
            {
              step: 3,
              title: "أصناف الفاتورة",
              description: "إضافة الكميات والتكلفة",
              action: () => {
                setWorkflowStep(3);
                setTab("purchaseInvoices");
              },
            },
            {
              step: 4,
              title: "استلام المخزون",
              description: "إدخال الكمية المستلمة فعليًا",
              action: () => {
                setWorkflowStep(4);
                setTab("receipts");
              },
            },
            {
              step: 5,
              title: "ترحيل الفاتورة",
              description: "بعد اكتمال وربط الاستلام",
              action: () => {
                setWorkflowStep(5);
                setTab("purchaseInvoices");
              },
            },
            {
              step: 6,
              title: "جاهز للبيع",
              description: "مراجعة بيانات المنتج والمتجر",
              action: () => {
                setWorkflowStep(6);
                onNavigateSection?.("products");
              },
            },
          ].map((item) => {
            const active = workflowStep === item.step;

            return (
              <button
                key={item.step}
                type="button"
                onClick={item.action}
                style={{
                  appearance: "none",
                  border: active
                    ? "1px solid rgba(244,114,182,.85)"
                    : "1px solid rgba(255,255,255,.09)",
                  background: active
                    ? "rgba(190,24,93,.22)"
                    : "rgba(255,255,255,.035)",
                  borderRadius: 12,
                  padding: "11px 12px",
                  textAlign: "right",
                  cursor: "pointer",
                  minHeight: 78,
                  transition: "all .18s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: active
                        ? "#db2777"
                        : "rgba(255,255,255,.09)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {item.step}
                  </span>

                  <span
                    style={{
                      color: "#fff4f8",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {item.title}
                  </span>
                </div>

                <div
                  style={{
                    color: active
                      ? "#fbcfe8"
                      : "#d7aabd",
                    fontSize: 10,
                    lineHeight: 1.6,
                  }}
                >
                  {item.description}
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 12,
            borderRadius: 10,
            padding: "9px 11px",
            background: "rgba(34,197,94,.07)",
            border: "1px solid rgba(34,197,94,.16)",
            color: "#bbf7d0",
            fontSize: 10,
            lineHeight: 1.7,
          }}
        >
          الترتيب الصحيح: المورد ← فاتورة مسودة ← الأصناف ← الاستلام الفعلي ← ترحيل الفاتورة ← مراجعة المنتج للبيع.
          لا يتم ترحيل فاتورة الشراء قبل اكتمال الاستلام المرتبط بها.
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}
      >
        {(
          [
            { key: "receipts", label: "استلام المخزون" },
            { key: "consignmentReceipts", label: "استلام الأمانات" },
            { key: "purchaseInvoices", label: "فواتير الموردين" },
            { key: "supplierPayments", label: "مدفوعات الموردين" },
            { key: "adjustments", label: "تسوية المخزون" },
            { key: "movements", label: "حركة المخزون" },
            {
              key: "alerts",
              label:
                alertCount > 0
                  ? `تنبيهات المخزون (${alertCount})`
                  : "تنبيهات المخزون",
            },
            { key: "reports", label: "تقارير المخزون" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            style={tabStyle(tab === t.key)}
            onClick={() => {
              setTab(t.key);

              if (t.key === "purchaseInvoices") {
                setWorkflowStep((current) =>
                  [2, 3, 5].includes(current) ? current : 2,
                );
              } else if (t.key === "receipts") {
                setWorkflowStep(4);
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Consignment Receipts ── */}
      {tab === "consignmentReceipts" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={CARD}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                marginTop: 0,
                marginBottom: 6,
              }}
            >
              استلام الأمانات
            </h2>

            <div
              style={{
                fontSize: 11,
                color: "#d7aabd",
                marginBottom: 16,
              }}
            >
              هذا الاستلام منفصل عن المخزون المملوك ولا يغيّر تكلفة المخزون
              العادي.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  المورد *
                </label>

                <select
                  value={crSupplierId}
                  onChange={(e) => {
                    setCrSupplierId(e.target.value);
                    setCrPurchaseInvoiceId("");
                    setCrItems([]);
                    setCrDraftItem({
                      productId: "",
                      variantId: "",
                      quantity: 1,
                      unitCost: 0,
                    });
                  }}
                  style={INPUT}
                  disabled={crSaving}
                >
                  <option value="">اختر المورد</option>

                  {suppliers
                    .filter(
                      (supplier) =>
                        supplier.isActive && supplier.supportsConsignment,
                    )
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.code ? ` (#${supplier.code})` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  فاتورة الأمانات المرتبطة
                </label>

                <select
                  value={crPurchaseInvoiceId}
                  onChange={(e) => {
                    setCrPurchaseInvoiceId(e.target.value);
                    setCrItems([]);
                    setCrDraftItem({
                      productId: "",
                      variantId: "",
                      quantity: 1,
                      unitCost: 0,
                    });
                  }}
                  style={INPUT}
                  disabled={!crSupplierId || crSaving}
                >
                  <option value="">
                    {crSupplierId
                      ? "اختر فاتورة أمانات مسودة"
                      : "اختر المورد أولًا"}
                  </option>

                  {purchaseInvoices
                    .filter(
                      (invoice) =>
                        invoice.supplierId === crSupplierId &&
                        invoice.supplyType === "consignment" &&
                        invoice.documentStatus === "draft",
                    )
                    .map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber ??
                          `فاتورة #${invoice.id.slice(-8)}`}
                        {" — "}
                        {invoice.totalAmount.toLocaleString("ar-EG")} ج.م
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 12,
                marginTop: 16,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  رقم إذن / مرجع الاستلام
                </label>

                <input
                  value={crReferenceNumber}
                  onChange={(e) => setCrReferenceNumber(e.target.value)}
                  style={INPUT}
                  placeholder="CR-001"
                  disabled={crSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  تاريخ ووقت الاستلام
                </label>

                <input
                  type="datetime-local"
                  value={crReceivedAt}
                  onChange={(e) => setCrReceivedAt(e.target.value)}
                  style={{ ...INPUT, direction: "ltr" }}
                  disabled={crSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  ملاحظات
                </label>

                <input
                  value={crNotes}
                  onChange={(e) => setCrNotes(e.target.value)}
                  style={INPUT}
                  disabled={crSaving}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 12,
                background: "rgba(0,0,0,.2)",
              }}
            >
              <div
                style={{
                  color: "#fff4f8",
                  fontWeight: 800,
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                بنود استلام الأمانات
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(240px,2fr) 100px 130px auto",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    المنتج / المقاس / اللون *
                  </label>

                  <select
                    value={
                      crDraftItem.productId
                        ? `${crDraftItem.productId}::${crDraftItem.variantId}`
                        : ""
                    }
                    onChange={(e) => {
                      const selected =
                        consignmentSelectableItems.find(
                          (item) =>
                            `${item.productId}::${item.variantId}` ===
                            e.target.value,
                        ) ?? null;

                      if (!selected) {
                        setCrDraftItem({
                          productId: "",
                          variantId: "",
                          quantity: 1,
                          unitCost: 0,
                        });
                        return;
                      }

                      setCrDraftItem({
                        productId: selected.productId,
                        variantId: selected.variantId,
                        quantity: 1,
                        unitCost:
                          selected.invoiceUnitCost ??
                          Number(selected.product.costPrice ?? 0),
                      });
                    }}
                    style={INPUT}
                    disabled={!crSupplierId || crSaving}
                  >
                    <option value="">
                      {!crSupplierId
                        ? "اختر المورد أولًا"
                        : crPurchaseInvoiceId &&
                            consignmentSelectableItems.length === 0
                          ? "لا توجد بنود متبقية صالحة للاستلام"
                          : "اختر المنتج"}
                    </option>

                    {consignmentSelectableItems.map((item) => {
                      const variant = item.variantId
                        ? item.product.variants?.find(
                            (candidate) => candidate.id === item.variantId,
                          )
                        : null;

                      const variantLabel = variant
                        ? [variant.size, variant.color]
                            .filter(Boolean)
                            .join(" / ")
                        : "";

                      const depleted =
                        item.remainingQuantity != null &&
                        item.remainingQuantity <= 0;

                      return (
                        <option
                          key={`${item.productId}-${item.variantId || "base"}`}
                          value={`${item.productId}::${item.variantId}`}
                          disabled={depleted}
                        >
                          {item.product.name}
                          {variantLabel ? ` — ${variantLabel}` : ""}
                          {variant?.sku ? ` — ${variant.sku}` : ""}
                          {item.remainingQuantity != null
                            ? ` — المتبقي: ${item.remainingQuantity}`
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    الكمية
                  </label>

                  <input
                    type="number"
                    min={1}
                    step={1}
                    max={
                      selectedConsignmentItem?.remainingQuantity ?? undefined
                    }
                    value={crDraftItem.quantity}
                    onChange={(e) =>
                      setCrDraftItem({
                        ...crDraftItem,
                        quantity: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                    disabled={!selectedConsignmentItem || crSaving}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    تكلفة الوحدة
                  </label>

                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={crDraftItem.unitCost}
                    onChange={(e) =>
                      setCrDraftItem({
                        ...crDraftItem,
                        unitCost: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                    disabled={
                      !selectedConsignmentItem ||
                      crSaving ||
                      selectedConsignmentItem.invoiceUnitCost != null
                    }
                  />
                </div>

                <button
                  onClick={addConsignmentItem}
                  disabled={
                    !selectedConsignmentItem ||
                    crSaving ||
                    (selectedConsignmentItem.remainingQuantity != null &&
                      selectedConsignmentItem.remainingQuantity <= 0)
                  }
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 14px",
                    background: "#a78bfa",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  إضافة
                </button>
              </div>

              {selectedConsignmentItem?.remainingQuantity != null && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#d7aabd",
                  }}
                >
                  كمية الفاتورة: {selectedConsignmentItem.invoiceQuantity}
                  {" • "}
                  مستلم سابقًا: {selectedConsignmentItem.previouslyReceived}
                  {" • "}
                  المتبقي:{" "}
                  <b style={{ color: "#ffd166" }}>
                    {selectedConsignmentItem.remainingQuantity}
                  </b>
                </div>
              )}

              {crItems.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {crItems.map((item, index) => {
                    const selectable = consignmentSelectableItems.find(
                      (candidate) =>
                        candidate.productId === item.productId &&
                        candidate.variantId === item.variantId,
                    );

                    const product =
                      selectable?.product ??
                      products.find(
                        (candidate) => candidate.id === item.productId,
                      );

                    const variant = item.variantId
                      ? product?.variants?.find(
                          (candidate) => candidate.id === item.variantId,
                        )
                      : null;

                    const variantLabel = variant
                      ? [variant.size, variant.color]
                          .filter(Boolean)
                          .join(" / ")
                      : "";

                    return (
                      <div
                        key={`${item.productId}-${item.variantId}-${index}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 10px",
                          marginBottom: 6,
                          borderRadius: 8,
                          background: "rgba(255,255,255,.04)",
                        }}
                      >
                        <div
                          style={{
                            color: "#fff4f8",
                            fontSize: 12,
                          }}
                        >
                          {product?.name ?? "منتج"}
                          {variantLabel ? ` — ${variantLabel}` : ""}
                        </div>

                        <div
                          style={{
                            color: "#d7aabd",
                            fontSize: 11,
                          }}
                        >
                          {item.quantity} ×{" "}
                          {item.unitCost.toLocaleString("ar-EG")}
                          {" = "}
                          <b style={{ color: "#ffd166" }}>
                            {(item.quantity * item.unitCost).toLocaleString(
                              "ar-EG",
                            )}{" "}
                            ج.م
                          </b>
                        </div>

                        <button
                          onClick={() =>
                            setCrItems((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                          disabled={crSaving}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: 18,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  <div
                    style={{
                      marginTop: 10,
                      textAlign: "left",
                      color: "#ffd166",
                      fontWeight: 800,
                    }}
                  >
                    إجمالي القيمة المعلنة:{" "}
                    {consignmentReceiptTotal.toLocaleString("ar-EG")} ج.م
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
                flexWrap: "wrap",
              }}
            >
              {(crSupplierId ||
                crPurchaseInvoiceId ||
                crReferenceNumber ||
                crReceivedAt ||
                crNotes ||
                crItems.length > 0) && (
                <button
                  onClick={clearConsignmentReceiptForm}
                  disabled={crSaving}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    background: "rgba(255,255,255,.08)",
                    color: "#d7aabd",
                    cursor: crSaving ? "not-allowed" : "pointer",
                  }}
                >
                  مسح
                </button>
              )}

              <button
                onClick={saveConsignmentReceipt}
                disabled={crSaving || !crSupplierId || crItems.length === 0}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  background: "#a78bfa",
                  color: "#fff",
                  fontWeight: 800,
                  cursor:
                    crSaving || !crSupplierId || crItems.length === 0
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    crSaving || !crSupplierId || crItems.length === 0 ? 0.5 : 1,
                }}
              >
                {crSaving ? "جارٍ الحفظ..." : "تسجيل استلام الأمانات"}
              </button>
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#fff4f8",
                    margin: 0,
                  }}
                >
                  سجل استلامات الأمانات
                </h2>

                <div
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    marginTop: 4,
                  }}
                >
                  مخزون مملوك للمورد ومفصول عن المخزون المملوك لـ FitZone.
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                }}
              >
                الإجمالي: {consignmentReceipts.length}
              </div>
            </div>

            {consignmentReceipts.length === 0 ? (
              <div
                style={{
                  padding: 30,
                  textAlign: "center",
                  color: "#d7aabd",
                  background: "rgba(0,0,0,.15)",
                  borderRadius: 12,
                }}
              >
                لا توجد استلامات أمانات بعد.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {consignmentReceipts.map((receipt) => (
                  <div
                    key={receipt.id}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.08)",
                      background: "rgba(0,0,0,.15)",
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: "#fff4f8",
                            fontWeight: 800,
                            fontSize: 14,
                          }}
                        >
                          {receipt.referenceNumber ??
                            `استلام #${receipt.id.slice(-8)}`}
                        </div>

                        <div
                          style={{
                            marginTop: 4,
                            color: "#d7aabd",
                            fontSize: 11,
                          }}
                        >
                          المورد: {receipt.supplierName}
                          {receipt.supplierCode
                            ? ` • #${receipt.supplierCode}`
                            : ""}
                        </div>

                        <div
                          style={{
                            marginTop: 2,
                            color: "#d7aabd",
                            fontSize: 11,
                          }}
                        >
                          الاستلام:{" "}
                          {new Date(receipt.receivedAt).toLocaleString("ar-EG")}
                        </div>

                        {receipt.purchaseInvoice && (
                          <div
                            style={{
                              marginTop: 2,
                              color: "#c4b5fd",
                              fontSize: 11,
                            }}
                          >
                            فاتورة الأمانات:{" "}
                            {receipt.purchaseInvoice.invoiceNumber ??
                              `#${receipt.purchaseInvoice.id.slice(-8)}`}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            color: "#ffd166",
                            fontWeight: 900,
                            fontSize: 15,
                          }}
                        >
                          {receipt.totalDeclaredCost.toLocaleString("ar-EG")}{" "}
                          ج.م
                        </div>

                        <div
                          style={{
                            marginTop: 5,
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: 20,
                            background:
                              receipt.status === "posted"
                                ? "rgba(74,222,128,.12)"
                                : "rgba(248,113,113,.12)",
                            color:
                              receipt.status === "posted"
                                ? "#4ade80"
                                : "#f87171",
                            fontSize: 11,
                          }}
                        >
                          {receipt.status === "posted"
                            ? "مستلم"
                            : receipt.status}
                        </div>
                      </div>
                    </div>

                    {receipt.notes && (
                      <div
                        style={{
                          marginTop: 10,
                          color: "#9a8a90",
                          fontSize: 11,
                        }}
                      >
                        {receipt.notes}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 12,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      {receipt.lots.map((lot) => {
                        const variantLabel = lot.variant
                          ? [lot.variant.size, lot.variant.color]
                              .filter(Boolean)
                              .join(" / ")
                          : "";

                        return (
                          <div
                            key={lot.id}
                            style={{
                              background: "rgba(255,255,255,.04)",
                              borderRadius: 10,
                              padding: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    color: "#fff4f8",
                                    fontSize: 12,
                                    fontWeight: 700,
                                  }}
                                >
                                  {lot.productName}
                                  {variantLabel ? ` — ${variantLabel}` : ""}
                                  {lot.sku ? ` — ${lot.sku}` : ""}
                                </div>

                                <div
                                  style={{
                                    marginTop: 3,
                                    color: "#d7aabd",
                                    fontSize: 11,
                                  }}
                                >
                                  تكلفة الوحدة:{" "}
                                  {lot.unitCost.toLocaleString("ar-EG")} ج.م
                                </div>
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                  fontSize: 11,
                                }}
                              >
                                <span
                                  style={{
                                    color: "#d7aabd",
                                  }}
                                >
                                  مستلم:{" "}
                                  <b
                                    style={{
                                      color: "#fff4f8",
                                    }}
                                  >
                                    {lot.quantityReceived}
                                  </b>
                                </span>

                                <span
                                  style={{
                                    color: "#d7aabd",
                                  }}
                                >
                                  متاح:{" "}
                                  <b
                                    style={{
                                      color: "#4ade80",
                                    }}
                                  >
                                    {lot.quantityAvailable}
                                  </b>
                                </span>

                                <span
                                  style={{
                                    color: "#d7aabd",
                                  }}
                                >
                                  مباع:{" "}
                                  <b
                                    style={{
                                      color: "#ffd166",
                                    }}
                                  >
                                    {lot.quantitySold}
                                  </b>
                                </span>

                                <span
                                  style={{
                                    color: "#d7aabd",
                                  }}
                                >
                                  مرتجع للمورد:{" "}
                                  <b
                                    style={{
                                      color: "#f87171",
                                    }}
                                  >
                                    {lot.quantityReturned}
                                  </b>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Purchase Invoices ── */}
      {tab === "purchaseInvoices" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={CARD}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                marginTop: 0,
                marginBottom: 16,
              }}
            >
              إنشاء فاتورة مورد
            </h2>

            <div
              style={{
                fontSize: 11,
                color: "#d7aabd",
                marginBottom: 16,
              }}
            >
              تحفظ الفاتورة كمسودة أولًا، ولا يتم إنشاء قيد محاسبي إلا عند
              الترحيل.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  المورد *
                </label>
                <select
                  value={piSupplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPiSupplierId(id);

                    const supplier = suppliers.find((item) => item.id === id);

                    setPiPaymentTerms(supplier?.defaultPaymentTerms ?? "");

                    setPiSupplyType("purchase");
                    setPiItems([]);
                    setPiDraftItem({
                      productId: "",
                      variantId: "",
                      quantity: 1,
                      unitCost: 0,
                    });
                  }}
                  style={INPUT}
                  disabled={piSaving}
                >
                  <option value="">اختر المورد</option>
                  {suppliers
                    .filter((supplier) => supplier.isActive)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.code ? ` (#${supplier.code})` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  نوع التوريد *
                </label>
                <select
                  value={piSupplyType}
                  onChange={(e) => {
                    const value = e.target.value as "purchase" | "consignment";

                    if (value === "consignment") {
                      const supplier = suppliers.find(
                        (item) => item.id === piSupplierId,
                      );

                      if (!supplier?.supportsConsignment) {
                        alert("هذا المورد غير مفعّل لتوريد الأمانات");
                        return;
                      }
                    }

                    setPiSupplyType(value);
                  }}
                  style={INPUT}
                  disabled={!piSupplierId || piSaving}
                >
                  <option value="purchase">شراء عادي</option>
                  <option
                    value="consignment"
                    disabled={
                      !suppliers.find((item) => item.id === piSupplierId)
                        ?.supportsConsignment
                    }
                  >
                    أمانات
                  </option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  رقم فاتورة المورد
                </label>
                <input
                  value={piInvoiceNumber}
                  onChange={(e) => setPiInvoiceNumber(e.target.value)}
                  style={INPUT}
                  placeholder="INV-001"
                  disabled={piSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  تاريخ الفاتورة *
                </label>
                <input
                  type="date"
                  value={piInvoiceDate}
                  onChange={(e) => setPiInvoiceDate(e.target.value)}
                  style={{ ...INPUT, direction: "ltr" }}
                  disabled={piSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  تاريخ الاستحقاق
                </label>
                <input
                  type="date"
                  value={piDueDate}
                  onChange={(e) => setPiDueDate(e.target.value)}
                  style={{ ...INPUT, direction: "ltr" }}
                  disabled={piSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  شروط السداد
                </label>
                <select
                  value={piPaymentTerms}
                  onChange={(e) => setPiPaymentTerms(e.target.value)}
                  style={INPUT}
                  disabled={piSaving}
                >
                  <option value="">غير محدد</option>
                  <option value="cash">نقدي</option>
                  <option value="credit">آجل</option>
                  <option value="mixed">مختلط</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  ملاحظات
                </label>
                <input
                  value={piNotes}
                  onChange={(e) => setPiNotes(e.target.value)}
                  style={INPUT}
                  disabled={piSaving}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 12,
                background: "rgba(0,0,0,.2)",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: "#fff4f8",
                  fontSize: 13,
                  marginBottom: 10,
                }}
              >
                بنود الفاتورة
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(180px,2fr) minmax(150px,1.4fr) 90px 120px auto",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    المنتج *
                  </label>
                  <select
                    value={piDraftItem.productId}
                    onChange={(e) => {
                      const productId = e.target.value;
                      const product = purchaseInvoiceProducts.find(
                        (item) => item.id === productId,
                      );

                      const hasVariants = Boolean(product?.variants?.length);

                      setPiDraftItem({
                        ...piDraftItem,
                        productId,
                        variantId: "",
                        unitCost: hasVariants
                          ? 0
                          : Number(product?.costPrice ?? 0),
                      });
                    }}
                    style={INPUT}
                    disabled={!piSupplierId || piSaving}
                  >
                    <option value="">
                      {piSupplierId
                        ? purchaseInvoiceProducts.length
                          ? "اختر المنتج"
                          : "لا توجد منتجات مرتبطة بهذا المورد"
                        : "اختر المورد أولًا"}
                    </option>

                    {purchaseInvoiceProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.supplierName
                          ? ` — ${product.supplierName}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    المقاس / اللون
                  </label>
                  <select
                    value={piDraftItem.variantId}
                    onChange={(e) => {
                      const variantId = e.target.value;
                      const variant =
                        selectedPurchaseInvoiceProduct?.variants?.find(
                          (item) => item.id === variantId,
                        );

                      setPiDraftItem({
                        ...piDraftItem,
                        variantId,
                        unitCost: Number(
                          variant?.costPrice ??
                            selectedPurchaseInvoiceProduct?.costPrice ??
                            0,
                        ),
                      });
                    }}
                    style={INPUT}
                    disabled={
                      piSaving ||
                      !selectedPurchaseInvoiceProduct ||
                      !selectedPurchaseInvoiceProduct.variants?.length
                    }
                  >
                    <option value="">
                      {selectedPurchaseInvoiceProduct?.variants?.length
                        ? "اختر المقاس / اللون"
                        : "لا يوجد Variant"}
                    </option>

                    {(selectedPurchaseInvoiceProduct?.variants ?? []).map(
                      (variant) => (
                        <option key={variant.id} value={variant.id}>
                          {[variant.size, variant.color]
                            .filter(Boolean)
                            .join(" / ") || "Variant"}
                          {variant.sku ? ` — ${variant.sku}` : ""}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    الكمية
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={piDraftItem.quantity}
                    onChange={(e) =>
                      setPiDraftItem({
                        ...piDraftItem,
                        quantity: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                    disabled={piSaving}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    تكلفة الوحدة
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={piDraftItem.unitCost}
                    onChange={(e) =>
                      setPiDraftItem({
                        ...piDraftItem,
                        unitCost: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                    disabled={piSaving}
                  />
                </div>

                <button
                  onClick={addPurchaseInvoiceItem}
                  disabled={piSaving}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 14px",
                    background: "#e91e63",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: piSaving ? "not-allowed" : "pointer",
                  }}
                >
                  إضافة
                </button>
              </div>

              {piItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {piItems.map((item, index) => {
                    const product = products.find(
                      (productItem) => productItem.id === item.productId,
                    );
                    const variant = product?.variants?.find(
                      (variantItem) => variantItem.id === item.variantId,
                    );
                    const variantLabel = variant
                      ? [variant.size, variant.color]
                          .filter(Boolean)
                          .join(" / ")
                      : "";

                    return (
                      <div
                        key={`${item.productId}-${item.variantId}-${index}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "rgba(255,255,255,.04)",
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ color: "#fff4f8", fontSize: 12 }}>
                          {product?.name ?? "منتج"}
                          {variantLabel ? ` — ${variantLabel}` : ""}
                          {product?.supplierName
                            ? ` — ${product.supplierName}`
                            : ""}
                        </div>

                        <div style={{ color: "#d7aabd", fontSize: 11 }}>
                          {item.quantity} ×{" "}
                          {item.unitCost.toLocaleString("ar-EG")} ={" "}
                          <b style={{ color: "#ffd166" }}>
                            {(item.quantity * item.unitCost).toLocaleString(
                              "ar-EG",
                            )}{" "}
                            ج.م
                          </b>
                        </div>

                        <button
                          onClick={() =>
                            setPiItems((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                          disabled={piSaving}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#f87171",
                            cursor: "pointer",
                            fontSize: 18,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ color: "#ffd166", fontWeight: 800 }}>
                الإجمالي: {purchaseInvoiceTotal.toLocaleString("ar-EG")} ج.م
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {piItems.length > 0 && (
                  <button
                    onClick={clearPurchaseInvoiceForm}
                    disabled={piSaving}
                    style={{
                      border: "none",
                      borderRadius: 8,
                      padding: "9px 16px",
                      background: "rgba(255,255,255,.08)",
                      color: "#d7aabd",
                    }}
                  >
                    مسح
                  </button>
                )}

                <button
                  onClick={savePurchaseInvoiceDraft}
                  disabled={
                    piSaving ||
                    !piSupplierId ||
                    !piInvoiceDate ||
                    piItems.length === 0
                  }
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 18px",
                    background: "#e91e63",
                    color: "#fff",
                    fontWeight: 800,
                    opacity:
                      piSaving ||
                      !piSupplierId ||
                      !piInvoiceDate ||
                      piItems.length === 0
                        ? 0.5
                        : 1,
                  }}
                >
                  {piSaving ? "جارٍ الحفظ..." : "حفظ كمسودة"}
                </button>
              </div>
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "#fff4f8",
                    margin: 0,
                  }}
                >
                  فواتير الموردين
                </h2>
                <div style={{ fontSize: 11, color: "#d7aabd", marginTop: 4 }}>
                  هذه مستندات مالية مستقلة عن استلام المخزون.
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                }}
              >
                الإجمالي: {purchaseInvoices.length}
              </div>
            </div>

            {purchaseInvoices.length === 0 ? (
              <div
                style={{
                  padding: 30,
                  textAlign: "center",
                  color: "#d7aabd",
                  background: "rgba(0,0,0,.15)",
                  borderRadius: 12,
                }}
              >
                لا توجد فواتير موردين بعد.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {purchaseInvoices.map((invoice) => {
                  const isDraft = invoice.documentStatus === "draft";
                  const isPosted = invoice.documentStatus === "posted";
                  const isCancelled = invoice.documentStatus === "cancelled";

                  return (
                    <div
                      key={invoice.id}
                      style={{
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,.08)",
                        padding: 14,
                        background: "rgba(0,0,0,.15)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 220 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: "#fff4f8",
                              fontSize: 14,
                            }}
                          >
                            {invoice.invoiceNumber ??
                              `فاتورة #${invoice.id.slice(-8)}`}
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: "#d7aabd",
                              marginTop: 4,
                            }}
                          >
                            {invoice.supplier.name}
                            {invoice.supplier.code
                              ? ` • #${invoice.supplier.code}`
                              : ""}
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: "#d7aabd",
                              marginTop: 2,
                            }}
                          >
                            تاريخ الفاتورة:{" "}
                            {new Date(invoice.invoiceDate).toLocaleDateString(
                              "ar-EG",
                            )}
                          </div>

                          {invoice.dueDate && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#d7aabd",
                                marginTop: 2,
                              }}
                            >
                              الاستحقاق:{" "}
                              {new Date(invoice.dueDate).toLocaleDateString(
                                "ar-EG",
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          style={{
                            minWidth: 210,
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              color: "#ffd166",
                              fontWeight: 900,
                              fontSize: 15,
                            }}
                          >
                            {invoice.totalAmount.toLocaleString("ar-EG")} ج.م
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: "#4ade80",
                              marginTop: 3,
                            }}
                          >
                            المدفوع:{" "}
                            {invoice.paidAmount.toLocaleString("ar-EG")} ج.م
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color:
                                invoice.outstandingAmount > 0
                                  ? "#f87171"
                                  : "#4ade80",
                              marginTop: 2,
                            }}
                          >
                            المتبقي:{" "}
                            {invoice.outstandingAmount.toLocaleString("ar-EG")}{" "}
                            ج.م
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginTop: 12,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background: isDraft
                              ? "rgba(255,209,102,.12)"
                              : isPosted
                                ? "rgba(74,222,128,.12)"
                                : "rgba(248,113,113,.12)",
                            color: isDraft
                              ? "#ffd166"
                              : isPosted
                                ? "#4ade80"
                                : "#f87171",
                          }}
                        >
                          {isDraft ? "مسودة" : isPosted ? "مرحلة" : "ملغاة"}
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background:
                              invoice.supplyType === "consignment"
                                ? "rgba(167,139,250,.12)"
                                : "rgba(74,222,128,.10)",
                            color:
                              invoice.supplyType === "consignment"
                                ? "#c4b5fd"
                                : "#86efac",
                          }}
                        >
                          {invoice.supplyType === "consignment"
                            ? "أمانات"
                            : "شراء"}
                        </span>

                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 9px",
                            borderRadius: 20,
                            background: "rgba(255,255,255,.06)",
                            color: "#d7aabd",
                          }}
                        >
                          {invoice.paymentStatus === "paid"
                            ? "مدفوعة بالكامل"
                            : invoice.paymentStatus === "partially_paid"
                              ? "مدفوعة جزئيًا"
                              : "غير مدفوعة"}
                        </span>

                        {invoice.paymentTerms && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#d7aabd",
                            }}
                          >
                            {invoice.paymentTerms === "cash"
                              ? "نقدي"
                              : invoice.paymentTerms === "credit"
                                ? "آجل"
                                : "مختلط"}
                          </span>
                        )}
                      </div>

                      {invoice.notes && (
                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 11,
                            color: "#9a8a90",
                          }}
                        >
                          {invoice.notes}
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 12,
                          justifyContent: "flex-end",
                          flexWrap: "wrap",
                        }}
                      >
                        {isDraft && invoice.supplyType !== "consignment" && (
                          <button
                            onClick={async () => {
                              const res = await fetch(
                                "/api/admin/purchase-invoices",
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    id: invoice.id,
                                    action: "post",
                                  }),
                                },
                              );

                              const data = (await res
                                .json()
                                .catch(() => ({}))) as {
                                error?: string;
                              };

                              if (!res.ok) {
                                alert(data.error ?? "تعذر ترحيل الفاتورة");
                                return;
                              }

                              await loadData();
                            }}
                            style={{
                              border: "none",
                              borderRadius: 8,
                              padding: "7px 13px",
                              background: "#4ade80",
                              color: "#000",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            ترحيل الفاتورة
                          </button>
                        )}

                        {isPosted && invoice.paidAmount === 0 && (
                          <button
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "تأكيد إلغاء فاتورة المورد؟ سيتم إنشاء قيد عكسي محاسبي.",
                                )
                              ) {
                                return;
                              }

                              const res = await fetch(
                                "/api/admin/purchase-invoices",
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    id: invoice.id,
                                    action: "cancel",
                                  }),
                                },
                              );

                              const data = (await res
                                .json()
                                .catch(() => ({}))) as {
                                error?: string;
                              };

                              if (!res.ok) {
                                alert(data.error ?? "تعذر إلغاء الفاتورة");
                                return;
                              }

                              await loadData();
                            }}
                            style={{
                              border: "1px solid rgba(248,113,113,.3)",
                              borderRadius: 8,
                              padding: "7px 13px",
                              background: "rgba(248,113,113,.08)",
                              color: "#f87171",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            إلغاء الفاتورة
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Supplier Payments ── */}
      {tab === "supplierPayments" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "#fff4f8",
                    fontWeight: 900,
                  }}
                >
                  أرصدة الموردين
                </h2>
                <div
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    marginTop: 4,
                  }}
                >
                  الرصيد يشمل فواتير الشراء المرحلة ومستحقات مبيعات الأمانات.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  disabled={supplierBalancesLoading || Boolean(supplierBalancesError)}
                  onClick={() =>
                    printSupplierBalancesReport({
                      rows: supplierBalances,
                    })
                  }
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 13px",
                    background: "#e91e63",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  تقرير PDF
                </button>

                <button
                  disabled={supplierBalancesLoading || Boolean(supplierBalancesError)}
                  onClick={exportSupplierBalancesCsv}
                  style={{
                    border: "1px solid rgba(255,255,255,.14)",
                    borderRadius: 8,
                    padding: "8px 13px",
                    background: "rgba(255,255,255,.06)",
                    color: "#fff4f8",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  تصدير CSV
                </button>
              </div>
            </div>

            {supplierBalancesLoading && (
              <div style={{ marginBottom: 10, color: "#d7aabd", fontSize: 12 }}>
                {"\u062c\u0627\u0631\u064d \u062a\u062d\u062f\u064a\u062b \u0623\u0631\u0635\u062f\u0629 \u0627\u0644\u0645\u0648\u0631\u062f\u064a\u0646..."}
              </div>
            )}

            {supplierBalancesError && (
              <div style={{ marginBottom: 10, color: "#ff9ebf", fontSize: 12 }}>
                {supplierBalancesError}
                {" ? \u064a\u062a\u0645 \u0639\u0631\u0636 \u0622\u062e\u0631 \u0628\u064a\u0627\u0646\u0627\u062a \u0646\u0627\u062c\u062d\u0629 \u0625\u0646 \u0648\u062c\u062f\u062a."}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr style={{ color: "#d7aabd" }}>
                    <th style={{ padding: 8, textAlign: "right" }}>المورد</th>
                    <th style={{ padding: 8, textAlign: "right" }}>
                      فواتير شراء
                    </th>
                    <th style={{ padding: 8, textAlign: "right" }}>
                      أمانات
                    </th>
                    <th style={{ padding: 8, textAlign: "right" }}>
                      الرصيد
                    </th>
                    <th style={{ padding: 8, textAlign: "right" }}>
                      إجراء
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {supplierBalances.map((row) => (
                    <tr
                      key={row.supplierId}
                      style={{
                        borderTop: "1px solid rgba(255,255,255,.07)",
                      }}
                    >
                      <td style={{ padding: 9, color: "#fff4f8" }}>
                        <b>{row.supplierName}</b>
                        {row.supplierCode
                          ? ` • #${row.supplierCode}`
                          : ""}
                      </td>

                      <td style={{ padding: 9 }}>
                        {row.invoiceOutstanding.toLocaleString("ar-EG")} ج.م
                      </td>

                      <td style={{ padding: 9 }}>
                        {row.consignmentOutstanding.toLocaleString("ar-EG")} ج.م
                      </td>

                      <td
                        style={{
                          padding: 9,
                          fontWeight: 900,
                          color:
                            row.totalOutstanding > 0
                              ? "#ffd166"
                              : row.totalOutstanding < 0
                                ? "#4ade80"
                                : "#d7aabd",
                        }}
                      >
                        {row.totalOutstanding.toLocaleString("ar-EG")} ج.م
                      </td>

                      <td style={{ padding: 9 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            disabled={
                              !row.isActive ||
                              row.isDeleted
                            }
                            onClick={() => {
                              if (
                                !row.isActive ||
                                row.isDeleted
                              ) {
                                return;
                              }

                              setSpSupplierId(
                                row.supplierId,
                              );
                              setSpSourceType("invoice");
                              setSpInvoiceId("");
                              setSpLiabilityId("");
                              setSpAmount("");
                            }}
                            title={
                              !row.isActive
                                ? "لا يمكن تسجيل دفعة لمورد غير نشط"
                                : row.isDeleted
                                  ? "لا يمكن تسجيل دفعة لمورد محذوف"
                                  : "تسجيل دفعة للمورد"
                            }
                            style={{
                              border: "none",
                              borderRadius: 7,
                              padding: "6px 10px",
                              background:
                                !row.isActive ||
                                row.isDeleted
                                  ? "rgba(255,255,255,.05)"
                                  : "rgba(233,30,99,.15)",
                              color:
                                !row.isActive ||
                                row.isDeleted
                                  ? "#76636b"
                                  : "#ff8fbd",
                              cursor:
                                !row.isActive ||
                                row.isDeleted
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            سداد
                          </button>

                          <button
                            onClick={() =>
                              setStatementSupplierId(row.supplierId)
                            }
                            style={{
                              border: "none",
                              borderRadius: 7,
                              padding: "6px 10px",
                              background: "rgba(255,255,255,.07)",
                              color: "#d7aabd",
                              cursor: "pointer",
                            }}
                          >
                            كشف حساب
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "#fff4f8",
                    fontWeight: 900,
                  }}
                >
                  كشف حساب المورد
                </h2>

                <div
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    marginTop: 4,
                  }}
                >
                  رصيد افتتاحي، استحقاقات، دفعات، ورصيد ختامي.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  disabled={supplierStatementLoading || Boolean(supplierStatementError) || !statementData.supplier}
                  onClick={() => {
                    if (!statementData.supplier) return;

                    printSupplierStatement({
                      supplierName: statementData.supplier.name,
                      supplierCode: statementData.supplier.code ?? null,
                      from: statementFrom || null,
                      to: statementTo || null,
                      openingBalance: statementData.openingBalance,
                      debitTotal: statementData.debitTotal,
                      creditTotal: statementData.creditTotal,
                      closingBalance: statementData.closingBalance,
                      entries: statementData.entries,
                    });
                  }}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 13px",
                    background: "#e91e63",
                    color: "#fff",
                    cursor: statementData.supplier
                      ? "pointer"
                      : "not-allowed",
                    opacity: statementData.supplier ? 1 : 0.5,
                    fontWeight: 800,
                  }}
                >
                  كشف حساب PDF
                </button>

                <button
                  disabled={supplierStatementLoading || Boolean(supplierStatementError) || !statementData.supplier}
                  onClick={exportSupplierStatementCsv}
                  style={{
                    border: "1px solid rgba(255,255,255,.14)",
                    borderRadius: 8,
                    padding: "8px 13px",
                    background: "rgba(255,255,255,.06)",
                    color: "#fff4f8",
                    cursor: statementData.supplier
                      ? "pointer"
                      : "not-allowed",
                    opacity: statementData.supplier ? 1 : 0.5,
                    fontWeight: 700,
                  }}
                >
                  تصدير CSV
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <select
                value={statementSupplierId}
                onChange={(e) =>
                  setStatementSupplierId(
                    e.target.value,
                  )
                }
                style={INPUT}
              >
                <option value="">اختر المورد</option>

                {statementSuppliers.map(
                  (supplier) => (
                    <option
                      key={supplier.supplierId}
                      value={supplier.supplierId}
                    >
                      {supplier.supplierName}
                      {supplier.supplierCode
                        ? ` (#${supplier.supplierCode})`
                        : ""}
                      {!supplier.isActive
                        ? " — غير نشط"
                        : ""}
                      {supplier.isDeleted
                        ? " — محذوف"
                        : ""}
                    </option>
                  ),
                )}
              </select>

              <input
                type="date"
                value={statementFrom}
                onChange={(e) => setStatementFrom(e.target.value)}
                style={{ ...INPUT, direction: "ltr" }}
                aria-label="من تاريخ"
              />

              <input
                type="date"
                value={statementTo}
                onChange={(e) => setStatementTo(e.target.value)}
                style={{ ...INPUT, direction: "ltr" }}
                aria-label="إلى تاريخ"
              />
            </div>

            {supplierStatementLoading && (
              <div style={{ marginBottom: 12, color: "#d7aabd", fontSize: 12 }}>
                {"\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0643\u0634\u0641 \u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0631\u062f..."}
              </div>
            )}

            {supplierStatementError && (
              <div style={{ marginBottom: 12, color: "#ff9ebf", fontSize: 12 }}>
                {supplierStatementError}
              </div>
            )}
            {statementData.supplier && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  {[
                    ["الرصيد الافتتاحي", statementData.openingBalance],
                    ["إجمالي الاستحقاقات", statementData.debitTotal],
                    ["إجمالي السداد / العكس", statementData.creditTotal],
                    ["الرصيد الختامي", statementData.closingBalance],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "rgba(0,0,0,.18)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "#d7aabd",
                          marginBottom: 4,
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          color: "#fff4f8",
                          fontWeight: 900,
                          fontSize: 15,
                        }}
                      >
                        {Number(value).toLocaleString("ar-EG")} ج.م
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 11,
                    }}
                  >
                    <thead>
                      <tr style={{ color: "#d7aabd" }}>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          التاريخ
                        </th>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          الحركة
                        </th>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          المرجع
                        </th>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          مدين
                        </th>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          دائن
                        </th>
                        <th style={{ padding: 7, textAlign: "right" }}>
                          الرصيد
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.entries.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              padding: 18,
                              textAlign: "center",
                              color: "#d7aabd",
                            }}
                          >
                            لا توجد حركات في الفترة المختارة.
                          </td>
                        </tr>
                      ) : (
                        statementData.entries.map((entry, index) => (
                          <tr
                            key={`${entry.date}-${entry.reference}-${index}`}
                            style={{
                              borderTop:
                                "1px solid rgba(255,255,255,.06)",
                            }}
                          >
                            <td style={{ padding: 7 }}>
                              {entry.dateKey}
                            </td>
                            <td style={{ padding: 7 }}>
                              {entry.type}
                            </td>
                            <td style={{ padding: 7 }}>
                              {entry.reference}
                            </td>
                            <td style={{ padding: 7 }}>
                              {entry.debit
                                ? entry.debit.toLocaleString("ar-EG")
                                : "—"}
                            </td>
                            <td style={{ padding: 7 }}>
                              {entry.credit
                                ? entry.credit.toLocaleString("ar-EG")
                                : "—"}
                            </td>
                            <td
                              style={{
                                padding: 7,
                                fontWeight: 800,
                                color: "#ffd166",
                              }}
                            >
                              {entry.balance.toLocaleString("ar-EG")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div style={CARD}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                marginTop: 0,
                marginBottom: 6,
              }}
            >
              تسجيل دفعة مورد
            </h2>

            <div
              style={{
                fontSize: 11,
                color: "#d7aabd",
                marginBottom: 16,
              }}
            >
              يتم إنشاء الدفعة كمسودة أولًا. حاليًا طريقة السداد المتاحة
              محاسبيًا هي النقدي فقط.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                gap: 12,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  المورد *
                </label>

                <select
                  value={spSupplierId}
                  onChange={(e) => {
                    setSpSupplierId(e.target.value);
                    setSpInvoiceId("");
                    setSpLiabilityId("");
                    setSpAmount("");
                  }}
                  style={INPUT}
                  disabled={spSaving}
                >
                  <option value="">اختر المورد</option>

                  {suppliers
                    .filter((supplier) => supplier.isActive)
                    .map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.code ? ` (#${supplier.code})` : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  نوع المستحق *
                </label>

                <select
                  value={spSourceType}
                  onChange={(e) => {
                    const next = e.target.value as
                      | "invoice"
                      | "consignment";

                    setSpSourceType(next);
                    setSpInvoiceId("");
                    setSpLiabilityId("");
                    setSpAmount("");
                  }}
                  style={INPUT}
                  disabled={!spSupplierId || spSaving}
                >
                  <option value="invoice">فاتورة مشتريات</option>
                  <option value="consignment">مبيعات أمانات</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  {spSourceType === "invoice"
                    ? "الفاتورة *"
                    : "استحقاق الأمانات *"}
                </label>

                {spSourceType === "invoice" ? (
                  <select
                    value={spInvoiceId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSpInvoiceId(id);

                      const invoice = supplierPaymentInvoices.find(
                        (item) => item.id === id,
                      );

                      setSpAmount(
                        invoice
                          ? String(invoice.outstandingAmount)
                          : "",
                      );
                    }}
                    style={INPUT}
                    disabled={!spSupplierId || spSaving || supplierPayablesLoading}
                  >
                    <option value="">
                      {supplierPayablesError
                        ? "تعذر تحميل الفواتير"
                        : supplierPayablesLoading
                          ? "جارٍ تحميل الفواتير..."
                          : spSupplierId
                            ? "اختر الفاتورة"
                            : "اختر المورد أولًا"}
                    </option>

                    {eligibleSupplierPaymentInvoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoiceNumber ??
                          `#${invoice.id.slice(-8)}`}{" "}
                        — متبقي{" "}
                        {invoice.outstandingAmount.toLocaleString(
                          "ar-EG",
                        )}{" "}
                        ج.م
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={spLiabilityId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSpLiabilityId(id);

                      const liability =
                        supplierPaymentLiabilities.find(
                          (item) => item.id === id,
                        );

                      setSpAmount(
                        liability
                          ? String(liability.outstandingAmount)
                          : "",
                      );
                    }}
                    style={INPUT}
                    disabled={!spSupplierId || spSaving || supplierPayablesLoading}
                  >
                    <option value="">
                      {supplierPayablesError
                        ? "تعذر تحميل الاستحقاقات"
                        : supplierPayablesLoading
                          ? "جارٍ تحميل الاستحقاقات..."
                          : spSupplierId
                            ? "اختر الاستحقاق"
                            : "اختر المورد أولًا"}
                    </option>

                    {eligibleSupplierPaymentLiabilities.map(
                      (liability) => (
                        <option
                          key={liability.id}
                          value={liability.id}
                        >
                          طلب #{liability.orderId.slice(-8)} — متبقي{" "}
                          {liability.outstandingAmount.toLocaleString(
                            "ar-EG",
                          )}{" "}
                          ج.م
                        </option>
                      ),
                    )}
                  </select>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  مبلغ السداد *
                </label>

                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  max={selectedSupplierPayableOutstanding || undefined}
                  value={spAmount}
                  onChange={(e) => setSpAmount(e.target.value)}
                  style={{
                    ...INPUT,
                    direction: "ltr",
                  }}
                  disabled={
                    selectedSupplierPayableOutstanding <= 0 || spSaving
                  }
                />

                {selectedSupplierPayableOutstanding > 0 && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#d7aabd",
                      marginTop: 4,
                    }}
                  >
                    الحد الأقصى:{" "}
                    {selectedSupplierPayableOutstanding.toLocaleString(
                      "ar-EG",
                    )}{" "}
                    ج.م
                  </div>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  تاريخ السداد *
                </label>

                <input
                  type="date"
                  value={spPaymentDate}
                  onChange={(e) => setSpPaymentDate(e.target.value)}
                  style={{
                    ...INPUT,
                    direction: "ltr",
                  }}
                  disabled={spSaving}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  طريقة السداد
                </label>

                <input
                  value="نقدي"
                  disabled
                  readOnly
                  style={{
                    ...INPUT,
                    opacity: 0.6,
                    cursor: "not-allowed",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  رقم المرجع
                </label>

                <input
                  value={spReferenceNumber}
                  onChange={(e) => setSpReferenceNumber(e.target.value)}
                  style={INPUT}
                  disabled={spSaving}
                  placeholder="PAY-001"
                />
              </div>

              <div
                style={{
                  gridColumn: "1 / -1",
                }}
              >
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "#d7aabd",
                    marginBottom: 4,
                  }}
                >
                  ملاحظات
                </label>

                <textarea
                  value={spNotes}
                  onChange={(e) => setSpNotes(e.target.value)}
                  style={{
                    ...INPUT,
                    minHeight: 60,
                    resize: "vertical",
                  }}
                  disabled={spSaving}
                />
              </div>
            </div>

            {(selectedSupplierPaymentInvoice ||
              selectedSupplierPaymentLiability) && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(0,0,0,.2)",
                  fontSize: 12,
                  color: "#d7aabd",
                }}
              >
                {spSourceType === "invoice" &&
                  selectedSupplierPaymentInvoice && (
                    <>
                      إجمالي الفاتورة:{" "}
                      <b style={{ color: "#fff4f8" }}>
                        {selectedSupplierPaymentInvoice.totalAmount.toLocaleString(
                          "ar-EG",
                        )}{" "}
                        ج.م
                      </b>
                      {" • "}
                      مدفوع:{" "}
                      <b style={{ color: "#4ade80" }}>
                        {selectedSupplierPaymentInvoice.paidAmount.toLocaleString(
                          "ar-EG",
                        )}{" "}
                        ج.م
                      </b>
                    </>
                  )}

                {spSourceType === "consignment" &&
                  selectedSupplierPaymentLiability && (
                    <>
                      الطلب:{" "}
                      <b style={{ color: "#fff4f8" }}>
                        #
                        {selectedSupplierPaymentLiability.orderId.slice(
                          -8,
                        )}
                      </b>
                      {" • "}
                      أصل المستحق:{" "}
                      <b style={{ color: "#fff4f8" }}>
                        {selectedSupplierPaymentLiability.grossAmount.toLocaleString(
                          "ar-EG",
                        )}{" "}
                        ج.م
                      </b>
                      {" • "}
                      مدفوع:{" "}
                      <b style={{ color: "#4ade80" }}>
                        {selectedSupplierPaymentLiability.paidAmount.toLocaleString(
                          "ar-EG",
                        )}{" "}
                        ج.م
                      </b>
                    </>
                  )}

                {" • "}
                متبقي:{" "}
                <b style={{ color: "#f87171" }}>
                  {selectedSupplierPayableOutstanding.toLocaleString(
                    "ar-EG",
                  )}{" "}
                  ج.م
                </b>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 16,
              }}
            >
              {(spSupplierId ||
                spInvoiceId ||
                spLiabilityId ||
                spAmount ||
                spPaymentDate) && (
                <button
                  onClick={clearSupplierPaymentForm}
                  disabled={spSaving}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 16px",
                    background: "rgba(255,255,255,.08)",
                    color: "#d7aabd",
                    cursor: spSaving ? "not-allowed" : "pointer",
                  }}
                >
                  مسح
                </button>
              )}

              <button
                onClick={saveSupplierPaymentDraft}
                disabled={
                  spSaving ||
                  !spSupplierId ||
                  (spSourceType === "invoice"
                    ? !spInvoiceId
                    : !spLiabilityId) ||
                  !spPaymentDate ||
                  !(Number(spAmount) > 0)
                }
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 18px",
                  background: "#e91e63",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: spSaving ? "not-allowed" : "pointer",
                  opacity:
                    spSaving ||
                    !spSupplierId ||
                    (spSourceType === "invoice"
                      ? !spInvoiceId
                      : !spLiabilityId) ||
                    !spPaymentDate ||
                    !(Number(spAmount) > 0)
                      ? 0.5
                      : 1,
                }}
              >
                {spSaving ? "جارٍ الحفظ..." : "حفظ الدفعة كمسودة"}
              </button>
            </div>
          </div>

          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "#fff4f8",
                    fontWeight: 900,
                  }}
                >
                  سجل مدفوعات الموردين
                </h2>

                <div
                  style={{
                    fontSize: 11,
                    color: "#d7aabd",
                    marginTop: 4,
                  }}
                >
                  المسودة لا تؤثر على الحسابات حتى يتم ترحيلها.
                </div>
              </div>

              <div
                style={{
                  color: "#d7aabd",
                  fontSize: 12,
                }}
              >
                الإجمالي: {supplierPayments.length}
              </div>
            </div>

            {supplierPayments.length === 0 ? (
              <div
                style={{
                  padding: 30,
                  textAlign: "center",
                  color: "#d7aabd",
                  borderRadius: 12,
                  background: "rgba(0,0,0,.15)",
                }}
              >
                لا توجد مدفوعات موردين بعد.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {supplierPayments.map((payment) => {
                  const isDraft = payment.status === "draft";
                  const isPosted = payment.status === "posted";

                  return (
                    <div
                      key={payment.id}
                      style={{
                        border: "1px solid rgba(255,255,255,.08)",
                        borderRadius: 12,
                        padding: 14,
                        background: "rgba(0,0,0,.15)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: "#fff4f8",
                              fontWeight: 800,
                              fontSize: 14,
                            }}
                          >
                            {payment.supplier.name}
                            {payment.supplier.code
                              ? ` • #${payment.supplier.code}`
                              : ""}
                          </div>

                          <div
                            style={{
                              fontSize: 11,
                              color: "#d7aabd",
                              marginTop: 3,
                            }}
                          >
                            {new Date(payment.paymentDate).toLocaleDateString(
                              "ar-EG",
                            )}
                            {" • "}
                            نقدي
                            {payment.referenceNumber
                              ? ` • ${payment.referenceNumber}`
                              : ""}
                          </div>
                        </div>

                        <div
                          style={{
                            color: "#ffd166",
                            fontWeight: 900,
                            fontSize: 15,
                          }}
                        >
                          {payment.amount.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          marginTop: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 20,
                            fontSize: 11,
                            background: isDraft
                              ? "rgba(255,209,102,.12)"
                              : isPosted
                                ? "rgba(74,222,128,.12)"
                                : "rgba(248,113,113,.12)",
                            color: isDraft
                              ? "#ffd166"
                              : isPosted
                                ? "#4ade80"
                                : "#f87171",
                          }}
                        >
                          {isDraft ? "مسودة" : isPosted ? "مرحلة" : "ملغاة"}
                        </span>
                      </div>

                      {payment.notes && (
                        <div
                          style={{
                            marginTop: 8,
                            color: "#9a8a90",
                            fontSize: 11,
                          }}
                        >
                          {payment.notes}
                        </div>
                      )}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 8,
                          marginTop: 12,
                        }}
                      >
                        {isDraft && (
                          <button
                            onClick={() =>
                              postSupplierPaymentFromUi(payment.id)
                            }
                            style={{
                              border: "none",
                              borderRadius: 8,
                              padding: "7px 13px",
                              background: "#4ade80",
                              color: "#000",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            ترحيل الدفعة
                          </button>
                        )}

                        {isPosted && (
                          <button
                            onClick={() =>
                              cancelSupplierPaymentFromUi(payment.id)
                            }
                            style={{
                              border: "1px solid rgba(248,113,113,.3)",
                              borderRadius: 8,
                              padding: "7px 13px",
                              background: "rgba(248,113,113,.08)",
                              color: "#f87171",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: 12,
                            }}
                          >
                            إلغاء الدفعة
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Adjustments ── */}
      {tab === "adjustments" && (
        <div style={CARD}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: "#fff4f8",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            تسوية المخزون اليدوية
          </h2>

          {/* Success Message */}
          {adjSuccess && (
            <div
              style={{
                background: "rgba(74,222,128,.1)",
                border: "1px solid rgba(74,222,128,.3)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>
                {adjSuccess}
              </div>
            </div>
          )}

          {/* API Error */}
          {adjApiError && (
            <div
              style={{
                background: "rgba(248,113,113,.1)",
                border: "1px solid rgba(248,113,113,.3)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
                whiteSpace: "pre-line",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#f87171",
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                ❌ خطأ
              </div>
              <div style={{ fontSize: 11, color: "#f87171" }}>
                {adjApiError}
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {adjErrors.length > 0 && (
            <div
              style={{
                background: "rgba(248,113,113,.1)",
                border: "1px solid rgba(248,113,113,.3)",
                borderRadius: 10,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#f87171",
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                يرجى تصحيح الأخطاء التالية:
              </div>
              <ul
                style={{
                  margin: "8px 0 0 0",
                  paddingRight: 20,
                  fontSize: 11,
                  color: "#f87171",
                }}
              >
                {adjErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Product Selection */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                color: "#d7aabd",
                display: "block",
                marginBottom: 4,
              }}
            >
              المنتج *
            </label>
            <select
              value={adjProduct?.id ?? ""}
              onChange={(e) => {
                const p = products.find((pr) => pr.id === e.target.value);
                setAdjProduct(p ?? null);
                setAdjQuantity("");
                setAdjUnitCost("");
                setAdjReason("");
                setAdjNotes("");
                invalidatePreview();
              }}
              disabled={submitting}
              style={{
                ...INPUT,
                opacity: submitting ? 0.5 : 1,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              <option value="">اختر منتجاً</option>
              {products
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Product Info */}
          {adjProduct && (
            <div
              style={{
                background: "rgba(0,0,0,.2)",
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, color: "#fff4f8", marginBottom: 4 }}>
                <b>{adjProduct.name}</b>
              </div>
              <div style={{ fontSize: 12, color: "#d7aabd" }}>
                الرصيد الحالي:{" "}
                <b style={{ color: "#ffd166" }}>{adjProduct.stock}</b>
              </div>
              <div style={{ fontSize: 12, color: "#d7aabd" }}>
                متوسط التكلفة:{" "}
                <b style={{ color: "#4ade80" }}>
                  {adjProduct.averageCost?.toLocaleString("ar-EG", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }) ?? "0.00"}{" "}
                  ج.م
                </b>
              </div>
              {adjProduct.lastPurchaseCost != null &&
                adjProduct.lastPurchaseCost > 0 && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    آخر سعر شراء:{" "}
                    {adjProduct.lastPurchaseCost.toLocaleString("ar-EG")} ج.م
                    (مرجعي فقط)
                  </div>
                )}
            </div>
          )}

          {/* Type Toggle */}
          {adjProduct && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button
                onClick={() => {
                  setAdjType("increase");
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    adjType === "increase"
                      ? "#4ade80"
                      : "rgba(255,255,255,.08)",
                  color: adjType === "increase" ? "#000" : "#d7aabd",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                زيادة
              </button>
              <button
                onClick={() => {
                  setAdjType("decrease");
                  setAdjUnitCost("");
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  background:
                    adjType === "decrease"
                      ? "#f87171"
                      : "rgba(255,255,255,.08)",
                  color: adjType === "decrease" ? "#fff" : "#d7aabd",
                  fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                تخفيض
              </button>
            </div>
          )}

          {/* Quantity */}
          {adjProduct && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                الكمية {adjType === "increase" ? "المضافة" : "المخصومة"} *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={adjQuantity}
                onChange={(e) => {
                  setAdjQuantity(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{
                  ...INPUT,
                  direction: "ltr",
                  opacity: submitting ? 0.5 : 1,
                  cursor: submitting ? "not-allowed" : "text",
                }}
                placeholder="10"
              />
            </div>
          )}

          {/* Unit Cost (Increase) */}
          {adjProduct && adjType === "increase" && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                تكلفة الوحدة (ج.م) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={adjUnitCost}
                onChange={(e) => {
                  setAdjUnitCost(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{
                  ...INPUT,
                  direction: "ltr",
                  opacity: submitting ? 0.5 : 1,
                  cursor: submitting ? "not-allowed" : "text",
                }}
                placeholder="50.00"
              />
            </div>
          )}

          {/* Exit Cost (Decrease - Read Only) */}
          {adjProduct && adjType === "decrease" && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                تكلفة الخروج
              </label>
              <input
                disabled
                readOnly
                value={`${adjProduct.averageCost?.toLocaleString("ar-EG") ?? "0"} ج.م (متوسط التكلفة الحالي)`}
                style={{ ...INPUT, opacity: 0.6, cursor: "not-allowed" }}
              />
              <div style={{ fontSize: 11, color: "#d7aabd", marginTop: 4 }}>
                سيتم خصم الكمية بمتوسط التكلفة الحالي. المتوسط لن يتغير.
              </div>
            </div>
          )}

          {/* Reason */}
          {adjProduct && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                سبب التسوية *
              </label>
              <input
                value={adjReason}
                onChange={(e) => {
                  setAdjReason(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{
                  ...INPUT,
                  opacity: submitting ? 0.5 : 1,
                  cursor: submitting ? "not-allowed" : "text",
                }}
                placeholder={
                  adjType === "increase"
                    ? "شراء خارجي / هدية من مورد / تصحيح جرد"
                    : "تالف / منتهي الصلاحية / هدية للعميل / خطأ في الجرد"
                }
              />
            </div>
          )}

          {/* Notes */}
          {adjProduct && (
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                ملاحظات (اختياري)
              </label>
              <textarea
                value={adjNotes}
                onChange={(e) => {
                  setAdjNotes(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={
                  {
                    ...INPUT,
                    minHeight: 60,
                    resize: "vertical",
                    opacity: submitting ? 0.5 : 1,
                    cursor: submitting ? "not-allowed" : "text",
                  } as React.CSSProperties
                }
              />
            </div>
          )}

          {/* Preview */}
          {showPreview &&
            (() => {
              const preview = calculatePreview();
              return (
                preview && (
                  <div
                    style={{
                      background: "rgba(233,30,99,.1)",
                      border: "1px solid rgba(233,30,99,.3)",
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#e91e63",
                        marginBottom: 12,
                      }}
                    >
                      معاينة التسوية
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          الرصيد الحالي
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#fff4f8",
                          }}
                        >
                          {preview.stockBefore}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          التغيير
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color:
                              adjType === "increase" ? "#4ade80" : "#f87171",
                          }}
                        >
                          {preview.stockChange}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          الرصيد الجديد
                        </div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 700,
                            color: "#ffd166",
                          }}
                        >
                          {preview.stockAfter}
                        </div>
                      </div>
                    </div>

                    <hr
                      style={{
                        border: "none",
                        borderTop: "1px solid rgba(255,255,255,.1)",
                        margin: "12px 0",
                      }}
                    />

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 10,
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          متوسط التكلفة الحالي
                        </div>
                        <div style={{ fontSize: 14, color: "#d7aabd" }}>
                          {preview.avgBefore.toLocaleString("ar-EG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          ج.م
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          {adjType === "increase"
                            ? "تكلفة الوحدة الجديدة"
                            : "—"}
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            color:
                              adjType === "increase" ? "#4ade80" : "#d7aabd",
                          }}
                        >
                          {adjType === "increase" && preview.avgChange != null
                            ? `${preview.avgChange.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          متوسط التكلفة المتوقع
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#ffd166",
                          }}
                        >
                          {preview.avgAfter.toLocaleString("ar-EG", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          ج.م
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        padding: 10,
                        background: "rgba(255,209,102,.15)",
                        borderRadius: 8,
                        fontSize: 11,
                        color: "#ffd166",
                        lineHeight: 1.5,
                      }}
                    >
                      ⚠️ <b>تأكيد:</b> سيتم تسجيل حركة تسوية مخزون دائمة. تأكد
                      من الكمية والسبب قبل التنفيذ.
                    </div>
                  </div>
                )
              );
            })()}

          {/* Action Buttons */}
          {adjProduct && (
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              {!showPreview && (
                <button
                  onClick={() => {
                    const validation = validateForm();
                    if (validation.valid) {
                      setShowPreview(true);
                      setAdjErrors([]);
                    } else {
                      setAdjErrors(validation.errors);
                    }
                  }}
                  disabled={submitting}
                  style={{
                    background: submitting
                      ? "rgba(255,255,255,.08)"
                      : "#e91e63",
                    color: submitting ? "#888" : "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 24px",
                    fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  معاينة التسوية
                </button>
              )}

              {showPreview && (
                <>
                  <button
                    onClick={() => {
                      if (!submitting) {
                        setShowPreview(false);
                      }
                    }}
                    disabled={submitting}
                    style={{
                      background: "rgba(255,255,255,.08)",
                      color: submitting ? "#888" : "#d7aabd",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px 20px",
                      fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    تعديل
                  </button>
                  <button
                    onClick={submitAdjustment}
                    disabled={submitting}
                    style={{
                      background: submitting
                        ? "rgba(255,255,255,.08)"
                        : "#4ade80",
                      color: submitting ? "#888" : "#000",
                      border: "none",
                      borderRadius: 10,
                      padding: "12px 24px",
                      fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer",
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    {submitting ? "جاري التنفيذ..." : "تأكيد التسوية"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Receipts ── */}
      {tab === "receipts" && (
        <div
          style={{
            display: "grid",
            gap: 20,
            gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)",
          }}
        >
          {/* Form */}
          <div style={CARD}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              استلام مخزون جديد
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  المورد
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const nextSupplierId = e.target.value;
                    setSupplierId(nextSupplierId);

                    const selectedInvoice = purchaseInvoices.find(
                      (invoice) => invoice.id === receiptPurchaseInvoiceId,
                    );

                    if (
                      selectedInvoice &&
                      selectedInvoice.supplierId !== nextSupplierId
                    ) {
                      setReceiptPurchaseInvoiceId("");
                    }
                  }}
                  style={INPUT}
                  disabled={Boolean(receiptPurchaseInvoiceId)}
                >
                  <option value="">-- بدون مورد --</option>
                  {suppliers
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 12,
                    color: "#d7aabd",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  رقم الفاتورة
                </label>
                <input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  style={INPUT}
                  placeholder="INV-001"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                فاتورة المورد المرتبطة
              </label>

              <select
                value={receiptPurchaseInvoiceId}
                onChange={(e) => {
                  const nextInvoiceId = e.target.value;
                  setReceiptPurchaseInvoiceId(nextInvoiceId);

                  if (!nextInvoiceId) {
                    return;
                  }

                  const invoice = purchaseInvoices.find(
                    (item) => item.id === nextInvoiceId,
                  );

                  if (invoice) {
                    setSupplierId(invoice.supplierId);
                    setInvoiceDate(
                      invoice.invoiceDate
                        ? invoice.invoiceDate.slice(0, 10)
                        : "",
                    );
                    setReferenceNumber(invoice.invoiceNumber ?? "");
                  }
                }}
                style={INPUT}
              >
                <option value="">-- استلام مستقل بدون فاتورة مالية --</option>

                {receiptDraftInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoiceNumber ?? `فاتورة #${invoice.id.slice(-8)}`}{" "}
                    — {invoice.supplier.name} —{" "}
                    {invoice.totalAmount.toLocaleString("ar-EG")} ج.م
                  </option>
                ))}
              </select>

              {selectedReceiptPurchaseInvoice && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color:
                      receiptTotal > selectedReceiptPurchaseInvoice.totalAmount
                        ? "#f87171"
                        : "#d7aabd",
                  }}
                >
                  قيمة الفاتورة:{" "}
                  {selectedReceiptPurchaseInvoice.totalAmount.toLocaleString(
                    "ar-EG",
                  )}{" "}
                  ج.م
                  {" • "}
                  الاستلام الحالي: {receiptTotal.toLocaleString("ar-EG")} ج.م
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                تاريخ الفاتورة
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                style={{ ...INPUT, direction: "ltr" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  fontSize: 12,
                  color: "#d7aabd",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                ملاحظات
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={
                  {
                    ...INPUT,
                    minHeight: 56,
                    resize: "vertical",
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Add item */}
            <div
              style={{
                background: "rgba(0,0,0,.2)",
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff4f8",
                  marginBottom: 10,
                }}
              >
                إضافة منتج للفاتورة
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 80px 100px auto",
                  gap: 8,
                  alignItems: "end",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    المنتج
                  </label>
                  <select
                    value={draftItem.productId}
                    onChange={(e) =>
                      setDraftItem({ ...draftItem, productId: e.target.value })
                    }
                    style={INPUT}
                  >
                    <option value="">اختر منتجاً</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    الكمية
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={draftItem.quantity}
                    onChange={(e) =>
                      setDraftItem({
                        ...draftItem,
                        quantity: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "#d7aabd",
                      display: "block",
                      marginBottom: 3,
                    }}
                  >
                    سعر الوحدة (ج.م)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={draftItem.unitCost}
                    onChange={(e) =>
                      setDraftItem({
                        ...draftItem,
                        unitCost: Number(e.target.value),
                      })
                    }
                    style={{ ...INPUT, direction: "ltr" }}
                  />
                </div>
                <button
                  onClick={addItem}
                  style={{
                    background: "#e91e63",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 18,
                    lineHeight: 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Items list */}
            {items.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {items.map((item) => {
                  const p = productLookup.get(item.productId);
                  const lineTotal = item.quantity * item.unitCost;
                  return (
                    <div
                      key={item.productId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,.04)",
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color: "#fff4f8", fontSize: 13 }}>
                        {p?.name ?? "منتج"}
                      </span>
                      <span style={{ color: "#d7aabd", fontSize: 12 }}>
                        {item.quantity} × {item.unitCost} ={" "}
                        <b style={{ color: "#ffd166" }}>
                          {lineTotal.toLocaleString("ar-EG")} ج.م
                        </b>
                      </span>
                      <button
                        onClick={() =>
                          setItems((prev) =>
                            prev.filter((i) => i.productId !== item.productId),
                          )
                        }
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          fontSize: 18,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ color: "#ffd166", fontWeight: 700, fontSize: 14 }}>
                الإجمالي: {receiptTotal.toLocaleString("ar-EG")} ج.م
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {items.length > 0 && (
                  <button
                    onClick={clearForm}
                    style={{
                      background: "rgba(255,255,255,.08)",
                      color: "#d7aabd",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 16px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    مسح
                  </button>
                )}
                <button
                  onClick={saveReceipt}
                  disabled={
                    saving ||
                    items.length === 0 ||
                    Boolean(
                      selectedReceiptPurchaseInvoice &&
                      receiptTotal > selectedReceiptPurchaseInvoice.totalAmount,
                    )
                  }
                  style={{
                    background: "#e91e63",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 24px",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity:
                      saving ||
                      items.length === 0 ||
                      Boolean(
                        selectedReceiptPurchaseInvoice &&
                        receiptTotal >
                          selectedReceiptPurchaseInvoice.totalAmount,
                      )
                        ? 0.5
                        : 1,
                  }}
                >
                  {saving ? "جاري الحفظ..." : "تسجيل الاستلام"}
                </button>
              </div>
            </div>
          </div>

          {/* Receipts list */}
          <div style={CARD}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                marginBottom: 16,
                marginTop: 0,
              }}
            >
              آخر عمليات استلام المخزون ({receipts.length})
            </h2>
            {receipts.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>
                لا توجد فواتير بعد.
              </p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  maxHeight: 600,
                  overflowY: "auto",
                }}
              >
                {receipts.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.08)",
                      padding: 14,
                      background: "rgba(0,0,0,.15)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#fff4f8",
                            fontSize: 13,
                          }}
                        >
                          {r.referenceNumber ?? "بدون رقم مرجعي"}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#d7aabd",
                            marginTop: 3,
                          }}
                        >
                          {r.supplierName ?? "بدون مورد"}
                          {r.invoiceDate &&
                            ` • ${new Date(r.invoiceDate).toLocaleDateString("ar-EG")}`}

                          {r.purchaseInvoice && (
                            <span style={{ color: "#4ade80" }}>
                              {" "}
                              • فاتورة مالية:{" "}
                              {r.purchaseInvoice.invoiceNumber ??
                                `#${r.purchaseInvoice.id.slice(-8)}`}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          {new Date(r.receivedAt).toLocaleDateString("ar-EG")}
                        </div>
                      </div>
                      <span
                        style={{
                          color: "#ffd166",
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {r.totalCost.toLocaleString("ar-EG")} ج.م
                      </span>
                    </div>
                    <div
                      style={{ marginTop: 8, fontSize: 12, color: "#d7aabd" }}
                    >
                      {r.items
                        .map((i) => `${i.productName} (${i.quantity})`)
                        .join(" · ")}
                    </div>

                    {r.status === "posted" &&
                      r.purchaseInvoice?.status === "cancelled" && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px solid rgba(255,255,255,.08)",
                          }}
                        >
                          {relinkReceiptId === r.id ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 800,
                                  color: "#ffd166",
                                }}
                              >
                                تغيير فاتورة المورد المرتبطة
                              </div>

                              <select
                                value={relinkPurchaseInvoiceId}
                                onChange={(e) =>
                                  setRelinkPurchaseInvoiceId(e.target.value)
                                }
                                style={INPUT}
                              >
                                <option value="">
                                  -- اختر فاتورة مسودة لنفس المورد --
                                </option>

                                {purchaseInvoices
                                  .filter(
                                    (invoice) =>
                                      invoice.documentStatus === "draft" &&
                                      invoice.supplierId === r.supplierId,
                                  )
                                  .map((invoice) => (
                                    <option key={invoice.id} value={invoice.id}>
                                      {invoice.invoiceNumber ??
                                        `#${invoice.id.slice(-8)}`}{" "}
                                      -{" "}
                                      {invoice.totalAmount.toLocaleString(
                                        "ar-EG",
                                      )}{" "}
                                      ج.م
                                    </option>
                                  ))}
                              </select>

                              <textarea
                                value={relinkReason}
                                onChange={(e) =>
                                  setRelinkReason(e.target.value)
                                }
                                placeholder="اكتب سبب تغيير الربط"
                                rows={2}
                                style={{
                                  ...INPUT,
                                  resize: "vertical",
                                }}
                              />

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  disabled={
                                    relinkSaving ||
                                    !relinkPurchaseInvoiceId ||
                                    !relinkReason.trim()
                                  }
                                  onClick={() =>
                                    void relinkReceiptPurchaseInvoice()
                                  }
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: 8,
                                    border: "1px solid rgba(74,222,128,.45)",
                                    background: "rgba(74,222,128,.12)",
                                    color: "#4ade80",
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: relinkSaving
                                      ? "not-allowed"
                                      : "pointer",
                                    opacity:
                                      relinkSaving ||
                                      !relinkPurchaseInvoiceId ||
                                      !relinkReason.trim()
                                        ? 0.5
                                        : 1,
                                  }}
                                >
                                  {relinkSaving
                                    ? "جارٍ الحفظ..."
                                    : "تأكيد تغيير الربط"}
                                </button>

                                <button
                                  type="button"
                                  disabled={relinkSaving}
                                  onClick={() => {
                                    setRelinkReceiptId(null);
                                    setRelinkPurchaseInvoiceId("");
                                    setRelinkReason("");
                                  }}
                                  style={{
                                    padding: "7px 12px",
                                    borderRadius: 8,
                                    border: "1px solid rgba(255,255,255,.12)",
                                    background: "rgba(255,255,255,.05)",
                                    color: "#d7aabd",
                                    fontSize: 12,
                                    cursor: relinkSaving
                                      ? "not-allowed"
                                      : "pointer",
                                  }}
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setRelinkReceiptId(r.id);
                                setRelinkPurchaseInvoiceId("");
                                setRelinkReason("");
                              }}
                              style={{
                                padding: "7px 12px",
                                borderRadius: 8,
                                border: "1px solid rgba(255,209,102,.4)",
                                background: "rgba(255,209,102,.1)",
                                color: "#ffd166",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              تغيير فاتورة المورد
                            </button>
                          )}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Movements ── */}
      {tab === "movements" && (
        <div style={CARD}>
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: "#fff4f8",
                margin: 0,
                flex: 1,
                minWidth: 140,
              }}
            >
              سجل حركة المخزون ({filteredMovements.length})
            </h2>
            <select
              value={movType}
              onChange={(e) => {
                setMovType(e.target.value);
                setMovPage(1);
              }}
              style={{ ...INPUT, width: 160 }}
            >
              <option value="all">كل الأنواع</option>
              {Object.entries(MOVEMENT_LABELS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
            <input
              placeholder="بحث عن منتج..."
              value={movSearch}
              onChange={(e) => {
                setMovSearch(e.target.value);
                setMovPage(1);
              }}
              style={{ ...INPUT, width: 200 }}
            />
          </div>

          {pagedMovements.length === 0 ? (
            <p style={{ color: "#d7aabd", fontSize: 13 }}>
              لا توجد حركات مطابقة.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}
                  >
                    {[
                      "المنتج",
                      "النوع",
                      "التغيير",
                      "قبل",
                      "بعد",
                      "تكلفة الوحدة",
                      "التاريخ",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          color: "#d7aabd",
                          fontWeight: 600,
                          textAlign: "right",
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedMovements.map((m) => {
                    const info = MOVEMENT_LABELS[m.type] ?? {
                      label: m.type,
                      color: "#d7aabd",
                    };
                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                        }}
                      >
                        <td style={{ padding: "10px", color: "#fff4f8" }}>
                          {m.productName}
                        </td>
                        <td style={{ padding: "10px" }}>
                          <span
                            style={{
                              background: `${info.color}22`,
                              color: info.color,
                              borderRadius: 6,
                              padding: "2px 8px",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {info.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px",
                            color:
                              m.quantityChange >= 0 ? "#4ade80" : "#f87171",
                            fontWeight: 700,
                          }}
                        >
                          {m.quantityChange >= 0 ? "+" : ""}
                          {m.quantityChange}
                        </td>
                        <td style={{ padding: "10px", color: "#d7aabd" }}>
                          {m.quantityBefore}
                        </td>
                        <td style={{ padding: "10px", color: "#d7aabd" }}>
                          {m.quantityAfter}
                        </td>
                        <td style={{ padding: "10px", color: "#ffd166" }}>
                          {m.unitCost != null ? `${m.unitCost} ج.م` : "—"}
                        </td>
                        <td
                          style={{
                            padding: "10px",
                            color: "#d7aabd",
                            fontSize: 11,
                            direction: "ltr",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {new Date(m.createdAt).toLocaleString("ar-EG")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {movementPages > 1 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                justifyContent: "center",
                marginTop: 16,
              }}
            >
              {Array.from({ length: movementPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setMovPage(page)}
                    style={{
                      background:
                        movPage === page ? "#e91e63" : "rgba(255,255,255,.08)",
                      color: movPage === page ? "#fff" : "#d7aabd",
                      border: "none",
                      borderRadius: 8,
                      padding: "6px 12px",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {page}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Alerts ── */}
      {tab === "alerts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={CARD}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#f87171",
                marginBottom: 14,
                marginTop: 0,
              }}
            >
              نفذ المخزون ({outOfStock.length})
            </h2>
            {outOfStock.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>
                لا توجد منتجات نفد مخزونها.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {outOfStock.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "rgba(248,113,113,.12)",
                      border: "1px solid rgba(248,113,113,.3)",
                      borderRadius: 10,
                      padding: "8px 14px",
                      fontSize: 13,
                      color: "#fff4f8",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: "#f87171", fontWeight: 700 }}>0</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={CARD}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#ffd166",
                marginBottom: 14,
                marginTop: 0,
              }}
            >
              مخزون منخفض — أقل من {LOW_STOCK_THRESHOLD} قطعة ({lowStock.length}
              )
            </h2>
            {lowStock.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>
                لا توجد منتجات بمخزون منخفض.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {lowStock.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "rgba(255,209,102,.1)",
                      border: "1px solid rgba(255,209,102,.3)",
                      borderRadius: 10,
                      padding: "8px 14px",
                      fontSize: 13,
                      color: "#fff4f8",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: "#ffd166", fontWeight: 700 }}>
                      {p.stock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Reports ── */}
      {tab === "reports" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            {[
              {
                label: "قيمة المخزون بالتكلفة",
                value: `${totalCostValue.toLocaleString("ar-EG")} ج.م`,
                color: "#4ade80",
              },
              {
                label: "قيمة المخزون بالبيع",
                value: `${totalSellingValue.toLocaleString("ar-EG")} ج.م`,
                color: "#60a5fa",
              },
              {
                label: "إجمالي المشتريات",
                value: `${totalReceiptsCost.toLocaleString("ar-EG")} ج.م`,
                color: "#e91e63",
              },
              {
                label: "عدد الفواتير",
                value: receipts.length.toString(),
                color: "#a78bfa",
              },
              {
                label: "منتجات نفد مخزونها",
                value: outOfStock.length.toString(),
                color: "#f87171",
              },
              {
                label: "مخزون منخفض",
                value: lowStock.length.toString(),
                color: "#ffd166",
              },
            ].map((stat) => (
              <div key={stat.label} style={{ ...CARD, textAlign: "center" }}>
                <div
                  style={{ fontSize: 22, fontWeight: 900, color: stat.color }}
                >
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: "#d7aabd", marginTop: 4 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Top products by stock value */}
          <div style={CARD}>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: "#fff4f8",
                marginBottom: 14,
                marginTop: 0,
              }}
            >
              أعلى المنتجات قيمةً في المخزون
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}
                  >
                    {[
                      "المنتج",
                      "المخزون",
                      "متوسط التكلفة",
                      "قيمة المخزون",
                      "سعر البيع",
                      "هامش الربح",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          color: "#d7aabd",
                          fontWeight: 600,
                          textAlign: "right",
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...products]
                    .filter((p) => p.stock > 0)
                    .sort(
                      (a, b) =>
                        (b.averageCost ?? 0) * b.stock -
                        (a.averageCost ?? 0) * a.stock,
                    )
                    .slice(0, 15)
                    .map((p) => {
                      const avg = p.averageCost ?? 0;
                      const margin =
                        avg > 0
                          ? Math.round(((p.price - avg) / avg) * 100)
                          : null;
                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,.05)",
                          }}
                        >
                          <td style={{ padding: "10px", color: "#fff4f8" }}>
                            {p.name}
                          </td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>
                            {p.stock}
                          </td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>
                            {avg.toLocaleString("ar-EG")} ج.م
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              color: "#ffd166",
                              fontWeight: 700,
                            }}
                          >
                            {(avg * p.stock).toLocaleString("ar-EG")} ج.م
                          </td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>
                            {p.price.toLocaleString("ar-EG")} ج.م
                          </td>
                          <td
                            style={{
                              padding: "10px",
                              color:
                                margin != null && margin >= 0
                                  ? "#4ade80"
                                  : "#f87171",
                              fontWeight: 700,
                            }}
                          >
                            {margin != null ? `${margin}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suppliers summary */}
          {suppliers.length > 0 && (
            <div style={CARD}>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 900,
                  color: "#fff4f8",
                  marginBottom: 14,
                  marginTop: 0,
                }}
              >
                الموردون ({suppliers.length})
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      background: s.isActive
                        ? "rgba(233,30,99,.12)"
                        : "rgba(255,255,255,.04)",
                      border: `1px solid ${s.isActive ? "rgba(233,30,99,.3)" : "rgba(255,255,255,.1)"}`,
                      borderRadius: 10,
                      padding: "8px 14px",
                      fontSize: 13,
                      color: s.isActive ? "#fff4f8" : "#888",
                    }}
                  >
                    {s.name}
                    {!s.isActive && (
                      <span
                        style={{ color: "#888", marginRight: 6, fontSize: 11 }}
                      >
                        (غير نشط)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
