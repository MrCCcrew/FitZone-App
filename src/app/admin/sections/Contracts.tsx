"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SalesAgentRow, SalesAgentCommissionRow } from "../types";

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-pink-500 focus:outline-none";
const CARD = "rounded-2xl border border-[rgba(255,188,219,0.12)] bg-[rgba(56,18,34,0.6)] p-5";

const ROLE_LABELS: Record<string, string> = {
  admin: "أدمن",
  contracts_manager: "مدير التعاقدات",
  agent: "مندوب",
};

type AgentDetail = {
  id: string;
  name: string;
  referralCode: string;
  commissionRate: number;
  commissionType: string;
  clientDiscountType: string;
  clientDiscountValue: number;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
  referrals: Array<{
    id: string;
    user: { id: string; name: string | null; email: string | null; phone: string | null };
    convertedAt: string | null;
    totalSpent: number;
    createdAt: string;
  }>;
  commissions: Array<{ id: string; amount: number; status: string; settledAt: string | null; createdAt: string }>;
  totalEarned: number;
  pendingCommission: number;
  settledCommission: number;
};

// ── Print helper ──────────────────────────────────────────────────────────────
function PrintButton({ label = "طباعة / PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-bold text-gray-300 hover:bg-gray-700 print:hidden"
    >
      🖨️ {label}
    </button>
  );
}

// ── Agent Self Dashboard (role=agent) ─────────────────────────────────────────
function AgentDashboard() {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setData((json as { agent?: AgentDetail }).agent ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm text-[#d7aabd] p-6">جاري التحميل...</p>;
  if (!data) return <p className="text-sm text-red-400 p-6">لم يتم العثور على حساب المندوب.</p>;

  const referralUrl = `${appUrl}?agentRef=${data.referralCode}`;

  return (
    <div className="space-y-6 p-4">
      <div className="print:block">
        <style>{`@media print { .print\\:hidden { display:none!important; } body { background: white; color: black; } }`}</style>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <h2 className="text-2xl font-black text-white">لوحة تحكم المندوب — {data.name}</h2>
        <PrintButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "عدد العملاء", value: data.referrals.length },
          { label: "عملاء اشتركوا", value: data.referrals.filter((r) => r.convertedAt).length },
          { label: "إجمالي العمولات", value: `${data.totalEarned.toFixed(2)} ج.م` },
          { label: "عمولات معلقة", value: `${data.pendingCommission.toFixed(2)} ج.م` },
          { label: "عمولات محصّلة", value: `${data.settledCommission.toFixed(2)} ج.م` },
        ].map((s) => (
          <div key={s.label} className={CARD + " text-center"}>
            <p className="text-2xl font-black text-pink-300">{s.value}</p>
            <p className="text-xs text-[#d7aabd] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">رابط الإحالة الخاص بك</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-pink-300 break-all">{referralUrl}</code>
          <button
            onClick={() => { void navigator.clipboard.writeText(referralUrl); }}
            className="rounded-xl bg-pink-700 px-4 py-2 text-sm font-bold text-white hover:bg-pink-600 print:hidden"
          >
            نسخ
          </button>
        </div>
        <p className="text-xs text-gray-400">شارك هذا الرابط مع العملاء. عند اشتراكهم سيُحتسب لك عمولة تلقائياً.</p>
      </div>

      {/* Clients table */}
      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">عملائي ({data.referrals.length})</h3>
        {data.referrals.length === 0 ? (
          <p className="text-sm text-[#d7aabd]">لا يوجد عملاء بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-2 font-bold">الاسم</th>
                  <th className="pb-2 font-bold">البريد</th>
                  <th className="pb-2 font-bold">الهاتف</th>
                  <th className="pb-2 font-bold">اشترك؟</th>
                  <th className="pb-2 font-bold">المبلغ</th>
                  <th className="pb-2 font-bold">تاريخ التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-2 text-white">{r.user.name ?? "—"}</td>
                    <td className="py-2 text-gray-300">{r.user.email ?? "—"}</td>
                    <td className="py-2 text-gray-300">{r.user.phone ?? "—"}</td>
                    <td className="py-2">{r.convertedAt ? <span className="text-emerald-400">✓ نعم</span> : <span className="text-gray-500">لا</span>}</td>
                    <td className="py-2 text-pink-300">{r.totalSpent > 0 ? `${r.totalSpent} ج.م` : "—"}</td>
                    <td className="py-2 text-gray-400">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Commissions table */}
      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">عمولاتي</h3>
        {data.commissions.length === 0 ? (
          <p className="text-sm text-[#d7aabd]">لا توجد عمولات بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-2 font-bold">المبلغ</th>
                  <th className="pb-2 font-bold">الحالة</th>
                  <th className="pb-2 font-bold">تاريخ التحصيل</th>
                  <th className="pb-2 font-bold">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50">
                    <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                    <td className="py-2">
                      {c.status === "settled"
                        ? <span className="text-emerald-400 text-xs">محصّلة</span>
                        : <span className="text-yellow-400 text-xs">معلقة</span>}
                    </td>
                    <td className="py-2 text-gray-400">{c.settledAt ? new Date(c.settledAt).toLocaleDateString("ar-EG") : "—"}</td>
                    <td className="py-2 text-gray-400">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manager / Admin View ──────────────────────────────────────────────────────
export default function Contracts() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const [activeTab, setActiveTab] = useState<"agents" | "commissions">("agents");
  const [agents, setAgents] = useState<SalesAgentRow[]>([]);
  const [commissions, setCommissions] = useState<SalesAgentCommissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [commLoading, setCommLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", password: "",
    commissionRate: "", commissionType: "percentage",
    clientDiscountType: "percentage", clientDiscountValue: "", maxClientDiscount: "",
    notes: "",
  });

  // Edit form
  const [editAgent, setEditAgent] = useState<SalesAgentRow | null>(null);
  const [editForm, setEditForm] = useState({
    commissionRate: "", commissionType: "percentage",
    clientDiscountType: "percentage", clientDiscountValue: "", maxClientDiscount: "",
    isActive: true, notes: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // Selected agent detail
  const [selectedAgent, setSelectedAgent] = useState<SalesAgentRow | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Load session role
  useEffect(() => {
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: unknown) => {
        const session = d as { user?: { role?: string } };
        setUserRole(session?.user?.role ?? null);
      })
      .catch(() => null)
      .finally(() => setRoleLoaded(true));
  }, []);

  const isAdmin = userRole === "admin";

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const json = await res.json().catch(() => ({ agents: [] }));
      setAgents(Array.isArray((json as { agents?: SalesAgentRow[] }).agents) ? (json as { agents: SalesAgentRow[] }).agents : []);
    } finally { setLoading(false); }
  }, []);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const res = await fetch("/api/admin/contracts?view=commissions", { cache: "no-store" });
      const json = await res.json().catch(() => ({ commissions: [] }));
      setCommissions(Array.isArray((json as { commissions?: SalesAgentCommissionRow[] }).commissions) ? (json as { commissions: SalesAgentCommissionRow[] }).commissions : []);
    } finally { setCommLoading(false); }
  }, []);

  useEffect(() => {
    if (!roleLoaded || userRole === "agent") return;
    void loadAgents();
  }, [roleLoaded, userRole, loadAgents]);

  useEffect(() => {
    if (!roleLoaded || userRole === "agent" || activeTab !== "commissions") return;
    void loadCommissions();
  }, [roleLoaded, userRole, activeTab, loadCommissions]);

  if (!roleLoaded) return <p className="text-sm text-[#d7aabd] p-6">جاري التحميل...</p>;
  if (userRole === "agent") return <AgentDashboard />;

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setCreateError("الاسم والبريد الإلكتروني وكلمة المرور مطلوبة.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          password: form.password.trim(),
          commissionRate: form.commissionRate ? Number(form.commissionRate) : 0,
          commissionType: form.commissionType,
          clientDiscountType: form.clientDiscountType,
          clientDiscountValue: form.clientDiscountValue ? Number(form.clientDiscountValue) : 0,
          maxClientDiscount: form.maxClientDiscount ? Number(form.maxClientDiscount) : null,
          notes: form.notes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError((json as { error?: string }).error ?? "حدث خطأ."); return; }
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", password: "", commissionRate: "", commissionType: "percentage", clientDiscountType: "percentage", clientDiscountValue: "", maxClientDiscount: "", notes: "" });
      void loadAgents();
    } finally { setCreating(false); }
  };

  const openEdit = (a: SalesAgentRow) => {
    setEditAgent(a);
    setEditForm({
      commissionRate: String(a.commissionRate),
      commissionType: a.commissionType,
      clientDiscountType: a.clientDiscountType,
      clientDiscountValue: String(a.clientDiscountValue),
      maxClientDiscount: a.maxClientDiscount != null ? String(a.maxClientDiscount) : "",
      isActive: a.isActive,
      notes: a.notes ?? "",
    });
  };

  const handleEdit = async () => {
    if (!editAgent) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: editAgent.id,
          commissionRate: editForm.commissionRate ? Number(editForm.commissionRate) : undefined,
          commissionType: editForm.commissionType,
          clientDiscountType: editForm.clientDiscountType,
          clientDiscountValue: editForm.clientDiscountValue ? Number(editForm.clientDiscountValue) : undefined,
          maxClientDiscount: editForm.maxClientDiscount ? Number(editForm.maxClientDiscount) : null,
          isActive: editForm.isActive,
          notes: editForm.notes.trim() || undefined,
        }),
      });
      if (res.ok) { setEditAgent(null); void loadAgents(); }
      else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (agent: SalesAgentRow) => {
    if (!window.confirm(`هل تريد حذف المندوب "${agent.name}"؟ سيتم إلغاء صلاحياته.`)) return;
    const res = await fetch("/api/admin/contracts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: agent.id }),
    });
    if (res.ok) void loadAgents();
    else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
  };

  const settleAll = async (agentId: string) => {
    await fetch("/api/admin/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, action: "settle_commissions" }),
    });
    void loadAgents();
    void loadCommissions();
  };

  const loadAgentDetail = async (agent: SalesAgentRow) => {
    setSelectedAgent(agent);
    setDetailLoading(true);
    try {
      // Fetch agent's own view from the API
      const res = await fetch(`/api/admin/contracts?agentId=${agent.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setAgentDetail((json as { agent?: AgentDetail }).agent ?? null);
    } finally { setDetailLoading(false); }
  };

  const totalPending = agents.reduce((s, a) => s + a.pendingCommission, 0);
  const totalSettled = agents.reduce((s, a) => s + a.settledCommission, 0);

  return (
    <div className="space-y-6 p-1">
      {/* Print styles */}
      <style>{`@media print { .print-hidden { display:none!important; } body { background:white; color:black; } .print-table th, .print-table td { border: 1px solid #ccc; padding: 4px 8px; } }`}</style>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print-hidden">
        <div>
          <h2 className="text-2xl font-black text-white">التعاقدات والمناديب</h2>
          <p className="text-sm text-[#d7aabd] mt-0.5">إدارة حسابات المناديب وعمولاتهم وعملائهم</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton />
          {(isAdmin || userRole === "contracts_manager") && (
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 px-5 py-2.5 text-sm font-black text-white hover:opacity-90">
              + إضافة مندوب جديد
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "عدد المناديب", value: agents.length },
          { label: "عملاء مُحالون", value: agents.reduce((s, a) => s + a.referralsCount, 0) },
          { label: "عمولات معلقة", value: `${totalPending.toFixed(2)} ج.م` },
          { label: "عمولات محصّلة", value: `${totalSettled.toFixed(2)} ج.م` },
        ].map((s) => (
          <div key={s.label} className={CARD + " text-center"}>
            <p className="text-2xl font-black text-pink-300">{s.value}</p>
            <p className="text-xs text-[#d7aabd] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 print-hidden">
        {(["agents", "commissions"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${activeTab === tab ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
            {tab === "agents" ? "المناديب" : "العمولات"}
          </button>
        ))}
      </div>

      {/* ── Agents tab ── */}
      {activeTab === "agents" && (
        <div className={CARD + " space-y-4"} ref={printRef}>
          {loading ? (
            <p className="text-sm text-[#d7aabd]">جاري التحميل...</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-[#d7aabd]">لا يوجد مناديب حتى الآن. أضف أول مندوب!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400">
                    <th className="pb-3 font-bold">المندوب</th>
                    <th className="pb-3 font-bold">كود الإحالة</th>
                    <th className="pb-3 font-bold">العملاء</th>
                    <th className="pb-3 font-bold">اشتركوا</th>
                    <th className="pb-3 font-bold">العمولة</th>
                    <th className="pb-3 font-bold">خصم العميل</th>
                    <th className="pb-3 font-bold">معلق</th>
                    <th className="pb-3 font-bold">محصّل</th>
                    <th className="pb-3 font-bold">الحالة</th>
                    <th className="pb-3 font-bold print-hidden">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer" onClick={() => void loadAgentDetail(a)}>
                      <td className="py-3">
                        <p className="font-bold text-white">{a.name}</p>
                        <p className="text-xs text-gray-400">{a.user.email}</p>
                      </td>
                      <td className="py-3">
                        <code className="text-pink-300 text-xs bg-gray-900 px-2 py-0.5 rounded">{a.referralCode}</code>
                      </td>
                      <td className="py-3 text-center text-white">{a.referralsCount}</td>
                      <td className="py-3 text-center text-emerald-400">{a.convertedCount}</td>
                      <td className="py-3 text-center text-gray-300">
                        {a.commissionRate}{a.commissionType === "percentage" ? "%" : " ج.م"}
                      </td>
                      <td className="py-3 text-center text-gray-300">
                        {a.clientDiscountValue}{a.clientDiscountType === "percentage" ? "%" : " ج.م"}
                      </td>
                      <td className="py-3 text-center text-yellow-400">{a.pendingCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center text-emerald-400">{a.settledCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${a.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>
                          {a.isActive ? "نشط" : "موقوف"}
                        </span>
                      </td>
                      <td className="py-3 print-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => openEdit(a)} className="rounded-lg bg-gray-700 px-2 py-1 text-xs font-bold text-white hover:bg-gray-600">تعديل</button>
                          {isAdmin && a.pendingCommission > 0 && (
                            <button onClick={() => void settleAll(a.id)} className="rounded-lg bg-emerald-800 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-700">تحصيل</button>
                          )}
                          {isAdmin && (
                            <button onClick={() => void handleDelete(a)} className="rounded-lg bg-red-900/50 px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-900">حذف</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Commissions tab ── */}
      {activeTab === "commissions" && (
        <div className={CARD + " space-y-4"}>
          {commLoading ? (
            <p className="text-sm text-[#d7aabd]">جاري التحميل...</p>
          ) : commissions.length === 0 ? (
            <p className="text-sm text-[#d7aabd]">لا توجد عمولات بعد.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400">
                    <th className="pb-3 font-bold">المندوب</th>
                    <th className="pb-3 font-bold">العميل</th>
                    <th className="pb-3 font-bold">الباقة</th>
                    <th className="pb-3 font-bold">المبلغ</th>
                    <th className="pb-3 font-bold">الحالة</th>
                    <th className="pb-3 font-bold">تاريخ التحصيل</th>
                    <th className="pb-3 font-bold">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-white">{c.agentName}</td>
                      <td className="py-2">
                        <p className="text-white">{c.customerName}</p>
                        <p className="text-xs text-gray-400">{c.customerEmail}</p>
                      </td>
                      <td className="py-2 text-gray-300">{c.membershipName}</td>
                      <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                      <td className="py-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${c.status === "settled" ? "bg-emerald-900/30 text-emerald-400" : "bg-yellow-900/30 text-yellow-400"}`}>
                          {c.status === "settled" ? "محصّلة" : "معلقة"}
                        </span>
                      </td>
                      <td className="py-2 text-gray-400">{c.settledAt ? new Date(c.settledAt).toLocaleDateString("ar-EG") : "—"}</td>
                      <td className="py-2 text-gray-400">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">إضافة مندوب جديد</h3>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1">الاسم *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} placeholder="اسم المندوب" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">البريد الإلكتروني *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">الهاتف</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} placeholder="01xxxxxxxxx" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1">كلمة المرور *</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={INPUT} placeholder="6 أحرف على الأقل" />
              </div>
            </div>
            <div className="border-t border-gray-700 pt-4">
              <p className="text-xs font-bold text-pink-400 mb-3">إعدادات العمولة والخصم (يحددها الأدمن)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">نسبة عمولة المندوب</label>
                  <input type="number" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} className={INPUT} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">نوع العمولة</label>
                  <select value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value })} className={INPUT}>
                    <option value="percentage">نسبة مئوية %</option>
                    <option value="fixed">مبلغ ثابت ج.م</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">خصم العميل القادم منه</label>
                  <input type="number" value={form.clientDiscountValue} onChange={(e) => setForm({ ...form, clientDiscountValue: e.target.value })} className={INPUT} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">نوع الخصم</label>
                  <select value={form.clientDiscountType} onChange={(e) => setForm({ ...form, clientDiscountType: e.target.value })} className={INPUT}>
                    <option value="percentage">نسبة مئوية %</option>
                    <option value="fixed">مبلغ ثابت ج.م</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">حد أقصى للخصم (ج.م)</label>
                  <input type="number" value={form.maxClientDiscount} onChange={(e) => setForm({ ...form, maxClientDiscount: e.target.value })} className={INPUT} placeholder="اختياري" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} placeholder="ملاحظات اختيارية..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleCreate()} disabled={creating} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">
                {creating ? "جاري الإنشاء..." : "إنشاء الحساب"}
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setEditAgent(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">تعديل: {editAgent.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">عمولة المندوب</label>
                    <input type="number" value={editForm.commissionRate} onChange={(e) => setEditForm({ ...editForm, commissionRate: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">نوع العمولة</label>
                    <select value={editForm.commissionType} onChange={(e) => setEditForm({ ...editForm, commissionType: e.target.value })} className={INPUT}>
                      <option value="percentage">نسبة %</option>
                      <option value="fixed">ثابت ج.م</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">خصم العميل</label>
                    <input type="number" value={editForm.clientDiscountValue} onChange={(e) => setEditForm({ ...editForm, clientDiscountValue: e.target.value })} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">نوع الخصم</label>
                    <select value={editForm.clientDiscountType} onChange={(e) => setEditForm({ ...editForm, clientDiscountType: e.target.value })} className={INPUT}>
                      <option value="percentage">نسبة %</option>
                      <option value="fixed">ثابت ج.م</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">حد أقصى للخصم</label>
                    <input type="number" value={editForm.maxClientDiscount} onChange={(e) => setEditForm({ ...editForm, maxClientDiscount: e.target.value })} className={INPUT} placeholder="اختياري" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">الحالة</label>
                <select value={editForm.isActive ? "1" : "0"} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "1" })} className={INPUT}>
                  <option value="1">نشط</option>
                  <option value="0">موقوف</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleEdit()} disabled={editSaving} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">
                {editSaving ? "جاري الحفظ..." : "حفظ التعديلات"}
              </button>
              <button onClick={() => setEditAgent(null)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent Detail Drawer ── */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-4 print-hidden" onClick={() => { setSelectedAgent(null); setAgentDetail(null); }}>
          <div className="w-full max-w-lg h-full rounded-2xl border border-gray-700 bg-gray-900 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">{selectedAgent.name}</h3>
                <button onClick={() => { setSelectedAgent(null); setAgentDetail(null); }} className="text-gray-400 hover:text-white text-xl">×</button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-pink-300 text-sm bg-gray-800 px-3 py-1.5 rounded-lg">{selectedAgent.referralCode}</code>
                <button onClick={() => { const url = `${window.location.origin}?agentRef=${selectedAgent.referralCode}`; void navigator.clipboard.writeText(url); }} className="text-xs text-gray-400 hover:text-white underline">نسخ الرابط</button>
              </div>
              {detailLoading ? (
                <p className="text-sm text-[#d7aabd]">جاري التحميل...</p>
              ) : agentDetail ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "عملاء", value: agentDetail.referrals.length },
                      { label: "اشتركوا", value: agentDetail.referrals.filter((r) => r.convertedAt).length },
                      { label: "معلق", value: `${agentDetail.pendingCommission.toFixed(0)} ج.م` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl bg-gray-800 p-3 text-center">
                        <p className="font-black text-pink-300">{s.value}</p>
                        <p className="text-xs text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 mb-2">العملاء ({agentDetail.referrals.length})</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {agentDetail.referrals.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm">
                          <div>
                            <p className="text-white">{r.user.name ?? "—"}</p>
                            <p className="text-xs text-gray-400">{r.user.phone ?? r.user.email ?? "—"}</p>
                          </div>
                          <span className={r.convertedAt ? "text-emerald-400 text-xs" : "text-gray-500 text-xs"}>
                            {r.convertedAt ? "✓ مشترك" : "لم يشترك"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
