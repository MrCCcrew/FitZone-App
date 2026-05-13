"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [tab, setTab] = useState<"receipts" | "movements" | "alerts" | "reports">("receipts");
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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, suppRes, recRes, movRes] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/admin/suppliers", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/admin/inventory/receipts", { cache: "no-store" }).then(r => r.json()),
        fetch("/api/admin/inventory/movements", { cache: "no-store" }).then(r => r.json()),
      ]);
      setProducts(Array.isArray(prodRes) ? prodRes : []);
      setSuppliers(Array.isArray(suppRes?.suppliers) ? suppRes.suppliers : []);
      setReceipts(Array.isArray(recRes) ? recRes : []);
      setMovements(Array.isArray(movRes) ? movRes : []);
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
