"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "../types";

type Supplier = { id: string; name: string; phone: string | null; isActive: boolean };

type ReceiptItem = {
  id: string; productId: string; productName: string;
  quantity: number; unitCost: number; totalCost: number;
};

type Receipt = {
  id: string; referenceNumber: string | null; supplierId: string | null;
  supplierName: string | null; invoiceDate: string | null; notes: string | null;
  receivedAt: string; totalCost: number; status: string; items: ReceiptItem[];
};

type Movement = {
  id: string; productId: string; productName: string; type: string;
  quantityChange: number; quantityBefore: number; quantityAfter: number;
  unitCost: number | null; createdAt: string; referenceType: string | null;
  referenceId: string | null; notes: string | null;
};

type DraftItem = { productId: string; quantity: number; unitCost: number };

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
    padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700,
    cursor: "pointer", border: "none",
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

export default function Inventory() {
  const [tab, setTab] = useState<"receipts" | "adjustments" | "movements" | "alerts" | "reports">("receipts");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  // Receipt form
  const [supplierId, setSupplierId] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItem, setDraftItem] = useState<DraftItem>({ productId: "", quantity: 1, unitCost: 0 });
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
      const [prodFetch, suppFetch, recFetch, movFetch] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }),
        fetch("/api/admin/suppliers", { cache: "no-store" }),
        fetch("/api/admin/inventory/receipts", { cache: "no-store" }),
        fetch("/api/admin/inventory/movements", { cache: "no-store" }),
      ]);

      if (!prodFetch.ok || !suppFetch.ok || !recFetch.ok || !movFetch.ok) {
        console.error("[LOAD_DATA] Some endpoints failed");
        return null;
      }

      const [prodRes, suppRes, recRes, movRes] = await Promise.all([
        prodFetch.json(),
        suppFetch.json(),
        recFetch.json(),
        movFetch.json(),
      ]);

      const loadedProducts = Array.isArray(prodRes) ? prodRes : [];
      const loadedSuppliers = Array.isArray(suppRes?.suppliers) ? suppRes.suppliers : [];
      const loadedReceipts = Array.isArray(recRes) ? recRes : [];
      const loadedMovements = Array.isArray(movRes) ? movRes : [];

      setProducts(loadedProducts);
      setSuppliers(loadedSuppliers);
      setReceipts(loadedReceipts);
      setMovements(loadedMovements);

      return {
        products: loadedProducts,
        suppliers: loadedSuppliers,
        receipts: loadedReceipts,
        movements: loadedMovements,
      };
    } catch (error) {
      console.error("[LOAD_DATA]", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const productLookup = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const receiptTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
    [items],
  );

  const addItem = () => {
    if (!draftItem.productId || draftItem.quantity <= 0) return;
    setItems(prev => [...prev.filter(i => i.productId !== draftItem.productId), { ...draftItem }]);
    setDraftItem({ productId: "", quantity: 1, unitCost: 0 });
  };

  const clearForm = () => {
    setSupplierId(""); setReferenceNumber(""); setInvoiceDate(""); setNotes("");
    setItems([]); setDraftItem({ productId: "", quantity: 1, unitCost: 0 });
  };

  const saveReceipt = async () => {
    if (!items.length) { alert("يرجى إضافة منتجات للفاتورة."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplierId || null,
          referenceNumber: referenceNumber || null,
          invoiceDate: invoiceDate || null,
          notes: notes || null,
          items,
        }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? "تعذر حفظ الفاتورة."); return; }
      clearForm();
      await loadData();
    } finally {
      setSaving(false);
    }
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
      errors.push(`الكمية المخصومة (${quantity}) أكبر من المخزون المتاح (${adjProduct.stock})`);
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
      const newAvg = newStock > 0
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
          setAdjApiError("تمت التسوية ولكن تعذر تحديث العرض. يرجى تحديث الصفحة.");
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
          const freshProduct = refreshed.products.find(p => p.id === productId);
          if (freshProduct) {
            setAdjProduct(freshProduct);
            setAdjApiError(
              (data.error ?? "تغير المخزون أثناء التسوية") +
              "\n\nتم تحديث بيانات المنتج. يرجى مراجعة الرصيد والمتوسط الجديد وإعادة المحاولة."
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
            "، وتعذر تحديث البيانات تلقائياً.\n\nحدّث الصفحة قبل إعادة المحاولة."
          );
        }

        setShowPreview(false);
        return;
      }

      if (res.status === 422) {
        const refreshed = await loadData();

        if (refreshed) {
          // ✅ Refresh succeeded
          const freshProduct = refreshed.products.find(p => p.id === productId);
          if (freshProduct) {
            setAdjProduct(freshProduct);
            setAdjApiError(data.error ?? "الكمية المطلوبة أكبر من المخزون المتاح");
          } else {
            clearAdjustmentForm();
            setAdjApiError("❌ المنتج لم يعد موجوداً");
            return;
          }
        } else {
          // ✅ Refresh failed - stale data warning
          setAdjApiError(
            (data.error ?? "الكمية المطلوبة أكبر من المخزون المتاح") +
            "\n\nتعذر تحديث الرصيد الحالي. حدّث الصفحة قبل إعادة المحاولة."
          );
        }

        setShowPreview(false);
        return;
      }

      if (res.status === 500) {
        setAdjApiError(
          "حدث خطأ في الخادم:\n" +
          (data.error ?? "خطأ غير متوقع") +
          "\n\nيرجى المحاولة مرة أخرى أو الاتصال بالدعم الفني."
        );
        return;
      }

      setAdjApiError(`خطأ غير متوقع (${res.status}): ${data.error ?? "غير معروف"}`);

    } catch (error) {
      console.error("[ADJUSTMENT_SUBMIT]", error);
      setAdjApiError("فشل الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.");
    } finally {
      adjustmentSubmitLockRef.current = false;
      setSubmitting(false);
    }
  };

  // Movements
  const filteredMovements = useMemo(() => {
    let list = movements;
    if (movType !== "all") list = list.filter(m => m.type === movType);
    if (movSearch.trim()) list = list.filter(m => m.productName.includes(movSearch.trim()));
    return list;
  }, [movements, movType, movSearch]);

  const movementPages = Math.max(1, Math.ceil(filteredMovements.length / MOVS_PER_PAGE));
  const pagedMovements = filteredMovements.slice((movPage - 1) * MOVS_PER_PAGE, movPage * MOVS_PER_PAGE);

  // Alerts
  const outOfStock = useMemo(() => products.filter(p => p.stock === 0 && p.active), [products]);
  const lowStock = useMemo(
    () => products.filter(p => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD && p.active),
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
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 300, color: "#d7aabd" }}>
        جاري التحميل...
      </div>
    );
  }

  const alertCount = outOfStock.length + lowStock.length;

  return (
    <div style={{ direction: "rtl" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff4f8", margin: 0 }}>المخزون والمشتريات</h1>
        <p style={{ color: "#d7aabd", fontSize: 13, marginTop: 4 }}>
          إدارة فواتير الشراء وحركة المخزون والتنبيهات والتقارير
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {(
          [
            { key: "receipts", label: "فواتير المشتريات" },
            { key: "adjustments", label: "تسوية المخزون" },
            { key: "movements", label: "حركة المخزون" },
            { key: "alerts", label: alertCount > 0 ? `تنبيهات المخزون (${alertCount})` : "تنبيهات المخزون" },
            { key: "reports", label: "تقارير المخزون" },
          ] as const
        ).map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Adjustments ── */}
      {tab === "adjustments" && (
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fff4f8", marginBottom: 16, marginTop: 0 }}>
            تسوية المخزون اليدوية
          </h2>

          {/* Success Message */}
          {adjSuccess && (
            <div style={{
              background: "rgba(74,222,128,.1)",
              border: "1px solid rgba(74,222,128,.3)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>
                {adjSuccess}
              </div>
            </div>
          )}

          {/* API Error */}
          {adjApiError && (
            <div style={{
              background: "rgba(248,113,113,.1)",
              border: "1px solid rgba(248,113,113,.3)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
              whiteSpace: "pre-line",
            }}>
              <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, marginBottom: 4 }}>
                ❌ خطأ
              </div>
              <div style={{ fontSize: 11, color: "#f87171" }}>
                {adjApiError}
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {adjErrors.length > 0 && (
            <div style={{
              background: "rgba(248,113,113,.1)",
              border: "1px solid rgba(248,113,113,.3)",
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, marginBottom: 6 }}>
                يرجى تصحيح الأخطاء التالية:
              </div>
              <ul style={{ margin: "8px 0 0 0", paddingRight: 20, fontSize: 11, color: "#f87171" }}>
                {adjErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Product Selection */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
              المنتج *
            </label>
            <select
              value={adjProduct?.id ?? ""}
              onChange={e => {
                const p = products.find(pr => pr.id === e.target.value);
                setAdjProduct(p ?? null);
                setAdjQuantity("");
                setAdjUnitCost("");
                setAdjReason("");
                setAdjNotes("");
                invalidatePreview();
              }}
              disabled={submitting}
              style={{ ...INPUT, opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
            >
              <option value="">اختر منتجاً</option>
              {products.filter(p => p.active).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Product Info */}
          {adjProduct && (
            <div style={{ background: "rgba(0,0,0,.2)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#fff4f8", marginBottom: 4 }}>
                <b>{adjProduct.name}</b>
              </div>
              <div style={{ fontSize: 12, color: "#d7aabd" }}>
                الرصيد الحالي: <b style={{ color: "#ffd166" }}>{adjProduct.stock}</b>
              </div>
              <div style={{ fontSize: 12, color: "#d7aabd" }}>
                متوسط التكلفة: <b style={{ color: "#4ade80" }}>
                  {adjProduct.averageCost?.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0.00"} ج.م
                </b>
              </div>
              {adjProduct.lastPurchaseCost != null && adjProduct.lastPurchaseCost > 0 && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  آخر سعر شراء: {adjProduct.lastPurchaseCost.toLocaleString("ar-EG")} ج.م (مرجعي فقط)
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
                  flex: 1, padding: "10px", borderRadius: 10, border: "none",
                  background: adjType === "increase" ? "#4ade80" : "rgba(255,255,255,.08)",
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
                  flex: 1, padding: "10px", borderRadius: 10, border: "none",
                  background: adjType === "decrease" ? "#f87171" : "rgba(255,255,255,.08)",
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
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
                الكمية {adjType === "increase" ? "المضافة" : "المخصومة"} *
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={adjQuantity}
                onChange={e => {
                  setAdjQuantity(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{ ...INPUT, direction: "ltr", opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "text" }}
                placeholder="10"
              />
            </div>
          )}

          {/* Unit Cost (Increase) */}
          {adjProduct && adjType === "increase" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
                تكلفة الوحدة (ج.م) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={adjUnitCost}
                onChange={e => {
                  setAdjUnitCost(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{ ...INPUT, direction: "ltr", opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "text" }}
                placeholder="50.00"
              />
            </div>
          )}

          {/* Exit Cost (Decrease - Read Only) */}
          {adjProduct && adjType === "decrease" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
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
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
                سبب التسوية *
              </label>
              <input
                value={adjReason}
                onChange={e => {
                  setAdjReason(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{ ...INPUT, opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "text" }}
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
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>
                ملاحظات (اختياري)
              </label>
              <textarea
                value={adjNotes}
                onChange={e => {
                  setAdjNotes(e.target.value);
                  invalidatePreview();
                }}
                disabled={submitting}
                style={{ ...INPUT, minHeight: 60, resize: "vertical", opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "text" } as React.CSSProperties}
              />
            </div>
          )}

          {/* Preview */}
          {showPreview && (() => {
            const preview = calculatePreview();
            return preview && (
              <div style={{
                background: "rgba(233,30,99,.1)",
                border: "1px solid rgba(233,30,99,.3)",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e91e63", marginBottom: 12 }}>
                  معاينة التسوية
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>الرصيد الحالي</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff4f8" }}>
                      {preview.stockBefore}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>التغيير</div>
                    <div style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: adjType === "increase" ? "#4ade80" : "#f87171"
                    }}>
                      {preview.stockChange}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>الرصيد الجديد</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ffd166" }}>
                      {preview.stockAfter}
                    </div>
                  </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,.1)", margin: "12px 0" }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>متوسط التكلفة الحالي</div>
                    <div style={{ fontSize: 14, color: "#d7aabd" }}>
                      {preview.avgBefore.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>
                      {adjType === "increase" ? "تكلفة الوحدة الجديدة" : "—"}
                    </div>
                    <div style={{ fontSize: 14, color: adjType === "increase" ? "#4ade80" : "#d7aabd" }}>
                      {adjType === "increase" && preview.avgChange != null
                        ? `${preview.avgChange.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#d7aabd" }}>متوسط التكلفة المتوقع</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#ffd166" }}>
                      {preview.avgAfter.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: 12,
                  padding: 10,
                  background: "rgba(255,209,102,.15)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#ffd166",
                  lineHeight: 1.5,
                }}>
                  ⚠️ <b>تأكيد:</b> سيتم تسجيل حركة تسوية مخزون دائمة. تأكد من الكمية والسبب قبل التنفيذ.
                </div>
              </div>
            );
          })()}

          {/* Action Buttons */}
          {adjProduct && (
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
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
                    background: submitting ? "rgba(255,255,255,.08)" : "#e91e63",
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
                      background: submitting ? "rgba(255,255,255,.08)" : "#4ade80",
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
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)" }}>
          {/* Form */}
          <div style={CARD}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fff4f8", marginBottom: 16, marginTop: 0 }}>
              فاتورة مشتريات جديدة
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>المورد</label>
                <select value={supplierId} onChange={e => setSupplierId(e.target.value)} style={INPUT}>
                  <option value="">-- بدون مورد --</option>
                  {suppliers.filter(s => s.isActive).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>رقم الفاتورة</label>
                <input
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  style={INPUT}
                  placeholder="INV-001"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>تاريخ الفاتورة</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                style={{ ...INPUT, direction: "ltr" }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#d7aabd", display: "block", marginBottom: 4 }}>ملاحظات</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                style={{ ...INPUT, minHeight: 56, resize: "vertical" } as React.CSSProperties}
              />
            </div>

            {/* Add item */}
            <div style={{ background: "rgba(0,0,0,.2)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff4f8", marginBottom: 10 }}>إضافة منتج للفاتورة</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 100px auto", gap: 8, alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: 11, color: "#d7aabd", display: "block", marginBottom: 3 }}>المنتج</label>
                  <select
                    value={draftItem.productId}
                    onChange={e => setDraftItem({ ...draftItem, productId: e.target.value })}
                    style={INPUT}
                  >
                    <option value="">اختر منتجاً</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#d7aabd", display: "block", marginBottom: 3 }}>الكمية</label>
                  <input
                    type="number" min={1}
                    value={draftItem.quantity}
                    onChange={e => setDraftItem({ ...draftItem, quantity: Number(e.target.value) })}
                    style={{ ...INPUT, direction: "ltr" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "#d7aabd", display: "block", marginBottom: 3 }}>سعر الوحدة (ج.م)</label>
                  <input
                    type="number" min={0}
                    value={draftItem.unitCost}
                    onChange={e => setDraftItem({ ...draftItem, unitCost: Number(e.target.value) })}
                    style={{ ...INPUT, direction: "ltr" }}
                  />
                </div>
                <button
                  onClick={addItem}
                  style={{
                    background: "#e91e63", color: "#fff", border: "none", borderRadius: 8,
                    padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 18, lineHeight: 1,
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Items list */}
            {items.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {items.map(item => {
                  const p = productLookup.get(item.productId);
                  const lineTotal = item.quantity * item.unitCost;
                  return (
                    <div
                      key={item.productId}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 8,
                        background: "rgba(255,255,255,.04)", marginBottom: 6,
                      }}
                    >
                      <span style={{ color: "#fff4f8", fontSize: 13 }}>{p?.name ?? "منتج"}</span>
                      <span style={{ color: "#d7aabd", fontSize: 12 }}>
                        {item.quantity} × {item.unitCost} ={" "}
                        <b style={{ color: "#ffd166" }}>{lineTotal.toLocaleString("ar-EG")} ج.م</b>
                      </span>
                      <button
                        onClick={() => setItems(prev => prev.filter(i => i.productId !== item.productId))}
                        style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18 }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#ffd166", fontWeight: 700, fontSize: 14 }}>
                الإجمالي: {receiptTotal.toLocaleString("ar-EG")} ج.م
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {items.length > 0 && (
                  <button
                    onClick={clearForm}
                    style={{
                      background: "rgba(255,255,255,.08)", color: "#d7aabd", border: "none",
                      borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    مسح
                  </button>
                )}
                <button
                  onClick={saveReceipt}
                  disabled={saving || items.length === 0}
                  style={{
                    background: "#e91e63", color: "#fff", border: "none", borderRadius: 10,
                    padding: "10px 24px", fontWeight: 700, cursor: "pointer",
                    opacity: saving || items.length === 0 ? 0.5 : 1,
                  }}
                >
                  {saving ? "جاري الحفظ..." : "حفظ الفاتورة"}
                </button>
              </div>
            </div>
          </div>

          {/* Receipts list */}
          <div style={CARD}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fff4f8", marginBottom: 16, marginTop: 0 }}>
              آخر الفواتير ({receipts.length})
            </h2>
            {receipts.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>لا توجد فواتير بعد.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 600, overflowY: "auto" }}>
                {receipts.map(r => (
                  <div
                    key={r.id}
                    style={{
                      borderRadius: 12, border: "1px solid rgba(255,255,255,.08)",
                      padding: 14, background: "rgba(0,0,0,.15)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff4f8", fontSize: 13 }}>
                          {r.referenceNumber ?? "بدون رقم مرجعي"}
                        </div>
                        <div style={{ fontSize: 11, color: "#d7aabd", marginTop: 3 }}>
                          {r.supplierName ?? "بدون مورد"}
                          {r.invoiceDate && ` • ${new Date(r.invoiceDate).toLocaleDateString("ar-EG")}`}
                        </div>
                        <div style={{ fontSize: 11, color: "#d7aabd" }}>
                          {new Date(r.receivedAt).toLocaleDateString("ar-EG")}
                        </div>
                      </div>
                      <span style={{ color: "#ffd166", fontWeight: 700, fontSize: 13 }}>
                        {r.totalCost.toLocaleString("ar-EG")} ج.م
                      </span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#d7aabd" }}>
                      {r.items.map(i => `${i.productName} (${i.quantity})`).join(" · ")}
                    </div>
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
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#fff4f8", margin: 0, flex: 1, minWidth: 140 }}>
              سجل حركة المخزون ({filteredMovements.length})
            </h2>
            <select
              value={movType}
              onChange={e => { setMovType(e.target.value); setMovPage(1); }}
              style={{ ...INPUT, width: 160 }}
            >
              <option value="all">كل الأنواع</option>
              {Object.entries(MOVEMENT_LABELS).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
            <input
              placeholder="بحث عن منتج..."
              value={movSearch}
              onChange={e => { setMovSearch(e.target.value); setMovPage(1); }}
              style={{ ...INPUT, width: 200 }}
            />
          </div>

          {pagedMovements.length === 0 ? (
            <p style={{ color: "#d7aabd", fontSize: 13 }}>لا توجد حركات مطابقة.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                    {["المنتج", "النوع", "التغيير", "قبل", "بعد", "تكلفة الوحدة", "التاريخ"].map(h => (
                      <th
                        key={h}
                        style={{ color: "#d7aabd", fontWeight: 600, textAlign: "right", padding: "8px 10px", fontSize: 12 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedMovements.map(m => {
                    const info = MOVEMENT_LABELS[m.type] ?? { label: m.type, color: "#d7aabd" };
                    return (
                      <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                        <td style={{ padding: "10px", color: "#fff4f8" }}>{m.productName}</td>
                        <td style={{ padding: "10px" }}>
                          <span style={{
                            background: `${info.color}22`, color: info.color,
                            borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                          }}>
                            {info.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px", color: m.quantityChange >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                          {m.quantityChange >= 0 ? "+" : ""}{m.quantityChange}
                        </td>
                        <td style={{ padding: "10px", color: "#d7aabd" }}>{m.quantityBefore}</td>
                        <td style={{ padding: "10px", color: "#d7aabd" }}>{m.quantityAfter}</td>
                        <td style={{ padding: "10px", color: "#ffd166" }}>
                          {m.unitCost != null ? `${m.unitCost} ج.م` : "—"}
                        </td>
                        <td style={{ padding: "10px", color: "#d7aabd", fontSize: 11, direction: "ltr", whiteSpace: "nowrap" }}>
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
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 16 }}>
              {Array.from({ length: movementPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setMovPage(page)}
                  style={{
                    background: movPage === page ? "#e91e63" : "rgba(255,255,255,.08)",
                    color: movPage === page ? "#fff" : "#d7aabd",
                    border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Alerts ── */}
      {tab === "alerts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={CARD}>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: "#f87171", marginBottom: 14, marginTop: 0 }}>
              نفذ المخزون ({outOfStock.length})
            </h2>
            {outOfStock.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>لا توجد منتجات نفد مخزونها.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {outOfStock.map(p => (
                  <div
                    key={p.id}
                    style={{
                      background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.3)",
                      borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#fff4f8",
                      display: "flex", gap: 8, alignItems: "center",
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
            <h2 style={{ fontSize: 15, fontWeight: 900, color: "#ffd166", marginBottom: 14, marginTop: 0 }}>
              مخزون منخفض — أقل من {LOW_STOCK_THRESHOLD} قطعة ({lowStock.length})
            </h2>
            {lowStock.length === 0 ? (
              <p style={{ color: "#d7aabd", fontSize: 13 }}>لا توجد منتجات بمخزون منخفض.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {lowStock.map(p => (
                  <div
                    key={p.id}
                    style={{
                      background: "rgba(255,209,102,.1)", border: "1px solid rgba(255,209,102,.3)",
                      borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#fff4f8",
                      display: "flex", gap: 8, alignItems: "center",
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: "#ffd166", fontWeight: 700 }}>{p.stock}</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            {[
              { label: "قيمة المخزون بالتكلفة", value: `${totalCostValue.toLocaleString("ar-EG")} ج.م`, color: "#4ade80" },
              { label: "قيمة المخزون بالبيع", value: `${totalSellingValue.toLocaleString("ar-EG")} ج.م`, color: "#60a5fa" },
              { label: "إجمالي المشتريات", value: `${totalReceiptsCost.toLocaleString("ar-EG")} ج.م`, color: "#e91e63" },
              { label: "عدد الفواتير", value: receipts.length.toString(), color: "#a78bfa" },
              { label: "منتجات نفد مخزونها", value: outOfStock.length.toString(), color: "#f87171" },
              { label: "مخزون منخفض", value: lowStock.length.toString(), color: "#ffd166" },
            ].map(stat => (
              <div key={stat.label} style={{ ...CARD, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                <div style={{ fontSize: 12, color: "#d7aabd", marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Top products by stock value */}
          <div style={CARD}>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: "#fff4f8", marginBottom: 14, marginTop: 0 }}>
              أعلى المنتجات قيمةً في المخزون
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                    {["المنتج", "المخزون", "متوسط التكلفة", "قيمة المخزون", "سعر البيع", "هامش الربح"].map(h => (
                      <th
                        key={h}
                        style={{ color: "#d7aabd", fontWeight: 600, textAlign: "right", padding: "8px 10px", fontSize: 12 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...products]
                    .filter(p => p.stock > 0)
                    .sort((a, b) => (b.averageCost ?? 0) * b.stock - (a.averageCost ?? 0) * a.stock)
                    .slice(0, 15)
                    .map(p => {
                      const avg = p.averageCost ?? 0;
                      const margin = avg > 0 ? Math.round(((p.price - avg) / avg) * 100) : null;
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                          <td style={{ padding: "10px", color: "#fff4f8" }}>{p.name}</td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>{p.stock}</td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>{avg.toLocaleString("ar-EG")} ج.م</td>
                          <td style={{ padding: "10px", color: "#ffd166", fontWeight: 700 }}>
                            {(avg * p.stock).toLocaleString("ar-EG")} ج.م
                          </td>
                          <td style={{ padding: "10px", color: "#d7aabd" }}>{p.price.toLocaleString("ar-EG")} ج.م</td>
                          <td style={{ padding: "10px", color: margin != null && margin >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
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
              <h2 style={{ fontSize: 15, fontWeight: 900, color: "#fff4f8", marginBottom: 14, marginTop: 0 }}>
                الموردون ({suppliers.length})
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {suppliers.map(s => (
                  <div
                    key={s.id}
                    style={{
                      background: s.isActive ? "rgba(233,30,99,.12)" : "rgba(255,255,255,.04)",
                      border: `1px solid ${s.isActive ? "rgba(233,30,99,.3)" : "rgba(255,255,255,.1)"}`,
                      borderRadius: 10, padding: "8px 14px", fontSize: 13,
                      color: s.isActive ? "#fff4f8" : "#888",
                    }}
                  >
                    {s.name}
                    {!s.isActive && <span style={{ color: "#888", marginRight: 6, fontSize: 11 }}>(غير نشط)</span>}
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
