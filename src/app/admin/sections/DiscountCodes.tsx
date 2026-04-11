"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminSectionShell, AdminCard, AdminEmptyState } from "./shared";

interface DiscountCode {
  id: string;
  code: string;
  description: string | null;
  descriptionEn: string | null;
  type: "percentage" | "fixed";
  value: number;
  minAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

const INPUT = "w-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,188,219,0.2)] focus:border-pink-400 rounded-xl px-4 py-2.5 text-[#fff4f8] text-sm outline-none transition-colors placeholder:text-[#a07080] [&_option]:bg-[#2a0f1b] [&_option]:text-[#fff2f8]";
const LABEL = "block text-xs font-bold text-[#d7aabd] mb-1";
const BTN_PRIMARY = "rounded-xl bg-[#E91E63] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#C2185B] disabled:opacity-50";
const BTN_GHOST = "rounded-xl border border-[rgba(255,188,219,0.2)] px-3 py-1.5 text-xs font-bold text-[#d7aabd] transition-colors hover:border-pink-400 hover:text-white";
const BTN_DANGER = "rounded-xl border border-red-500/30 px-3 py-1.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/10";

const EMPTY_FORM = {
  code: "", description: "", descriptionEn: "",
  type: "percentage" as "percentage" | "fixed",
  value: "", minAmount: "", maxUses: "", expiresAt: "", isActive: true,
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[rgba(255,188,219,0.2)] bg-[rgba(40,10,22,0.97)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-[#fff4f8]">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-[#a07080] hover:text-white">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function DiscountCodes() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetch("/api/admin/discount-codes").then((r) => r.json()) as DiscountCode[];
      setCodes(Array.isArray(data) ? data : []);
    } catch {
      setCodes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const openCreate = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setMsg(null); setShowForm(true); };
  const openEdit = (c: DiscountCode) => {
    setEditingId(c.id);
    setForm({
      code: c.code, description: c.description ?? "", descriptionEn: c.descriptionEn ?? "",
      type: c.type, value: String(c.value), minAmount: c.minAmount ? String(c.minAmount) : "",
      maxUses: c.maxUses ? String(c.maxUses) : "",
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : "",
      isActive: c.isActive,
    });
    setMsg(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { setMsg({ text: "الكود مطلوب", ok: false }); return; }
    if (!form.value || isNaN(Number(form.value))) { setMsg({ text: "القيمة مطلوبة", ok: false }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const url = editingId ? `/api/admin/discount-codes/${editingId}` : "/api/admin/discount-codes";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim().toUpperCase(),
          description: form.description.trim() || null,
          descriptionEn: form.descriptionEn.trim() || null,
          type: form.type,
          value: Number(form.value),
          minAmount: form.minAmount ? Number(form.minAmount) : null,
          maxUses: form.maxUses ? Number(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
          isActive: form.isActive,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setMsg({ text: data.error ?? "حدث خطأ", ok: false }); return; }
      setMsg({ text: editingId ? "تم التحديث بنجاح" : "تم إنشاء الكود بنجاح", ok: true });
      setShowForm(false);
      fetchCodes();
    } catch {
      setMsg({ text: "تعذر الحفظ", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: DiscountCode) => {
    await fetch(`/api/admin/discount-codes/${c.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    fetchCodes();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/admin/discount-codes/${deleteId}`, { method: "DELETE" });
    setDeleteId(null);
    fetchCodes();
  };

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const formatValue = (c: DiscountCode) =>
    c.type === "percentage" ? `${c.value}%` : `${c.value} جنيه`;

  return (
    <AdminSectionShell
      title="أكواد الخصم"
      subtitle="Discount Codes — أنشئ وأدر أكواد الخصم للاشتراكات"
      actions={<button className={BTN_PRIMARY} onClick={openCreate}>+ إضافة كود جديد</button>}
    >
      {/* Global message */}
      {msg && !showForm && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold ${msg.ok ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30" : "bg-red-950/40 text-red-300 border border-red-500/30"}`}>
          {msg.text}
        </div>
      )}

      <AdminCard>
        {loading ? (
          <div className="py-10 text-center text-sm text-[#d7aabd]">جاري التحميل...</div>
        ) : codes.length === 0 ? (
          <AdminEmptyState title="لا توجد أكواد خصم" description="أضف كود خصم جديد لاستخدامه في الاشتراكات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-3 text-right font-bold">الكود</th>
                  <th className="py-3 text-right font-bold">الخصم</th>
                  <th className="py-3 text-right font-bold">الوصف</th>
                  <th className="py-3 text-right font-bold">الاستخدام</th>
                  <th className="py-3 text-right font-bold">الصلاحية</th>
                  <th className="py-3 text-right font-bold">الحالة</th>
                  <th className="py-3 text-right font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5 transition-colors">
                    <td className="py-3 font-black text-pink-300 tracking-wider">{c.code}</td>
                    <td className="py-3 font-bold text-[#fff4f8]">{formatValue(c)}</td>
                    <td className="py-3 text-[#d7aabd] max-w-[180px] truncate">{c.description ?? "—"}</td>
                    <td className="py-3 text-[#d7aabd]">
                      {c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : " / ∞"}
                    </td>
                    <td className="py-3 text-[#d7aabd]">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("ar-EG") : "—"}
                    </td>
                    <td className="py-3">
                      <button onClick={() => handleToggle(c)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${c.isActive ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-red-500/15 text-red-400 hover:bg-red-500/25"}`}>
                        {c.isActive ? "فعّال" : "معطّل"}
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <button className={BTN_GHOST} onClick={() => openEdit(c)}>تعديل</button>
                        <button className={BTN_DANGER} onClick={() => setDeleteId(c.id)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Create/Edit Modal */}
      {showForm && (
        <Modal title={editingId ? "تعديل كود الخصم" : "إضافة كود خصم جديد"} onClose={() => setShowForm(false)}>
          {msg && (
            <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-bold ${msg.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
              {msg.text}
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>الكود (Code) *</label>
                <input className={INPUT} value={form.code} onChange={f("code")}
                  placeholder="SUMMER20" disabled={!!editingId}
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div>
                <label className={LABEL}>نوع الخصم (Type)</label>
                <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.type} onChange={f("type")}>
                  <option value="percentage">نسبة مئوية %</option>
                  <option value="fixed">مبلغ ثابت (جنيه)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>القيمة * {form.type === "percentage" ? "(1-100)" : "(جنيه)"}</label>
                <input className={INPUT} type="number" min="0" value={form.value} onChange={f("value")} placeholder="20" />
              </div>
              <div>
                <label className={LABEL}>حد أدنى للاشتراك</label>
                <input className={INPUT} type="number" min="0" value={form.minAmount} onChange={f("minAmount")} placeholder="اختياري" />
              </div>
              <div>
                <label className={LABEL}>الحد الأقصى للاستخدام</label>
                <input className={INPUT} type="number" min="1" value={form.maxUses} onChange={f("maxUses")} placeholder="∞ غير محدود" />
              </div>
            </div>

            <div>
              <label className={LABEL}>تاريخ انتهاء الصلاحية</label>
              <input className={INPUT} type="date" value={form.expiresAt} onChange={f("expiresAt")} />
            </div>

            <div>
              <label className={LABEL}>الوصف (عربي)</label>
              <input className={INPUT} value={form.description} onChange={f("description")} placeholder="مثال: خصم الصيف" />
            </div>
            <div>
              <label className={LABEL}>الوصف (إنجليزي — Description EN)</label>
              <input className={INPUT} value={form.descriptionEn} onChange={f("descriptionEn")} placeholder="e.g. Summer discount" />
            </div>

            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                className="h-4 w-4 accent-pink-500" />
              <span className="text-sm text-[#d7aabd]">فعّال (Active)</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button className={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
                {saving ? "جاري الحفظ..." : editingId ? "حفظ التعديلات" : "إنشاء الكود"}
              </button>
              <button className={BTN_GHOST} onClick={() => setShowForm(false)}>إلغاء</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <Modal title="تأكيد الحذف" onClose={() => setDeleteId(null)}>
          <p className="mb-6 text-sm text-[#d7aabd]">هل أنت متأكد من حذف هذا الكود؟ لن يمكن التراجع.</p>
          <div className="flex gap-3">
            <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700" onClick={handleDelete}>حذف</button>
            <button className={BTN_GHOST} onClick={() => setDeleteId(null)}>إلغاء</button>
          </div>
        </Modal>
      )}
    </AdminSectionShell>
  );
}
