"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryMovement, InventoryReceipt, Product } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

type ReceiptDraftItem = {
  productId: string;
  quantity: number;
  unitCost: number;
};

const EMPTY_ITEM: ReceiptDraftItem = {
  productId: "",
  quantity: 1,
  unitCost: 0,
};

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<InventoryReceipt[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"receipts" | "movements">("receipts");
  const [supplierName, setSupplierName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItem, setDraftItem] = useState<ReceiptDraftItem>({ ...EMPTY_ITEM });
  const [items, setItems] = useState<ReceiptDraftItem[]>([]);

  // Edit mode
  const [editingReceipt, setEditingReceipt] = useState<InventoryReceipt | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [productsRes, receiptsRes, movementsRes] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/inventory/receipts", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/inventory/movements", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setProducts(Array.isArray(productsRes) ? productsRes : []);
      setReceipts(Array.isArray(receiptsRes) ? receiptsRes : []);
      setMovements(Array.isArray(movementsRes) ? movementsRes : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const productLookup = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const receiptTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0),
    [items],
  );

  const addItem = () => {
    if (!draftItem.productId || draftItem.quantity <= 0 || draftItem.unitCost < 0) return;
    const next = items.filter((item) => item.productId !== draftItem.productId);
    next.push({ ...draftItem });
    setItems(next);
    setDraftItem({ ...EMPTY_ITEM });
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const clearForm = () => {
    setSupplierName("");
    setReferenceNumber("");
    setNotes("");
    setItems([]);
    setDraftItem({ ...EMPTY_ITEM });
    setEditingReceipt(null);
  };

  const startEdit = (receipt: InventoryReceipt) => {
    setEditingReceipt(receipt);
    setSupplierName(receipt.supplierName ?? "");
    setReferenceNumber(receipt.referenceNumber ?? "");
    setNotes(receipt.notes ?? "");
    setItems(
      receipt.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
    );
    setTab("receipts"); // ensure form is visible
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveReceipt = async () => {
    if (!items.length) {
      window.alert("يرجى إضافة منتجات للمشتريات.");
      return;
    }
    setSaving(true);
    try {
      const payload = { supplierName, referenceNumber, notes, items };

      const url = editingReceipt
        ? `/api/admin/inventory/receipts/${editingReceipt.id}`
        : "/api/admin/inventory/receipts";
      const method = editingReceipt ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error ?? "تعذر حفظ الفاتورة.");
        return;
      }
      clearForm();
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const deleteReceipt = async (receiptId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الفاتورة؟ سيتم عكس تأثيرها على المخزون.")) return;
    setDeletingId(receiptId);
    try {
      const response = await fetch(`/api/admin/inventory/receipts/${receiptId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error ?? "تعذر حذف الفاتورة.");
        return;
      }
      if (editingReceipt?.id === receiptId) clearForm();
      await loadData();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <AdminSectionShell
        title="المخزون والمشتريات"
        subtitle="سجل مشتريات المخزون واحسب المتوسط المرجح تلقائياً."
      >
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري التحميل...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell
      title="المخزون والمشتريات"
      subtitle="تسجيل المشتريات وحساب متوسط التكلفة، مع متابعة حركات المخزون."
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <AdminCard>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-black text-[#fff4f8]">
                {editingReceipt ? "تعديل فاتورة مشتريات" : "إضافة فاتورة مشتريات"}
              </div>
              <div className="text-xs text-[#d7aabd]">
                {editingReceipt
                  ? "تعديل الفاتورة يُعيد احتساب المخزون والمتوسط المرجح بالكامل."
                  : "يتم تحديث المخزون ومتوسط التكلفة بمجرد الحفظ."}
              </div>
            </div>
            {editingReceipt && (
              <button
                type="button"
                onClick={clearForm}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-[#d7aabd] hover:bg-white/20"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-[#fff4f8]">
              <span className="font-bold">اسم المورد</span>
              <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className={INPUT} />
            </label>
            <label className="space-y-2 text-sm text-[#fff4f8]">
              <span className="font-bold">رقم الفاتورة</span>
              <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={INPUT} />
            </label>
          </div>

          <label className="mt-3 block space-y-2 text-sm text-[#fff4f8]">
            <span className="font-bold">ملاحظات</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${INPUT} min-h-20`} />
          </label>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-bold text-[#fff4f8]">تفاصيل المشتريات</div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d7aabd]">المنتج</label>
                <select
                  value={draftItem.productId}
                  onChange={(e) => setDraftItem({ ...draftItem, productId: e.target.value })}
                  className={INPUT}
                >
                  <option value="">اختاري المنتج</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d7aabd]">الكمية</label>
                <input
                  type="number"
                  min={1}
                  value={draftItem.quantity}
                  onChange={(e) => setDraftItem({ ...draftItem, quantity: Number(e.target.value) })}
                  className={`${INPUT} w-28`}
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d7aabd]">سعر الوحدة (ج.م)</label>
                <input
                  type="number"
                  min={0}
                  value={draftItem.unitCost}
                  onChange={(e) => setDraftItem({ ...draftItem, unitCost: Number(e.target.value) })}
                  className={`${INPUT} w-32`}
                  dir="ltr"
                />
              </div>
              <button
                type="button"
                onClick={addItem}
                className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
              >
                إضافة
              </button>
            </div>

            {items.length === 0 ? (
              <div className="mt-3 text-xs text-[#d7aabd]">لم تتم إضافة منتجات بعد.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {items.map((item) => {
                  const product = productLookup.get(item.productId);
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-[#fff4f8]"
                    >
                      <div>
                        {product?.name ?? "منتج"}
                        <span className="mr-2 text-xs text-[#d7aabd]">
                          ({item.quantity} × {item.unitCost} ج.م)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        className="text-[#d7aabd] transition-colors hover:text-rose-300"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm font-bold text-[#fff4f8]">
              الإجمالي: <span className="text-[#ffd166]">{receiptTotal.toLocaleString("ar-EG")}</span> ج.م
            </div>
            <button
              onClick={saveReceipt}
              disabled={saving}
              className="rounded-xl bg-[#ff4f93] px-6 py-2 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving
                ? "جاري الحفظ..."
                : editingReceipt
                  ? "حفظ التعديلات"
                  : "حفظ الفاتورة"}
            </button>
          </div>
        </AdminCard>

        <AdminCard>
          <div className="flex items-center gap-2">
            <button
              className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "receipts" ? "bg-[#ff4f93] text-white" : "bg-white/10 text-[#d7aabd]"}`}
              onClick={() => setTab("receipts")}
            >
              فواتير المشتريات
            </button>
            <button
              className={`rounded-full px-4 py-2 text-xs font-bold ${tab === "movements" ? "bg-[#ff4f93] text-white" : "bg-white/10 text-[#d7aabd]"}`}
              onClick={() => setTab("movements")}
            >
              حركة المخزون
            </button>
          </div>

          {tab === "receipts" ? (
            <div className="mt-4 space-y-3">
              {receipts.length === 0 ? (
                <AdminEmptyState title="لا توجد فواتير بعد" description="سجلي أول فاتورة مشتريات للمخزون." />
              ) : (
                receipts.map((receipt) => (
                  <div
                    key={receipt.id}
                    className={`rounded-2xl border p-4 text-sm text-[#fff4f8] transition-colors ${
                      editingReceipt?.id === receipt.id
                        ? "border-[#ff4f93]/60 bg-[#ff4f93]/10"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold">{receipt.referenceNumber || "فاتورة بدون رقم"}</div>
                        <div className="mt-0.5 text-xs text-[#d7aabd]">
                          {new Date(receipt.receivedAt).toLocaleDateString("ar-EG")}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(receipt)}
                          className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold text-[#d7aabd] hover:bg-white/20"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteReceipt(receipt.id)}
                          disabled={deletingId === receipt.id}
                          className="rounded-lg bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/40 disabled:opacity-50"
                        >
                          {deletingId === receipt.id ? "..." : "حذف"}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-[#d7aabd]">{receipt.supplierName || "بدون مورد"}</div>
                    <div className="mt-2 text-xs text-[#ffd166]">
                      الإجمالي: {receipt.totalCost.toLocaleString("ar-EG")} ج.م
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-[#fff4f8]">
                      {receipt.items.map((item) => (
                        <div key={item.id}>
                          {item.productName} — {item.quantity} × {item.unitCost} ج.م
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {movements.length === 0 ? (
                <AdminEmptyState title="لا توجد حركة بعد" description="سيظهر سجل حركة المخزون هنا." />
              ) : (
                movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-[#fff4f8]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold">{movement.productName}</div>
                      <div className="text-xs text-[#d7aabd]">
                        {new Date(movement.createdAt).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-[#d7aabd]">
                      {movement.type} • {movement.quantityChange > 0 ? "+" : ""}
                      {movement.quantityChange}
                    </div>
                    <div className="mt-2 text-xs text-[#ffd166]">
                      {movement.quantityBefore} → {movement.quantityAfter}
                    </div>
                    {movement.unitCost != null ? (
                      <div className="mt-1 text-xs text-[#d7aabd]">تكلفة الوحدة: {movement.unitCost}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}
        </AdminCard>
      </div>
    </AdminSectionShell>
  );
}
