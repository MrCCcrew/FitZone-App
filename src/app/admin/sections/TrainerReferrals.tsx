"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrainerCommissionRow, TrainerReferralLink } from "../types";

const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="rounded-lg bg-gray-700 px-2 py-1 text-xs font-bold text-gray-300 hover:bg-gray-600"
    >{copied ? "✓ تم النسخ" : "نسخ"}</button>
  );
}

export default function TrainerReferrals({ userRole }: { userRole?: string }) {
  const isAdmin = userRole === "admin" || userRole === "head_coach";

  const [links, setLinks] = useState<TrainerReferralLink[]>([]);
  const [commissions, setCommissions] = useState<TrainerCommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"links" | "commissions">("links");
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [trainerList, setTrainerList] = useState<{ id: string; name: string; email: string }[]>([]);
  const [settleUserId, setSettleUserId] = useState("");
  const [settling, setSettling] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/trainer-referrals", { cache: "no-store" });
      const data = await res.json().catch(() => ({ links: [] }));
      setLinks(Array.isArray(data.links) ? data.links : []);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCommissions = useCallback(async () => {
    const res = await fetch("/api/admin/trainer-referrals?view=commissions", { cache: "no-store" });
    const data = await res.json().catch(() => ({ commissions: [] }));
    setCommissions(Array.isArray(data.commissions) ? data.commissions : []);
  }, []);

  useEffect(() => { void loadLinks(); }, [loadLinks]);
  useEffect(() => {
    if (activeTab === "commissions") void loadCommissions();
  }, [activeTab, loadCommissions]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/trainers", { cache: "no-store" })
      .then((r) => r.json()).then((d) => {
        const trainers = Array.isArray(d.trainers) ? d.trainers : [];
        const list = trainers
          .filter((t: any) => t.linkedUser?.id)
          .map((t: any) => ({ id: t.linkedUser.id, name: t.name, email: t.linkedUser.email }));
        setTrainerList(list);
      }).catch(() => null);
  }, [isAdmin]);

  const createLink = async () => {
    setCreating(true);
    try {
      const body: Record<string, unknown> = { label: newLabel || null };
      if (isAdmin && newUserId) body.userId = newUserId;
      const res = await fetch("/api/admin/trainer-referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) { setNewLabel(""); setNewUserId(""); void loadLinks(); }
    } finally {
      setCreating(false);
    }
  };

  const toggleLink = async (id: string, isActive: boolean) => {
    await fetch("/api/admin/trainer-referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !isActive }),
    });
    void loadLinks();
  };

  const deleteLink = async (id: string) => {
    if (!confirm("حذف اللينك؟")) return;
    await fetch(`/api/admin/trainer-referrals?id=${id}`, { method: "DELETE" });
    void loadLinks();
  };

  const settleAll = async (trainerUserId: string) => {
    setSettling(true);
    try {
      await fetch("/api/admin/trainer-referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", trainerUserId }),
      });
      void loadCommissions();
    } finally {
      setSettling(false);
    }
  };

  const totalEarned = links.reduce((s, l) => s + l.totalEarned, 0);
  const pending = links.reduce((s, l) => s + l.pendingCommission, 0);
  const settled = links.reduce((s, l) => s + l.settledCommission, 0);

  return (
    <div className="space-y-6">
      {/* Stats (trainer view only) */}
      {!isAdmin && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "إجمالي العمولات", value: `${totalEarned.toFixed(2)} ج.م`, color: "text-white" },
            { label: "معلق", value: `${pending.toFixed(2)} ج.م`, color: "text-yellow-300" },
            { label: "محصّل", value: `${settled.toFixed(2)} ج.م`, color: "text-emerald-300" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">{label}</div>
              <div className={`mt-2 text-2xl font-black ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-1">
        {([["links", "لينكات الإحالة"], ["commissions", "سجل العمولات"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${activeTab === key ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Links Tab */}
      {activeTab === "links" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
            <h3 className="mb-4 text-base font-black text-white">إنشاء لينك إحالة جديد</h3>
            <div className="flex flex-wrap gap-3">
              {isAdmin && (
                <select
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                >
                  <option value="">اختر مدربة</option>
                  {trainerList.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.email}</option>)}
                </select>
              )}
              <input
                placeholder="تسمية اللينك (اختياري)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-gray-500"
              />
              <button
                onClick={() => void createLink()}
                disabled={creating || (isAdmin && !newUserId)}
                className="rounded-xl bg-pink-600 px-5 py-2 text-sm font-bold text-white hover:bg-pink-500 disabled:opacity-50"
              >{creating ? "جارٍ الإنشاء..." : "+ إنشاء لينك"}</button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">جارٍ التحميل...</div>
          ) : links.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">لا توجد لينكات إحالة بعد</div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => {
                const url = `${BASE_URL}/register?trainerRef=${link.token}`;
                return (
                  <div key={link.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        {isAdmin && <div className="text-xs font-bold text-pink-300">{link.trainerName} — {link.trainerEmail}</div>}
                        <div className="text-sm font-bold text-white">{link.label ?? "لينك إحالة"}</div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400 break-all">{url}</span>
                          <CopyButton text={url} />
                        </div>
                        <div className="text-xs text-gray-500">كود: <span className="font-mono text-gray-300">{link.token}</span></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${link.isActive ? "bg-emerald-900/30 text-emerald-300" : "bg-gray-800 text-gray-500"}`}>
                          {link.isActive ? "نشط" : "معطل"}
                        </span>
                        <button onClick={() => void toggleLink(link.id, link.isActive)} className="text-xs text-yellow-400 hover:text-yellow-300">
                          {link.isActive ? "تعطيل" : "تفعيل"}
                        </button>
                        <button onClick={() => void deleteLink(link.id)} className="text-xs text-red-400 hover:text-red-300">حذف</button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 border-t border-gray-800 pt-3">
                      <div className="text-center"><div className="text-xs text-gray-500">إجمالي العمولات</div><div className="font-bold text-white">{link.totalEarned.toFixed(2)} ج.م</div></div>
                      <div className="text-center"><div className="text-xs text-gray-500">معلق</div><div className="font-bold text-yellow-300">{link.pendingCommission.toFixed(2)} ج.م</div></div>
                      <div className="text-center"><div className="text-xs text-gray-500">محصّل</div><div className="font-bold text-emerald-300">{link.settledCommission.toFixed(2)} ج.م</div></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Commissions Tab */}
      {activeTab === "commissions" && (
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={settleUserId}
                onChange={(e) => setSettleUserId(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                <option value="">اختر مدربة لتسوية عمولاتها</option>
                {trainerList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button
                onClick={() => settleUserId && void settleAll(settleUserId)}
                disabled={!settleUserId || settling}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >{settling ? "جارٍ التسوية..." : "تسوية العمولات المعلقة"}</button>
              <button onClick={() => void loadCommissions()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-300">🔄 تحديث</button>
            </div>
          )}

          {commissions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">لا توجد عمولات بعد</div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-800">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-800 bg-gray-900/60 text-right text-xs text-gray-500">
                  {isAdmin && <th className="px-4 py-3">المدربة</th>}
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الباقة</th>
                  <th className="px-4 py-3">العمولة</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">التاريخ</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-800">
                  {commissions.map((c) => (
                    <tr key={c.id} className="text-xs hover:bg-white/5">
                      {isAdmin && <td className="px-4 py-3 font-bold text-pink-300">{c.trainerName}</td>}
                      <td className="px-4 py-3 text-white">{c.customerName ?? "—"}<br /><span className="text-gray-500">{c.customerEmail}</span></td>
                      <td className="px-4 py-3 text-gray-300">{c.membershipName ?? "—"}</td>
                      <td className="px-4 py-3 font-bold text-emerald-300">{c.amount.toFixed(2)} ج.م</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${c.status === "earned" ? "bg-yellow-900/40 text-yellow-300" : "bg-emerald-900/40 text-emerald-300"}`}>
                          {c.status === "earned" ? "معلق" : "محصّل"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
