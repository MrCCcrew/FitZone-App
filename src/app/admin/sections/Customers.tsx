"use client";

import { useState, useEffect, useCallback } from "react";
import type { Customer } from "../types";

const STATUS_CONFIG: Record<Customer["status"], { label: string; color: string; dot: string }> = {
  active:    { label: "نشط",    color: "bg-green-500/20 text-green-400",  dot: "bg-green-400" },
  suspended: { label: "موقوف", color: "bg-yellow-500/20 text-yellow-400", dot: "bg-yellow-400" },
  expired:   { label: "منتهي",  color: "bg-red-500/20 text-red-400",     dot: "bg-red-400" },
};
const PLAN_COLORS: Record<string, string> = { "أساسي": "text-gray-400", "بلاتيني": "text-red-400", "VIP": "text-yellow-400", "سنوي VIP": "text-purple-400" };
const INPUT = "w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-gray-500 text-xs mb-1.5">{label}</label>{children}</div>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-black text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const EMPTY: Omit<Customer, "id"> = {
  name: "", phone: "", email: "", plan: "أساسي",
  status: "active", joinDate: new Date().toISOString().split("T")[0],
  points: 0, balance: 0, avatar: "؟",
};

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | Omit<Customer, "id"> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/admin/customers").then(r => r.json());
    setCustomers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = customers.filter((c) => {
    const matchSearch = c.name.includes(search) || c.phone.includes(search) || c.email.includes(search);
    const matchPlan = planFilter === "الكل" || c.plan === planFilter;
    const matchStatus = statusFilter === "الكل" || c.status === statusFilter;
    return matchSearch && matchPlan && matchStatus;
  });

  const plans = Array.from(new Set(customers.map((c) => c.plan)));

  const saveCustomer = async () => {
    if (!editCustomer) return;
    setSaving(true);
    const isEdit = "id" in editCustomer;
    await fetch("/api/admin/customers", {
      method:  isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(editCustomer),
    });
    await fetchAll();
    setEditCustomer(null); setSaving(false);
  };

  const setStatus = async (id: string, status: Customer["status"], plan?: string) => {
    await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, plan }),
    });
    await fetchAll();
  };

  const deleteCustomer = async (id: string) => {
    await fetch("/api/admin/customers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setConfirmDelete(null); setViewCustomer(null);
    await fetchAll();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500 text-sm">جارٍ تحميل بيانات الأعضاء...</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["إجمالي الأعضاء", customers.length, "text-white"],
          ["أعضاء نشطون", customers.filter(c => c.status === "active").length, "text-green-400"],
          ["موقوفون", customers.filter(c => c.status === "suspended").length, "text-yellow-400"],
          ["منتهية اشتراكاتهم", customers.filter(c => c.status === "expired").length, "text-red-400"],
        ].map(([label, val, color]) => (
          <div key={label as string} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-black ${color}`}>{val}</div>
            <div className="text-gray-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو الإيميل..."
          className="flex-1 min-w-56 bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder-gray-600"
        />
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2 outline-none">
          <option>الكل</option>
          {plans.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-gray-800 border border-gray-700 text-white text-sm rounded-xl px-3 py-2 outline-none">
          <option>الكل</option>
          <option value="active">نشط</option>
          <option value="suspended">موقوف</option>
          <option value="expired">منتهي</option>
        </select>
        <button onClick={() => setEditCustomer(EMPTY)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap">
          + عضو جديد
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="text-gray-400 text-sm">{filtered.length} عضو</span>
          <div className="flex gap-2">
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <span key={k} className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.color}`}>
                {customers.filter(c => c.status === k).length} {v.label}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                {["العضو", "الهاتف", "الباقة", "الحالة", "الانضمام", "النقاط", "الرصيد", ""].map((h) => (
                  <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const sc = STATUS_CONFIG[c.status];
                return (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center text-white font-black">
                          {c.avatar}
                        </div>
                        <div>
                          <button onClick={() => setViewCustomer(c)} className="text-white font-medium hover:text-yellow-400 transition-colors text-right">
                            {c.name}
                          </button>
                          <div className="text-gray-500 text-xs">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs" dir="ltr">{c.phone}</td>
                    <td className="py-3 px-4 font-bold text-sm">
                      <span className={PLAN_COLORS[c.plan] ?? "text-gray-400"}>{c.plan}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold ${sc.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{c.joinDate}</td>
                    <td className="py-3 px-4 text-yellow-400 font-bold">{c.points.toLocaleString("ar-EG")}</td>
                    <td className="py-3 px-4 text-blue-400 font-bold">{c.balance.toLocaleString("ar-EG")} ج.م</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewCustomer(c)} className="text-gray-500 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">عرض</button>
                        <button onClick={() => setEditCustomer(c)} className="text-gray-500 hover:text-yellow-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">تعديل</button>
                        {c.status === "active"
                          ? <button onClick={() => setStatus(c.id, "suspended", c.plan)} className="text-gray-500 hover:text-yellow-500 text-xs px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">إيقاف</button>
                          : <button onClick={() => setStatus(c.id, "active", c.plan)} className="text-gray-500 hover:text-green-400 text-xs px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">تفعيل</button>}
                        <button onClick={() => setConfirmDelete(c)} className="text-gray-500 hover:text-red-500 text-xs px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors">حذف</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      {viewCustomer && (
        <Modal title="ملف العضو" onClose={() => setViewCustomer(null)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center text-white font-black text-2xl">
                {viewCustomer.avatar}
              </div>
              <div>
                <div className="text-white font-black text-xl">{viewCustomer.name}</div>
                <div className={`text-sm font-bold mt-1 ${PLAN_COLORS[viewCustomer.plan]}`}>{viewCustomer.plan}</div>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-bold mt-1 ${STATUS_CONFIG[viewCustomer.status].color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[viewCustomer.status].dot}`} />
                  {STATUS_CONFIG[viewCustomer.status].label}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[["🏅", "النقاط", viewCustomer.points.toLocaleString("ar-EG")],
                ["💳", "الرصيد", viewCustomer.balance.toLocaleString("ar-EG") + " ج.م"],
                ["📅", "الانضمام", viewCustomer.joinDate]].map(([icon, label, val]) => (
                <div key={label} className="bg-gray-800 rounded-xl p-3 text-center">
                  <div className="text-xl mb-1">{icon}</div>
                  <div className="text-white font-black text-sm">{val}</div>
                  <div className="text-gray-500 text-xs">{label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {[["الهاتف", viewCustomer.phone], ["الإيميل", viewCustomer.email]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                  <span className="text-gray-500 text-sm">{k}</span>
                  <span className="text-white font-medium text-sm" dir="ltr">{v}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setEditCustomer(viewCustomer); setViewCustomer(null); }} className="bg-yellow-500 hover:bg-yellow-400 text-black font-black py-2.5 rounded-xl transition-colors text-sm">✏️ تعديل</button>
              <button onClick={() => { setConfirmDelete(viewCustomer); setViewCustomer(null); }} className="bg-red-900/50 hover:bg-red-800 text-red-400 font-bold py-2.5 rounded-xl transition-colors text-sm">🗑️ حذف</button>
            </div>

            {viewCustomer.status === "active"
              ? <button onClick={() => { setStatus(viewCustomer.id, "suspended", viewCustomer.plan); setViewCustomer(null); }} className="w-full bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold py-2.5 rounded-xl transition-colors text-sm">⛔ إيقاف العضوية</button>
              : <button onClick={() => { setStatus(viewCustomer.id, "active", viewCustomer.plan); setViewCustomer(null); }} className="w-full bg-gray-800 hover:bg-gray-700 text-green-400 font-bold py-2.5 rounded-xl transition-colors text-sm">✅ تفعيل العضوية</button>}
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editCustomer && (
        <Modal title={"id" in editCustomer ? "تعديل بيانات العضو" : "عضو جديد"} onClose={() => setEditCustomer(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="الاسم الكامل">
                <input value={editCustomer.name} onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })} className={INPUT} />
              </Field>
              <Field label="رقم الهاتف">
                <input value={editCustomer.phone} onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })} className={INPUT} dir="ltr" />
              </Field>
            </div>
            <Field label="البريد الإلكتروني">
              <input type="email" value={editCustomer.email} onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })} className={INPUT} dir="ltr" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="الباقة">
                <select value={editCustomer.plan} onChange={(e) => setEditCustomer({ ...editCustomer, plan: e.target.value })} className={INPUT}>
                  <option>أساسي</option><option>بلاتيني</option><option>VIP</option><option>سنوي VIP</option>
                </select>
              </Field>
              <Field label="الحالة">
                <select value={editCustomer.status} onChange={(e) => setEditCustomer({ ...editCustomer, status: e.target.value as Customer["status"] })} className={INPUT}>
                  <option value="active">نشط</option>
                  <option value="suspended">موقوف</option>
                  <option value="expired">منتهي</option>
                </select>
              </Field>
              <Field label="النقاط">
                <input type="number" value={editCustomer.points} onChange={(e) => setEditCustomer({ ...editCustomer, points: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="الرصيد (ج.م)">
                <input type="number" value={editCustomer.balance} onChange={(e) => setEditCustomer({ ...editCustomer, balance: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
            </div>
            <button onClick={saveCustomer} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">{saving ? "جارٍ الحفظ..." : "💾 حفظ البيانات"}</button>
          </div>
        </Modal>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-gray-900 border border-red-800 rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-white font-black text-lg mb-2">تأكيد الحذف</h3>
            <p className="text-gray-400 text-sm mb-6">هل أنت متأكد من حذف <span className="text-red-400 font-bold">{confirmDelete.name}</span>؟ لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors">إلغاء</button>
              <button onClick={() => deleteCustomer(confirmDelete.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-colors">نعم، احذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
