"use client";

import { useState, useEffect } from "react";
import type { Complaint } from "../types";

const STATUS_LABELS: Record<string, string> = {
  "open":        "مفتوحة",
  "in-progress": "قيد المعالجة",
  "resolved":    "تم الحل",
  "closed":      "مغلقة",
};

const STATUS_COLORS: Record<string, string> = {
  "open":        "bg-red-900/40 text-red-400 border-red-800",
  "in-progress": "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  "resolved":    "bg-green-900/40 text-green-400 border-green-800",
  "closed":      "bg-gray-800 text-gray-500 border-gray-700",
};

export default function Complaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState("all");
  const [selected, setSelected]     = useState<Complaint | null>(null);
  const [adminNote, setAdminNote]   = useState("");
  const [newStatus, setNewStatus]   = useState("");
  const [saving, setSaving]         = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/complaints");
      if (res.ok) setComplaints(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openDetail = (c: Complaint) => {
    setSelected(c);
    setAdminNote(c.adminNote ?? "");
    setNewStatus(c.status);
  };

  const saveUpdate = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/complaints", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: selected.id, status: newStatus, adminNote }),
      });
      if (res.ok) {
        await load();
        setSelected(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === "all" ? complaints : complaints.filter(c => c.status === filter);

  const counts = {
    all:         complaints.length,
    open:        complaints.filter(c => c.status === "open").length,
    "in-progress": complaints.filter(c => c.status === "in-progress").length,
    resolved:    complaints.filter(c => c.status === "resolved").length,
    closed:      complaints.filter(c => c.status === "closed").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { key: "open",         label: "مفتوحة",         color: "text-red-400" },
          { key: "in-progress",  label: "قيد المعالجة",   color: "text-yellow-400" },
          { key: "resolved",     label: "تم الحل",         color: "text-green-400" },
          { key: "closed",       label: "مغلقة",           color: "text-gray-400" },
        ].map(s => (
          <div key={s.key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{counts[s.key as keyof typeof counts]}</div>
            <div className="text-gray-500 text-xs mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "open", "in-progress", "resolved", "closed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              filter === f ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {f === "all" ? `الكل (${counts.all})` : `${STATUS_LABELS[f]} (${counts[f as keyof typeof counts]})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="text-center text-gray-500 py-16">جارٍ تحميل الشكاوى...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <div className="text-4xl mb-2">📭</div>
            <div>لا توجد شكاوى</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr className="text-gray-500 text-xs">
                <th className="text-right px-4 py-3 font-medium">العميل</th>
                <th className="text-right px-4 py-3 font-medium">الموضوع</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">التاريخ</th>
                <th className="text-right px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map(c => (
                <tr key={c.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{c.user.name ?? "—"}</div>
                    <div className="text-gray-500 text-xs">{c.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{c.subject}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                    {new Date(c.createdAt).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${STATUS_COLORS[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(c)}
                      className="text-yellow-400 hover:text-yellow-300 text-xs font-medium transition-colors"
                    >
                      عرض / رد
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h3 className="font-black text-lg text-white">تفاصيل الشكوى</h3>
              <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white transition-colors">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center font-black text-sm shrink-0">
                  {(selected.user.name ?? "?").charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-white">{selected.user.name}</div>
                  <div className="text-gray-500 text-xs">{selected.user.email}</div>
                  <div className="text-gray-600 text-xs mt-0.5">
                    {new Date(selected.createdAt).toLocaleString("ar-EG")}
                  </div>
                </div>
              </div>

              <div className="bg-gray-950 rounded-xl p-4">
                <div className="text-yellow-400 font-bold text-sm mb-2">📌 {selected.subject}</div>
                <p className="text-gray-300 text-sm leading-relaxed">{selected.message}</p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">تغيير الحالة</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-red-600"
                >
                  <option value="open">مفتوحة</option>
                  <option value="in-progress">قيد المعالجة</option>
                  <option value="resolved">تم الحل</option>
                  <option value="closed">مغلقة</option>
                </select>
              </div>

              {/* Admin note */}
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">ملاحظة الإدمن (ترسل للعميل)</label>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  rows={3}
                  placeholder="اكتب ردك أو ملاحظتك هنا..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-red-600 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-gray-800">
              <button
                onClick={saveUpdate}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                {saving ? "جارٍ الحفظ..." : "حفظ وإرسال إشعار"}
              </button>
              <button
                onClick={() => setSelected(null)}
                className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-400 hover:text-white text-sm transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
