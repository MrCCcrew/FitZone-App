"use client";

import { useEffect, useState } from "react";
import type { Testimonial } from "../types";

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-gray-700 bg-gray-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="text-xl text-gray-500">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Testimonials() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | Testimonial["status"]>("all");
  const [modal, setModal] = useState<Testimonial | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/testimonials", { cache: "no-store" });
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = filter === "all" ? items : items.filter((item) => item.status === filter);

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      await load();
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("حذف الرأي؟")) return;
    await fetch("/api/admin/testimonials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["all", "كل الآراء", items.length, "text-white"],
          ["pending", "معلقة", items.filter((item) => item.status === "pending").length, "text-yellow-400"],
          ["approved", "منشورة", items.filter((item) => item.status === "approved").length, "text-green-400"],
          ["rejected", "مرفوضة", items.filter((item) => item.status === "rejected").length, "text-red-400"],
        ].map(([key, label, value, color]) => (
          <button
            key={String(key)}
            onClick={() => setFilter(key as "all" | Testimonial["status"])}
            className={`rounded-2xl border p-4 text-right transition-colors ${
              filter === key ? "border-red-600 bg-red-950/20" : "border-gray-800 bg-gray-900/60"
            }`}
          >
            <div className={`text-2xl font-black ${color}`}>{value}</div>
            <div className="mt-1 text-xs text-gray-500">{label}</div>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60">
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">جارٍ تحميل الآراء...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">لا توجد آراء حاليًا</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-xs text-gray-500">
              <tr>
                {["الاسم", "الرأي", "التقييم", "الحالة", "التاريخ", ""].map((header) => (
                  <th key={header} className="px-4 py-3 text-right">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-gray-800/50 align-top">
                  <td className="px-4 py-3">
                    <div className="font-bold text-white">{item.displayName || item.user.name || "عميل"}</div>
                    {item.displayNameEn ? <div className="text-xs text-gray-500">{item.displayNameEn}</div> : null}
                    <div className="text-xs text-gray-500">{item.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    <div>{item.content}</div>
                    {item.contentEn ? <div className="mt-2 text-xs text-gray-500">{item.contentEn}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-yellow-400">{item.rating}/5</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                      item.status === "approved"
                        ? "bg-green-500/20 text-green-400"
                        : item.status === "rejected"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-yellow-500/20 text-yellow-400"
                    }`}>
                      {item.status === "approved" ? "منشور" : item.status === "rejected" ? "مرفوض" : "معلق"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(item.createdAt).toLocaleDateString("ar-EG")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setModal(item)} className="text-xs font-bold text-yellow-400">تعديل</button>
                      <button onClick={() => void remove(item.id)} className="text-xs font-bold text-red-400">حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal title="تعديل الرأي" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <input value={modal.displayName ?? ""} onChange={(e) => setModal({ ...modal, displayName: e.target.value })} className={INPUT} placeholder="الاسم الظاهر" />
            <input value={modal.displayNameEn ?? ""} onChange={(e) => setModal({ ...modal, displayNameEn: e.target.value })} className={INPUT} placeholder="Display name in English" dir="ltr" />
            <textarea value={modal.content} onChange={(e) => setModal({ ...modal, content: e.target.value })} rows={4} className={`${INPUT} resize-none`} placeholder="محتوى الرأي" />
            <textarea value={modal.contentEn ?? ""} onChange={(e) => setModal({ ...modal, contentEn: e.target.value })} rows={4} className={`${INPUT} resize-none`} placeholder="Testimonial content in English" dir="ltr" />
            <div className="grid gap-4 md:grid-cols-2">
              <select value={modal.rating} onChange={(e) => setModal({ ...modal, rating: Number(e.target.value) })} className={INPUT}>
                {[1, 2, 3, 4, 5].map((rate) => <option key={rate} value={rate}>{rate}</option>)}
              </select>
              <select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value as Testimonial["status"] })} className={INPUT}>
                <option value="pending">معلق</option>
                <option value="approved">منشور</option>
                <option value="rejected">مرفوض</option>
              </select>
            </div>
            <textarea value={modal.adminNote ?? ""} onChange={(e) => setModal({ ...modal, adminNote: e.target.value })} rows={3} className={`${INPUT} resize-none`} placeholder="ملاحظة داخلية أو سبب الرفض" />
            <button onClick={() => void save()} disabled={saving} className="w-full rounded-xl bg-red-600 py-3 font-black text-white disabled:opacity-50">
              {saving ? "جارٍ الحفظ..." : "حفظ التعديل"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
