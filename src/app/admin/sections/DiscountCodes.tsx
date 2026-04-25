"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminSectionShell, AdminCard, AdminEmptyState } from "./shared";
import { TranslateButton } from "./TranslateButton";

interface TrainerDiscountCode {
  id: string;
  code: string;
  trainerName: string;
  trainerId: string;
  clientName: string;
  clientEmail: string;
  clientId: string;
  discountType: string;
  discountValue: number;
  maxDiscount: number | null;
  note: string | null;
  isUsed: boolean;
  usedAt: string | null;
  monthYear: string;
  createdAt: string;
}

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
  scope: "subscriptions" | "store" | "all";
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
  value: "", minAmount: "", maxUses: "",
  scope: "all" as "subscriptions" | "store" | "all",
  expiresAt: "", isActive: true,
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

// ─── Trainer Discount Codes Sub-section ────────────────────────────────────────
function TrainerDiscountCodesTable() {
  const [codes, setCodes] = useState<TrainerDiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterUsed, setFilterUsed] = useState<"all" | "used" | "unused">("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trainer-discount-codes");
      const json = await res.json() as { codes?: TrainerDiscountCode[] };
      setCodes(Array.isArray(json.codes) ? json.codes : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const deleteCode = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الكود؟")) return;
    setDeleting(id);
    await fetch(`/api/admin/trainer-discount-codes?id=${id}`, { method: "DELETE" });
    setDeleting(null);
    void load();
  };

  const filtered = codes.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.trainerName.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q) || c.clientEmail.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    const matchUsed = filterUsed === "all" || (filterUsed === "used" ? c.isUsed : !c.isUsed);
    return matchSearch && matchUsed;
  });

  const stats = {
    total: codes.length,
    used: codes.filter((c) => c.isUsed).length,
    unused: codes.filter((c) => !c.isUsed).length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "إجمالي الأكواد", value: stats.total, color: "text-pink-300" },
          { label: "مستخدمة", value: stats.used, color: "text-emerald-400" },
          { label: "متاحة", value: stats.unused, color: "text-yellow-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[rgba(255,188,219,0.12)] bg-white/5 p-4 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="mt-1 text-xs text-[#d7aabd]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المدربة أو العميل أو الكود..."
          className={INPUT + " max-w-xs"}
        />
        <div className="flex gap-2">
          {(["all", "used", "unused"] as const).map((f) => (
            <button key={f} onClick={() => setFilterUsed(f)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${filterUsed === f ? "bg-pink-600 text-white" : "border border-[rgba(255,188,219,0.2)] text-[#d7aabd] hover:border-pink-400"}`}>
              {f === "all" ? "الكل" : f === "used" ? "مستخدمة" : "متاحة"}
            </button>
          ))}
        </div>
      </div>

      <AdminCard>
        {loading ? (
          <div className="py-10 text-center text-sm text-[#d7aabd]">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <AdminEmptyState title="لا توجد أكواد" description="لم تُنشئ أي مدربة أكواد خصم بعد" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-3 pr-2 text-right font-bold">الكود</th>
                  <th className="py-3 pr-2 text-right font-bold">المدربة</th>
                  <th className="py-3 pr-2 text-right font-bold">العميل</th>
                  <th className="py-3 pr-2 text-right font-bold">الخصم</th>
                  <th className="py-3 pr-2 text-right font-bold">الشهر</th>
                  <th className="py-3 pr-2 text-right font-bold">الحالة</th>
                  <th className="py-3 pr-2 text-right font-bold">تاريخ الاستخدام</th>
                  <th className="py-3 pr-2 text-right font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-[rgba(255,188,219,0.07)] transition-colors hover:bg-white/5">
                    <td className="py-3 pr-2 font-black tracking-wider text-pink-300">{c.code}</td>
                    <td className="py-3 pr-2 font-bold text-[#fff4f8]">{c.trainerName}</td>
                    <td className="py-3 pr-2">
                      <div className="font-medium text-[#fff4f8]">{c.clientName}</div>
                      <div className="text-xs text-[#d7aabd]">{c.clientEmail}</div>
                    </td>
                    <td className="py-3 pr-2 text-[#d7aabd]">
                      {c.discountType === "fixed"
                        ? `${c.discountValue} جنيه`
                        : `${c.discountValue}%${c.maxDiscount ? ` (حد ${c.maxDiscount} ج)` : ""}`}
                      {c.note && <div className="text-xs text-[#a07080] mt-0.5">{c.note}</div>}
                    </td>
                    <td className="py-3 pr-2 text-[#d7aabd] text-xs">{c.monthYear}</td>
                    <td className="py-3 pr-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.isUsed ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/15 text-yellow-300"}`}>
                        {c.isUsed ? "✓ مستخدم" : "متاح"}
                      </span>
                    </td>
                    <td className="py-3 pr-2 text-xs text-[#d7aabd]">
                      {c.usedAt ? new Date(c.usedAt).toLocaleDateString("ar-EG") : "—"}
                    </td>
                    <td className="py-3 pr-2">
                      <button
                        disabled={deleting === c.id}
                        onClick={() => void deleteCode(c.id)}
                        className={BTN_DANGER + " disabled:opacity-40"}>
                        {deleting === c.id ? "..." : "حذف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function DiscountCodes() {
  const [activeTab, setActiveTab] = useState<"global" | "trainer">("global");
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
      scope: c.scope ?? "all",
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
          scope: form.scope,
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
    >
      {/* Tabs */}
      <div className="flex gap-2 border-b border-[rgba(255,188,219,0.12)] pb-0">
        {([["global", "🌐 أكواد عامة"], ["trainer", "🎟 أكواد المدربات"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`rounded-t-xl px-5 py-2.5 text-sm font-bold transition-colors ${activeTab === id ? "bg-pink-600 text-white" : "text-[#d7aabd] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Trainer codes tab */}
      {activeTab === "trainer" && <TrainerDiscountCodesTable />}

      {/* Global codes tab */}
      {activeTab === "global" && <>
      {/* Add button + Global message */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button className={BTN_PRIMARY} onClick={openCreate}>+ إضافة كود جديد</button>
        {msg && !showForm && (
          <div className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold ${msg.ok ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30" : "bg-red-950/40 text-red-300 border border-red-500/30"}`}>
            {msg.text}
          </div>
        )}
      </div>
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
                  <th className="py-3 text-right font-bold">النطاق</th>
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
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.scope === "subscriptions" ? "bg-blue-500/15 text-blue-300" : c.scope === "store" ? "bg-orange-500/15 text-orange-300" : "bg-white/10 text-[#d7aabd]"}`}>
                        {c.scope === "subscriptions" ? "🏋 اشتراكات" : c.scope === "store" ? "🛍 متجر" : "🌐 الكل"}
                      </span>
                    </td>
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

            <div>
              <label className={LABEL}>صالح للاستخدام في (Scope)</label>
              <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.scope}
                onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as typeof form.scope }))}>
                <option value="all">الكل (اشتراكات + متجر)</option>
                <option value="subscriptions">الاشتراكات والباقات والعروض فقط</option>
                <option value="store">المتجر فقط</option>
              </select>
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
              <div className="flex gap-2">
                <input className={`${INPUT} flex-1`} value={form.descriptionEn} onChange={f("descriptionEn")} placeholder="e.g. Summer discount" />
                <TranslateButton from={form.description} onTranslated={(t) => setForm((p) => ({ ...p, descriptionEn: t }))} />
              </div>
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
      </>}
    </AdminSectionShell>
  );
}
