"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SalesAgentRow, SalesAgentCommissionRow, ContractsManagerRow, ManagerCommissionRow, Partner } from "../types";

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-pink-500 focus:outline-none";
const CARD = "rounded-2xl border border-[rgba(255,188,219,0.12)] bg-[rgba(56,18,34,0.6)] p-5";

// ─── Shared helpers ───────────────────────────────────────────────────────────
function PrintButton({ label = "طباعة / PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-bold text-gray-300 hover:bg-gray-700 print:hidden">
      🖨️ {label}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "settled"
    ? <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-900/30 text-emerald-400">محصّلة</span>
    : <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-900/30 text-yellow-400">معلقة</span>;
}

function ReferralLink({ code }: { code: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}?agentRef=${code}` : `?agentRef=${code}`;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <code className="flex-1 min-w-0 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-pink-300 break-all">{url}</code>
      <button onClick={() => void navigator.clipboard.writeText(url)} className="shrink-0 rounded-lg bg-pink-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-pink-600">نسخ</button>
    </div>
  );
}

type AgentDetail = {
  id: string; name: string; referralCode: string;
  commissionRate: number; commissionType: string;
  clientDiscountType: string; clientDiscountValue: number;
  managerId: string | null; managerName: string | null;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
  referrals: { id: string; user: { id: string; name: string | null; email: string | null; phone: string | null }; convertedAt: string | null; totalSpent: number; createdAt: string }[];
  commissions: { id: string; amount: number; status: string; settledAt: string | null; createdAt: string }[];
  totalEarned: number; pendingCommission: number; settledCommission: number;
};

// ─── Agent Self Dashboard ─────────────────────────────────────────────────────
function AgentDashboard() {
  const [data, setData] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setData((json as { agent?: AgentDetail }).agent ?? null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="text-sm text-[#d7aabd] p-6">جاري التحميل...</p>;
  if (!data) return <p className="text-sm text-red-400 p-6">لم يتم العثور على حساب المندوب.</p>;

  return (
    <div className="space-y-6 p-4">
      <style>{`@media print { .print-hidden { display:none!important; } body { background:white; color:black; } }`}</style>
      <div className="flex items-center justify-between flex-wrap gap-3 print-hidden">
        <h2 className="text-2xl font-black text-white">لوحة المندوب — {data.name}</h2>
        <PrintButton />
      </div>
      {data.managerName && <p className="text-sm text-gray-400">مديرك: <span className="text-pink-300 font-bold">{data.managerName}</span></p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "عدد العملاء", value: data.referrals.length },
          { label: "اشتركوا", value: data.referrals.filter((r) => r.convertedAt).length },
          { label: "إجمالي العمولات", value: `${data.totalEarned.toFixed(2)} ج.م` },
          { label: "معلقة", value: `${data.pendingCommission.toFixed(2)} ج.م` },
          { label: "محصّلة", value: `${data.settledCommission.toFixed(2)} ج.م` },
        ].map((s) => (
          <div key={s.label} className={CARD + " text-center"}>
            <p className="text-2xl font-black text-pink-300">{s.value}</p>
            <p className="text-xs text-[#d7aabd] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">رابط الإحالة الخاص بك</h3>
        <ReferralLink code={data.referralCode} />
        <p className="text-xs text-gray-400">شارك هذا الرابط — سيُحتسب لك عمولة تلقائياً عند اشتراك أي عميل.</p>
      </div>

      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">عملائي ({data.referrals.length})</h3>
        {data.referrals.length === 0 ? <p className="text-sm text-[#d7aabd]">لا يوجد عملاء بعد.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                <th className="pb-2 font-bold">الاسم</th><th className="pb-2 font-bold">الهاتف</th>
                <th className="pb-2 font-bold">اشترك؟</th><th className="pb-2 font-bold">المبلغ</th>
                <th className="pb-2 font-bold">التاريخ</th>
              </tr></thead>
              <tbody>
                {data.referrals.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-2"><p className="text-white">{r.user.name ?? "—"}</p><p className="text-xs text-gray-400">{r.user.email ?? ""}</p></td>
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

      <div className={CARD + " space-y-3"}>
        <h3 className="text-base font-black text-white">عمولاتي</h3>
        {data.commissions.length === 0 ? <p className="text-sm text-[#d7aabd]">لا توجد عمولات بعد.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                <th className="pb-2 font-bold">المبلغ</th><th className="pb-2 font-bold">الحالة</th>
                <th className="pb-2 font-bold">تاريخ التحصيل</th><th className="pb-2 font-bold">التاريخ</th>
              </tr></thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50">
                    <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                    <td className="py-2"><StatusBadge status={c.status} /></td>
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

// ─── Manager Self Dashboard ───────────────────────────────────────────────────
type ManagerSelfData = {
  id: string; name: string; commissionType: string; commissionRate: number;
  user: { name: string | null; email: string | null };
  pendingCommission: number; settledCommission: number; totalEarned: number;
  agents: SalesAgentRow[];
};

function ManagerDashboard() {
  const [data, setData] = useState<ManagerSelfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentComms, setAgentComms] = useState<SalesAgentCommissionRow[]>([]);
  const [mgrComms, setMgrComms] = useState<ManagerCommissionRow[]>([]);
  const [tab, setTab] = useState<"agents" | "agent_comms" | "my_comms" | "partners">("agents");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", notes: "" });
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [showCreatePartner, setShowCreatePartner] = useState(false);
  const [creatingPartner, setCreatingPartner] = useState(false);
  const [partnerError, setPartnerError] = useState("");
  const [partnerForm, setPartnerForm] = useState({ name: "", email: "", phone: "", password: "", category: "", commissionRate: "10", commissionType: "percentage", managerCommissionType: "percentage_of_partner", managerCommissionRate: "10", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setData((json as { manager?: ManagerSelfData }).manager ?? null);
    } finally { setLoading(false); }
  }, []);

  const loadAgentComms = useCallback(async () => {
    const res = await fetch("/api/admin/contracts?view=commissions", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setAgentComms(Array.isArray((json as { commissions?: SalesAgentCommissionRow[] }).commissions) ? (json as { commissions: SalesAgentCommissionRow[] }).commissions : []);
  }, []);

  const loadMgrComms = useCallback(async () => {
    const res = await fetch("/api/admin/contracts?view=manager_commissions", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setMgrComms(Array.isArray((json as { managerCommissions?: ManagerCommissionRow[] }).managerCommissions) ? (json as { managerCommissions: ManagerCommissionRow[] }).managerCommissions : []);
  }, []);

  const loadPartners = useCallback(async () => {
    const res = await fetch("/api/admin/contracts?view=partners", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setPartners(Array.isArray((json as { partners?: Partner[] }).partners) ? (json as { partners: Partner[] }).partners : []);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (tab === "agent_comms") void loadAgentComms();
    if (tab === "my_comms") void loadMgrComms();
    if (tab === "partners") void loadPartners();
  }, [tab, loadAgentComms, loadMgrComms, loadPartners]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setCreateError("الاسم والبريد وكلمة المرور مطلوبة."); return; }
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined, password: form.password.trim(), notes: form.notes.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError((json as { error?: string }).error ?? "حدث خطأ."); return; }
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", password: "", notes: "" });
      void load();
    } finally { setCreating(false); }
  };

  const openDetail = async (agent: SalesAgentRow) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/contracts?agentId=${agent.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setSelectedAgent((json as { agent?: AgentDetail }).agent ?? null);
    } finally { setDetailLoading(false); }
  };

  if (loading) return <p className="text-sm text-[#d7aabd] p-6">جاري التحميل...</p>;
  if (!data) return <p className="text-sm text-red-400 p-6">لم يتم العثور على حساب المدير.</p>;

  const commTypeLabel: Record<string, string> = {
    percentage_of_agents: "% من عمولة المندوبين", percentage_of_revenue: "% من قيمة الاشتراك", fixed: "مبلغ ثابت لكل اشتراك",
  };

  return (
    <div className="space-y-6 p-4">
      <style>{`@media print { .print-hidden { display:none!important; } body { background:white; color:black; } }`}</style>

      <div className="flex items-center justify-between flex-wrap gap-3 print-hidden">
        <div>
          <h2 className="text-2xl font-black text-white">لوحة مدير التعاقدات — {data.name}</h2>
          <p className="text-sm text-gray-400 mt-0.5">نوع عمولتك: <span className="text-pink-300 font-bold">{commTypeLabel[data.commissionType] ?? data.commissionType}</span> ({data.commissionRate}{data.commissionType === "fixed" ? " ج.م" : "%"})</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton />
          <button onClick={() => setShowCreate(true)} className="rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 px-5 py-2.5 text-sm font-black text-white hover:opacity-90">+ إضافة مندوب</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "عدد مناديبي", value: data.agents.length },
          { label: "عملاء أُحيلوا", value: data.agents.reduce((s, a) => s + a.referralsCount, 0) },
          { label: "عمولتي المعلقة", value: `${data.pendingCommission.toFixed(2)} ج.م` },
          { label: "عمولتي المحصّلة", value: `${data.settledCommission.toFixed(2)} ج.م` },
        ].map((s) => (
          <div key={s.label} className={CARD + " text-center"}>
            <p className="text-2xl font-black text-pink-300">{s.value}</p>
            <p className="text-xs text-[#d7aabd] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 print-hidden flex-wrap">
        {([["agents", "مناديبي"], ["agent_comms", "عمولات مناديبي"], ["my_comms", "عمولاتي"], ["partners", "الشركاء"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === key ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>{label}</button>
        ))}
      </div>

      {/* Agents tab */}
      {tab === "agents" && (
        <div className={CARD + " space-y-4"}>
          {data.agents.length === 0 ? <p className="text-sm text-[#d7aabd]">لا يوجد مناديب بعد. أضف أول مندوب!</p> : (
            <div className="space-y-4">
              {data.agents.map((a) => (
                <div key={a.id} className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-black text-white">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.user.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs rounded-full px-2 py-0.5 ${a.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{a.isActive ? "نشط" : "موقوف"}</span>
                      <code className="text-pink-300 text-xs bg-gray-900 px-2 py-0.5 rounded">{a.referralCode}</code>
                      <button onClick={() => void openDetail(a)} className="rounded-lg bg-gray-700 px-2 py-1 text-xs font-bold text-white hover:bg-gray-600">تفاصيل</button>
                    </div>
                  </div>
                  <ReferralLink code={a.referralCode} />
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-gray-900 py-1.5"><p className="font-bold text-white">{a.referralsCount}</p><p className="text-gray-400">عملاء</p></div>
                    <div className="rounded-lg bg-gray-900 py-1.5"><p className="font-bold text-yellow-400">{a.pendingCommission.toFixed(0)} ج.م</p><p className="text-gray-400">معلق</p></div>
                    <div className="rounded-lg bg-gray-900 py-1.5"><p className="font-bold text-emerald-400">{a.settledCommission.toFixed(0)} ج.م</p><p className="text-gray-400">محصّل</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent commissions tab */}
      {tab === "agent_comms" && (
        <div className={CARD + " space-y-4"}>
          {agentComms.length === 0 ? <p className="text-sm text-[#d7aabd]">لا توجد عمولات بعد.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-2 font-bold">المندوب</th><th className="pb-2 font-bold">العميل</th>
                  <th className="pb-2 font-bold">الباقة</th><th className="pb-2 font-bold">العمولة</th>
                  <th className="pb-2 font-bold">الحالة</th><th className="pb-2 font-bold">التاريخ</th>
                </tr></thead>
                <tbody>
                  {agentComms.map((c) => (
                    <tr key={c.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-white">{c.agentName}</td>
                      <td className="py-2"><p className="text-white">{c.customerName}</p><p className="text-xs text-gray-400">{c.customerEmail}</p></td>
                      <td className="py-2 text-gray-300">{c.membershipName}</td>
                      <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
                      <td className="py-2 text-gray-400">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* My commissions tab */}
      {tab === "my_comms" && (
        <div className={CARD + " space-y-4"}>
          {mgrComms.length === 0 ? <p className="text-sm text-[#d7aabd]">لا توجد عمولات بعد.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-2 font-bold">المندوب</th><th className="pb-2 font-bold">العميل</th>
                  <th className="pb-2 font-bold">الباقة</th><th className="pb-2 font-bold">عمولتي</th>
                  <th className="pb-2 font-bold">الحالة</th><th className="pb-2 font-bold">تاريخ التحصيل</th>
                </tr></thead>
                <tbody>
                  {mgrComms.map((c) => (
                    <tr key={c.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-white">{c.agentName ?? "—"}</td>
                      <td className="py-2 text-gray-300">{c.customerName ?? "—"}</td>
                      <td className="py-2 text-gray-300">{c.membershipName ?? "—"}</td>
                      <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
                      <td className="py-2 text-gray-400">{c.settledAt ? new Date(c.settledAt).toLocaleDateString("ar-EG") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Partners tab */}
      {tab === "partners" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-white">الشركاء تحت إشرافي</h3>
            <button onClick={() => setShowCreatePartner(true)} className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-500">+ إضافة شريك</button>
          </div>
          {partners.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">لا يوجد شركاء بعد.</div>
          ) : (
            <div className="space-y-3">
              {partners.map((p) => (
                <div key={p.id} className={CARD + " space-y-2"}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-black text-white">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.linkedUser?.email} · {p.category}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.isActive ? "bg-emerald-900/40 text-emerald-300" : "bg-gray-800 text-gray-500"}`}>
                      {p.isActive ? "نشط" : "معطل"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-gray-700 pt-2">
                    <div><span className="text-gray-400">عمولة الشريك: </span><span className="font-bold text-white">{p.commissionRate}{p.commissionType === "percentage" ? "%" : " ج.م"}</span></div>
                    <div><span className="text-gray-400">عمولتي: </span><span className="font-bold text-pink-300">{p.managerCommissionRate ?? 0}{p.managerCommissionType === "percentage_of_partner" ? "% من عمولته" : " ج.م ثابت"}</span></div>
                    <div><span className="text-gray-400">معلق: </span><span className="font-bold text-yellow-300">{p.totalCommissionPending.toFixed(2)} ج.م</span></div>
                    <div><span className="text-gray-400">محصّل: </span><span className="font-bold text-emerald-300">{p.totalCommissionPaid.toFixed(2)} ج.م</span></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <ReferralLink label="لينك شريك" token={`partner-${p.id}`} baseUrl={`/register?ref=`} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create partner modal */}
      {showCreatePartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setShowCreatePartner(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">إضافة شريك جديد</h3>
            {partnerError && <p className="text-sm text-red-400">{partnerError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">الاسم *</label><input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">البريد *</label><input type="email" value={partnerForm.email} onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الهاتف</label><input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} className={INPUT} /></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">الفئة *</label><input value={partnerForm.category} onChange={(e) => setPartnerForm({ ...partnerForm, category: e.target.value })} className={INPUT} placeholder="مثال: جيم، مطعم، صيدلية" /></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">كلمة المرور</label><input type="password" value={partnerForm.password} onChange={(e) => setPartnerForm({ ...partnerForm, password: e.target.value })} className={INPUT} placeholder="اتركه فارغاً للافتراضي" /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">عمولة الشريك</label><input type="number" value={partnerForm.commissionRate} onChange={(e) => setPartnerForm({ ...partnerForm, commissionRate: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع عمولته</label>
                <select value={partnerForm.commissionType} onChange={(e) => setPartnerForm({ ...partnerForm, commissionType: e.target.value })} className={INPUT}>
                  <option value="percentage">نسبة %</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">عمولتي</label><input type="number" value={partnerForm.managerCommissionRate} onChange={(e) => setPartnerForm({ ...partnerForm, managerCommissionRate: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع عمولتي</label>
                <select value={partnerForm.managerCommissionType} onChange={(e) => setPartnerForm({ ...partnerForm, managerCommissionType: e.target.value })} className={INPUT}>
                  <option value="percentage_of_partner">% من عمولة الشريك</option>
                  <option value="fixed">مبلغ ثابت لكل اشتراك</option>
                </select>
              </div>
            </div>
            <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={partnerForm.notes} onChange={(e) => setPartnerForm({ ...partnerForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!partnerForm.name.trim() || !partnerForm.email.trim() || !partnerForm.category.trim()) { setPartnerError("الاسم والبريد والفئة مطلوبة."); return; }
                  setCreatingPartner(true); setPartnerError("");
                  try {
                    const res = await fetch("/api/admin/contracts", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "partner", name: partnerForm.name.trim(), email: partnerForm.email.trim(), phone: partnerForm.phone.trim() || undefined, password: partnerForm.password.trim() || undefined, category: partnerForm.category.trim(), commissionRate: Number(partnerForm.commissionRate), commissionType: partnerForm.commissionType, managerCommissionType: partnerForm.managerCommissionType, managerCommissionRate: Number(partnerForm.managerCommissionRate), notes: partnerForm.notes.trim() || undefined }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) { setPartnerError((json as { error?: string }).error ?? "حدث خطأ."); return; }
                    setShowCreatePartner(false);
                    setPartnerForm({ name: "", email: "", phone: "", password: "", category: "", commissionRate: "10", commissionType: "percentage", managerCommissionType: "percentage_of_partner", managerCommissionRate: "10", notes: "" });
                    void loadPartners();
                  } finally { setCreatingPartner(false); }
                }}
                disabled={creatingPartner}
                className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50"
              >{creatingPartner ? "جاري الإنشاء..." : "إنشاء حساب الشريك"}</button>
              <button onClick={() => setShowCreatePartner(false)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Create agent modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">إضافة مندوب جديد</h3>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">الاسم *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} placeholder="اسم المندوب" /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">البريد *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} /></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">كلمة المرور *</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={INPUT} placeholder="6 أحرف على الأقل" /></div>
            </div>
            <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            <p className="text-xs text-gray-500">العمولة والخصومات يحددها الأدمن لاحقاً.</p>
            <div className="flex gap-2">
              <button onClick={() => void handleCreate()} disabled={creating} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">{creating ? "جاري الإنشاء..." : "إنشاء الحساب"}</button>
              <button onClick={() => setShowCreate(false)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Agent detail drawer */}
      {(selectedAgent || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-4 print-hidden" onClick={() => setSelectedAgent(null)}>
          <div className="w-full max-w-lg h-full rounded-2xl border border-gray-700 bg-gray-900 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">{selectedAgent?.name ?? "جاري التحميل..."}</h3>
                <button onClick={() => setSelectedAgent(null)} className="text-gray-400 hover:text-white text-xl">×</button>
              </div>
              {detailLoading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : selectedAgent ? (
                <>
                  <ReferralLink code={selectedAgent.referralCode} />
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "عملاء", value: selectedAgent.referrals.length },
                      { label: "اشتركوا", value: selectedAgent.referrals.filter((r) => r.convertedAt).length },
                      { label: "معلق", value: `${selectedAgent.pendingCommission.toFixed(0)} ج.م` },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl bg-gray-800 p-3 text-center">
                        <p className="font-black text-pink-300">{s.value}</p>
                        <p className="text-xs text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-gray-400">العملاء ({selectedAgent.referrals.length})</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {selectedAgent.referrals.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm">
                        <div><p className="text-white">{r.user.name ?? "—"}</p><p className="text-xs text-gray-400">{r.user.phone ?? r.user.email ?? "—"}</p></div>
                        <span className={r.convertedAt ? "text-emerald-400 text-xs" : "text-gray-500 text-xs"}>{r.convertedAt ? "✓ مشترك" : "لم يشترك"}</span>
                      </div>
                    ))}
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

// ─── Admin View ───────────────────────────────────────────────────────────────
export default function Contracts() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  const [tab, setTab] = useState<"managers" | "agents" | "commissions" | "manager_commissions">("managers");
  const [managers, setManagers] = useState<ContractsManagerRow[]>([]);
  const [agents, setAgents] = useState<SalesAgentRow[]>([]);
  const [commissions, setCommissions] = useState<SalesAgentCommissionRow[]>([]);
  const [managerComms, setManagerComms] = useState<ManagerCommissionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [showCreateMgr, setShowCreateMgr] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const EMPTY_MGR_FORM = { name: "", email: "", phone: "", password: "", commissionType: "percentage_of_agents", commissionRate: "", notes: "" };
  const EMPTY_AGENT_FORM = { name: "", email: "", phone: "", password: "", commissionRate: "", commissionType: "percentage", clientDiscountType: "percentage", clientDiscountValue: "", maxClientDiscount: "", managerId: "", notes: "" };
  const [mgrForm, setMgrForm] = useState(EMPTY_MGR_FORM);
  const [agentForm, setAgentForm] = useState(EMPTY_AGENT_FORM);

  const [editAgent, setEditAgent] = useState<SalesAgentRow | null>(null);
  const [editMgr, setEditMgr] = useState<ContractsManagerRow | null>(null);
  const [editAgentForm, setEditAgentForm] = useState({ commissionRate: "", commissionType: "percentage", clientDiscountType: "percentage", clientDiscountValue: "", maxClientDiscount: "", isActive: true, notes: "" });
  const [editMgrForm, setEditMgrForm] = useState({ commissionType: "percentage_of_agents", commissionRate: "", isActive: true, notes: "" });
  const [editSaving, setEditSaving] = useState(false);

  const [selectedAgent, setSelectedAgent] = useState<SalesAgentRow | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMgr, setSelectedMgr] = useState<ContractsManagerRow | null>(null);
  const [mgrDetail, setMgrDetail] = useState<{ agents: SalesAgentRow[]; pendingCommission: number; settledCommission: number } | null>(null);
  const [mgrDetailLoading, setMgrDetailLoading] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: unknown) => { setUserRole((d as { user?: { role?: string } })?.user?.role ?? null); })
      .catch(() => null)
      .finally(() => setRoleLoaded(true));
  }, []);

  const loadManagers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts?view=managers", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setManagers(Array.isArray((json as { managers?: ContractsManagerRow[] }).managers) ? (json as { managers: ContractsManagerRow[] }).managers : []);
    } finally { setLoading(false); }
  }, []);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setAgents(Array.isArray((json as { agents?: SalesAgentRow[] }).agents) ? (json as { agents: SalesAgentRow[] }).agents : []);
    } finally { setLoading(false); }
  }, []);

  const loadComms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts?view=commissions", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setCommissions(Array.isArray((json as { commissions?: SalesAgentCommissionRow[] }).commissions) ? (json as { commissions: SalesAgentCommissionRow[] }).commissions : []);
    } finally { setLoading(false); }
  }, []);

  const loadMgrComms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/contracts?view=manager_commissions", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setManagerComms(Array.isArray((json as { managerCommissions?: ManagerCommissionRow[] }).managerCommissions) ? (json as { managerCommissions: ManagerCommissionRow[] }).managerCommissions : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!roleLoaded || !userRole || userRole === "agent" || userRole === "contracts_manager") return;
    if (tab === "managers") void loadManagers();
    else if (tab === "agents") void loadAgents();
    else if (tab === "commissions") void loadComms();
    else if (tab === "manager_commissions") void loadMgrComms();
  }, [roleLoaded, userRole, tab, loadManagers, loadAgents, loadComms, loadMgrComms]);

  if (!roleLoaded) return <p className="text-sm text-[#d7aabd] p-6">جاري التحميل...</p>;
  if (userRole === "agent") return <AgentDashboard />;
  if (userRole === "contracts_manager") return <ManagerDashboard />;

  // ── Admin actions ──
  const handleCreateMgr = async () => {
    if (!mgrForm.name.trim() || !mgrForm.email.trim() || !mgrForm.password.trim()) { setCreateError("الاسم والبريد وكلمة المرور مطلوبة."); return; }
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "manager", name: mgrForm.name.trim(), email: mgrForm.email.trim(), phone: mgrForm.phone.trim() || undefined, password: mgrForm.password.trim(), commissionType: mgrForm.commissionType, commissionRate: mgrForm.commissionRate ? Number(mgrForm.commissionRate) : 0, notes: mgrForm.notes.trim() || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError((json as { error?: string }).error ?? "حدث خطأ."); return; }
      setShowCreateMgr(false); setMgrForm(EMPTY_MGR_FORM); void loadManagers();
    } finally { setCreating(false); }
  };

  const handleCreateAgent = async () => {
    if (!agentForm.name.trim() || !agentForm.email.trim() || !agentForm.password.trim()) { setCreateError("الاسم والبريد وكلمة المرور مطلوبة."); return; }
    setCreating(true); setCreateError("");
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentForm.name.trim(), email: agentForm.email.trim(), phone: agentForm.phone.trim() || undefined,
          password: agentForm.password.trim(), commissionRate: agentForm.commissionRate ? Number(agentForm.commissionRate) : 0,
          commissionType: agentForm.commissionType, clientDiscountType: agentForm.clientDiscountType,
          clientDiscountValue: agentForm.clientDiscountValue ? Number(agentForm.clientDiscountValue) : 0,
          maxClientDiscount: agentForm.maxClientDiscount ? Number(agentForm.maxClientDiscount) : null,
          managerId: agentForm.managerId || undefined, notes: agentForm.notes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError((json as { error?: string }).error ?? "حدث خطأ."); return; }
      setShowCreateAgent(false); setAgentForm(EMPTY_AGENT_FORM); void loadAgents();
    } finally { setCreating(false); }
  };

  const openEditAgent = (a: SalesAgentRow) => {
    setEditAgent(a);
    setEditAgentForm({ commissionRate: String(a.commissionRate), commissionType: a.commissionType, clientDiscountType: a.clientDiscountType, clientDiscountValue: String(a.clientDiscountValue), maxClientDiscount: a.maxClientDiscount != null ? String(a.maxClientDiscount) : "", isActive: a.isActive, notes: a.notes ?? "" });
  };
  const openEditMgr = (m: ContractsManagerRow) => {
    setEditMgr(m);
    setEditMgrForm({ commissionType: m.commissionType, commissionRate: String(m.commissionRate), isActive: m.isActive, notes: m.notes ?? "" });
  };

  const handleEditAgent = async () => {
    if (!editAgent) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: editAgent.id, commissionRate: editAgentForm.commissionRate ? Number(editAgentForm.commissionRate) : undefined, commissionType: editAgentForm.commissionType, clientDiscountType: editAgentForm.clientDiscountType, clientDiscountValue: editAgentForm.clientDiscountValue ? Number(editAgentForm.clientDiscountValue) : undefined, maxClientDiscount: editAgentForm.maxClientDiscount ? Number(editAgentForm.maxClientDiscount) : null, isActive: editAgentForm.isActive, notes: editAgentForm.notes.trim() || undefined }),
      });
      if (res.ok) { setEditAgent(null); void loadAgents(); }
      else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setEditSaving(false); }
  };

  const handleEditMgr = async () => {
    if (!editMgr) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/contracts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: editMgr.id, commissionType: editMgrForm.commissionType, commissionRate: editMgrForm.commissionRate ? Number(editMgrForm.commissionRate) : undefined, isActive: editMgrForm.isActive, notes: editMgrForm.notes.trim() || undefined }),
      });
      if (res.ok) { setEditMgr(null); void loadManagers(); }
      else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setEditSaving(false); }
  };

  const settleAgentComm = async (agentId: string) => {
    await fetch("/api/admin/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, action: "settle_commissions" }) });
    void loadAgents(); void loadComms();
  };

  const settleMgrComm = async (managerId: string) => {
    await fetch("/api/admin/contracts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settle_manager_commissions", managerId }) });
    void loadManagers(); void loadMgrComms();
  };

  const deleteAgent = async (a: SalesAgentRow) => {
    if (!window.confirm(`حذف المندوب "${a.name}"؟`)) return;
    const res = await fetch("/api/admin/contracts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: a.id }) });
    if (res.ok) void loadAgents();
  };

  const deleteMgr = async (m: ContractsManagerRow) => {
    if (!window.confirm(`حذف المدير "${m.name}"؟ ستُحذف صلاحياته وتُبقى بيانات مناديبه.`)) return;
    const res = await fetch("/api/admin/contracts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ managerId: m.id }) });
    if (res.ok) void loadManagers();
  };

  const openAgentDetail = async (a: SalesAgentRow) => {
    setSelectedAgent(a); setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/contracts?agentId=${a.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      setAgentDetail((json as { agent?: AgentDetail }).agent ?? null);
    } finally { setDetailLoading(false); }
  };

  const openMgrDetail = async (m: ContractsManagerRow) => {
    setSelectedMgr(m); setMgrDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/contracts?managerId=${m.id}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const d = (json as { manager?: { agents: SalesAgentRow[]; pendingCommission: number; settledCommission: number } }).manager;
      setMgrDetail(d ?? null);
    } finally { setMgrDetailLoading(false); }
  };

  const commTypeLabel: Record<string, string> = { percentage_of_agents: "% من عمولة مناديبه", percentage_of_revenue: "% من إيراد الاشتراكات", fixed: "مبلغ ثابت / اشتراك" };

  const totalPendingAgents = agents.reduce((s, a) => s + a.pendingCommission, 0);
  const totalPendingMgrs = managers.reduce((s, m) => s + m.pendingCommission, 0);

  return (
    <div className="space-y-6 p-1">
      <style>{`@media print { .print-hidden { display:none!important; } body { background:white; color:black; } .print-table th, .print-table td { border: 1px solid #ccc; padding: 4px 8px; } }`}</style>

      <div className="flex items-center justify-between flex-wrap gap-3 print-hidden">
        <div>
          <h2 className="text-2xl font-black text-white">التعاقدات والمناديب</h2>
          <p className="text-sm text-[#d7aabd] mt-0.5">إدارة مديري التعاقدات والمناديب وعمولاتهم</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PrintButton />
          <button onClick={() => { setShowCreateAgent(true); setCreateError(""); }} className="rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-600">+ مندوب جديد</button>
          <button onClick={() => { setShowCreateMgr(true); setCreateError(""); }} className="rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 px-5 py-2.5 text-sm font-black text-white hover:opacity-90">+ مدير تعاقدات</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "مديري التعاقدات", value: managers.length },
          { label: "عدد المناديب", value: agents.length },
          { label: "عمولات مناديب معلقة", value: `${totalPendingAgents.toFixed(0)} ج.م` },
          { label: "عمولات مديرين معلقة", value: `${totalPendingMgrs.toFixed(0)} ج.م` },
        ].map((s) => (
          <div key={s.label} className={CARD + " text-center"}>
            <p className="text-2xl font-black text-pink-300">{s.value}</p>
            <p className="text-xs text-[#d7aabd] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 print-hidden flex-wrap">
        {([["managers", "المديرون"], ["agents", "المناديب"], ["commissions", "عمولات المناديب"], ["manager_commissions", "عمولات المديرين"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === key ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>{label}</button>
        ))}
      </div>

      {/* ── Managers tab ── */}
      {tab === "managers" && (
        <div className={CARD + " space-y-4"} ref={printRef}>
          {loading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : managers.length === 0 ? <p className="text-sm text-[#d7aabd]">لا يوجد مديرو تعاقدات. أضف أول مدير!</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-3 font-bold">المدير</th><th className="pb-3 font-bold">نوع عمولته</th>
                  <th className="pb-3 font-bold">النسبة</th><th className="pb-3 font-bold">المناديب</th>
                  <th className="pb-3 font-bold">معلق</th><th className="pb-3 font-bold">محصّل</th>
                  <th className="pb-3 font-bold">الحالة</th><th className="pb-3 font-bold print-hidden">إجراءات</th>
                </tr></thead>
                <tbody>
                  {managers.map((m) => (
                    <tr key={m.id} className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer" onClick={() => void openMgrDetail(m)}>
                      <td className="py-3"><p className="font-bold text-white">{m.name}</p><p className="text-xs text-gray-400">{m.user.email}</p></td>
                      <td className="py-3 text-gray-300 text-xs">{commTypeLabel[m.commissionType] ?? m.commissionType}</td>
                      <td className="py-3 text-center text-gray-300">{m.commissionRate}{m.commissionType === "fixed" ? " ج.م" : "%"}</td>
                      <td className="py-3 text-center text-white">{m.agentsCount}</td>
                      <td className="py-3 text-center text-yellow-400">{m.pendingCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center text-emerald-400">{m.settledCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center"><span className={`text-xs rounded-full px-2 py-0.5 ${m.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{m.isActive ? "نشط" : "موقوف"}</span></td>
                      <td className="py-3 print-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => openEditMgr(m)} className="rounded-lg bg-gray-700 px-2 py-1 text-xs font-bold text-white hover:bg-gray-600">تعديل</button>
                          {m.pendingCommission > 0 && <button onClick={() => void settleMgrComm(m.id)} className="rounded-lg bg-emerald-800 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-700">تحصيل</button>}
                          <button onClick={() => void deleteMgr(m)} className="rounded-lg bg-red-900/50 px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-900">حذف</button>
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

      {/* ── Agents tab ── */}
      {tab === "agents" && (
        <div className={CARD + " space-y-4"}>
          {loading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : agents.length === 0 ? <p className="text-sm text-[#d7aabd]">لا يوجد مناديب.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-3 font-bold">المندوب</th><th className="pb-3 font-bold">المدير</th>
                  <th className="pb-3 font-bold">الكود</th><th className="pb-3 font-bold">العملاء</th>
                  <th className="pb-3 font-bold">اشتركوا</th><th className="pb-3 font-bold">عمولته</th>
                  <th className="pb-3 font-bold">خصم العميل</th><th className="pb-3 font-bold">معلق</th>
                  <th className="pb-3 font-bold">محصّل</th><th className="pb-3 font-bold">الحالة</th>
                  <th className="pb-3 font-bold print-hidden">إجراءات</th>
                </tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-b border-gray-800/50 hover:bg-white/5 cursor-pointer" onClick={() => void openAgentDetail(a)}>
                      <td className="py-3"><p className="font-bold text-white">{a.name}</p><p className="text-xs text-gray-400">{a.user.email}</p></td>
                      <td className="py-3 text-xs text-gray-400">{a.managerName ?? "—"}</td>
                      <td className="py-3"><code className="text-pink-300 text-xs bg-gray-900 px-2 py-0.5 rounded">{a.referralCode}</code></td>
                      <td className="py-3 text-center text-white">{a.referralsCount}</td>
                      <td className="py-3 text-center text-emerald-400">{a.convertedCount}</td>
                      <td className="py-3 text-center text-gray-300">{a.commissionRate}{a.commissionType === "percentage" ? "%" : " ج.م"}</td>
                      <td className="py-3 text-center text-gray-300">{a.clientDiscountValue}{a.clientDiscountType === "percentage" ? "%" : " ج.م"}</td>
                      <td className="py-3 text-center text-yellow-400">{a.pendingCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center text-emerald-400">{a.settledCommission.toFixed(0)} ج.م</td>
                      <td className="py-3 text-center"><span className={`text-xs rounded-full px-2 py-0.5 ${a.isActive ? "bg-emerald-900/30 text-emerald-400" : "bg-red-900/30 text-red-400"}`}>{a.isActive ? "نشط" : "موقوف"}</span></td>
                      <td className="py-3 print-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap">
                          <button onClick={() => openEditAgent(a)} className="rounded-lg bg-gray-700 px-2 py-1 text-xs font-bold text-white hover:bg-gray-600">تعديل</button>
                          {a.pendingCommission > 0 && <button onClick={() => void settleAgentComm(a.id)} className="rounded-lg bg-emerald-800 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-700">تحصيل</button>}
                          <button onClick={() => void deleteAgent(a)} className="rounded-lg bg-red-900/50 px-2 py-1 text-xs font-bold text-red-400 hover:bg-red-900">حذف</button>
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

      {/* ── Agent commissions tab ── */}
      {tab === "commissions" && (
        <div className={CARD + " space-y-4"}>
          {loading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : commissions.length === 0 ? <p className="text-sm text-[#d7aabd]">لا توجد عمولات.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-3 font-bold">المندوب</th><th className="pb-3 font-bold">العميل</th>
                  <th className="pb-3 font-bold">الباقة</th><th className="pb-3 font-bold">المبلغ</th>
                  <th className="pb-3 font-bold">الحالة</th><th className="pb-3 font-bold">تاريخ التحصيل</th>
                  <th className="pb-3 font-bold">التاريخ</th>
                </tr></thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-gray-800/50">
                      <td className="py-2 text-white">{c.agentName}</td>
                      <td className="py-2"><p className="text-white">{c.customerName}</p><p className="text-xs text-gray-400">{c.customerEmail}</p></td>
                      <td className="py-2 text-gray-300">{c.membershipName}</td>
                      <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
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

      {/* ── Manager commissions tab ── */}
      {tab === "manager_commissions" && (
        <div className={CARD + " space-y-4"}>
          {loading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : managerComms.length === 0 ? <p className="text-sm text-[#d7aabd]">لا توجد عمولات مديرين.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right print-table">
                <thead><tr className="border-b border-gray-700 text-xs text-gray-400">
                  <th className="pb-3 font-bold">المدير</th><th className="pb-3 font-bold">المندوب</th>
                  <th className="pb-3 font-bold">العميل</th><th className="pb-3 font-bold">الباقة</th>
                  <th className="pb-3 font-bold">عمولة المدير</th><th className="pb-3 font-bold">الحالة</th>
                  <th className="pb-3 font-bold">تاريخ التحصيل</th><th className="pb-3 font-bold">التاريخ</th>
                </tr></thead>
                <tbody>
                  {managerComms.map((c) => (
                    <tr key={c.id} className="border-b border-gray-800/50">
                      <td className="py-2 font-bold text-white">{c.managerName}</td>
                      <td className="py-2 text-gray-300">{c.agentName ?? "—"}</td>
                      <td className="py-2 text-gray-300">{c.customerName ?? "—"}</td>
                      <td className="py-2 text-gray-300">{c.membershipName ?? "—"}</td>
                      <td className="py-2 font-bold text-pink-300">{c.amount} ج.م</td>
                      <td className="py-2"><StatusBadge status={c.status} /></td>
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

      {/* ── Create Manager Modal ── */}
      {showCreateMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setShowCreateMgr(false)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">إضافة مدير تعاقدات</h3>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">الاسم *</label><input value={mgrForm.name} onChange={(e) => setMgrForm({ ...mgrForm, name: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">البريد *</label><input type="email" value={mgrForm.email} onChange={(e) => setMgrForm({ ...mgrForm, email: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الهاتف</label><input value={mgrForm.phone} onChange={(e) => setMgrForm({ ...mgrForm, phone: e.target.value })} className={INPUT} /></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">كلمة المرور *</label><input type="password" value={mgrForm.password} onChange={(e) => setMgrForm({ ...mgrForm, password: e.target.value })} className={INPUT} placeholder="6 أحرف على الأقل" /></div>
            </div>
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <p className="text-xs font-bold text-pink-400">إعدادات عمولة المدير</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-400 mb-1">نوع العمولة</label>
                  <select value={mgrForm.commissionType} onChange={(e) => setMgrForm({ ...mgrForm, commissionType: e.target.value })} className={INPUT}>
                    <option value="percentage_of_agents">نسبة % من عمولة مناديبه</option>
                    <option value="percentage_of_revenue">نسبة % من قيمة الاشتراكات</option>
                    <option value="fixed">مبلغ ثابت لكل اشتراك (ج.م)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-400 mb-1">{mgrForm.commissionType === "fixed" ? "المبلغ الثابت (ج.م)" : "النسبة (%)"}</label>
                  <input type="number" value={mgrForm.commissionRate} onChange={(e) => setMgrForm({ ...mgrForm, commissionRate: e.target.value })} className={INPUT} placeholder="0" />
                </div>
              </div>
            </div>
            <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={mgrForm.notes} onChange={(e) => setMgrForm({ ...mgrForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            <div className="flex gap-2">
              <button onClick={() => void handleCreateMgr()} disabled={creating} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">{creating ? "جاري الإنشاء..." : "إنشاء الحساب"}</button>
              <button onClick={() => setShowCreateMgr(false)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Agent Modal ── */}
      {showCreateAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setShowCreateAgent(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">إضافة مندوب جديد</h3>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">الاسم *</label><input value={agentForm.name} onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">البريد *</label><input type="email" value={agentForm.email} onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الهاتف</label><input value={agentForm.phone} onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })} className={INPUT} /></div>
              <div className="col-span-2"><label className="block text-xs font-bold text-gray-400 mb-1">كلمة المرور *</label><input type="password" value={agentForm.password} onChange={(e) => setAgentForm({ ...agentForm, password: e.target.value })} className={INPUT} placeholder="6 أحرف على الأقل" /></div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-400 mb-1">المدير المسؤول (اختياري)</label>
                <select value={agentForm.managerId} onChange={(e) => setAgentForm({ ...agentForm, managerId: e.target.value })} className={INPUT}>
                  <option value="">بدون مدير</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="border-t border-gray-700 pt-3">
              <p className="text-xs font-bold text-pink-400 mb-3">إعدادات العمولة والخصم</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-gray-400 mb-1">عمولة المندوب</label><input type="number" value={agentForm.commissionRate} onChange={(e) => setAgentForm({ ...agentForm, commissionRate: e.target.value })} className={INPUT} placeholder="0" /></div>
                <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع العمولة</label><select value={agentForm.commissionType} onChange={(e) => setAgentForm({ ...agentForm, commissionType: e.target.value })} className={INPUT}><option value="percentage">نسبة %</option><option value="fixed">ثابت ج.م</option></select></div>
                <div><label className="block text-xs font-bold text-gray-400 mb-1">خصم العميل</label><input type="number" value={agentForm.clientDiscountValue} onChange={(e) => setAgentForm({ ...agentForm, clientDiscountValue: e.target.value })} className={INPUT} placeholder="0" /></div>
                <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع الخصم</label><select value={agentForm.clientDiscountType} onChange={(e) => setAgentForm({ ...agentForm, clientDiscountType: e.target.value })} className={INPUT}><option value="percentage">نسبة %</option><option value="fixed">ثابت ج.م</option></select></div>
                <div><label className="block text-xs font-bold text-gray-400 mb-1">حد أقصى للخصم</label><input type="number" value={agentForm.maxClientDiscount} onChange={(e) => setAgentForm({ ...agentForm, maxClientDiscount: e.target.value })} className={INPUT} placeholder="اختياري" /></div>
              </div>
            </div>
            <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={agentForm.notes} onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            <div className="flex gap-2">
              <button onClick={() => void handleCreateAgent()} disabled={creating} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">{creating ? "جاري الإنشاء..." : "إنشاء الحساب"}</button>
              <button onClick={() => setShowCreateAgent(false)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Agent Modal ── */}
      {editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setEditAgent(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">تعديل: {editAgent.name}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-gray-400 mb-1">عمولة المندوب</label><input type="number" value={editAgentForm.commissionRate} onChange={(e) => setEditAgentForm({ ...editAgentForm, commissionRate: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع العمولة</label><select value={editAgentForm.commissionType} onChange={(e) => setEditAgentForm({ ...editAgentForm, commissionType: e.target.value })} className={INPUT}><option value="percentage">نسبة %</option><option value="fixed">ثابت ج.م</option></select></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">خصم العميل</label><input type="number" value={editAgentForm.clientDiscountValue} onChange={(e) => setEditAgentForm({ ...editAgentForm, clientDiscountValue: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع الخصم</label><select value={editAgentForm.clientDiscountType} onChange={(e) => setEditAgentForm({ ...editAgentForm, clientDiscountType: e.target.value })} className={INPUT}><option value="percentage">نسبة %</option><option value="fixed">ثابت ج.م</option></select></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">حد أقصى للخصم</label><input type="number" value={editAgentForm.maxClientDiscount} onChange={(e) => setEditAgentForm({ ...editAgentForm, maxClientDiscount: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الحالة</label><select value={editAgentForm.isActive ? "1" : "0"} onChange={(e) => setEditAgentForm({ ...editAgentForm, isActive: e.target.value === "1" })} className={INPUT}><option value="1">نشط</option><option value="0">موقوف</option></select></div>
            </div>
            <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={editAgentForm.notes} onChange={(e) => setEditAgentForm({ ...editAgentForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            <div className="flex gap-2">
              <button onClick={() => void handleEditAgent()} disabled={editSaving} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">{editSaving ? "جاري الحفظ..." : "حفظ التعديلات"}</button>
              <button onClick={() => setEditAgent(null)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Manager Modal ── */}
      {editMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print-hidden" onClick={() => setEditMgr(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">تعديل: {editMgr.name}</h3>
            <div className="space-y-3">
              <div><label className="block text-xs font-bold text-gray-400 mb-1">نوع عمولته</label>
                <select value={editMgrForm.commissionType} onChange={(e) => setEditMgrForm({ ...editMgrForm, commissionType: e.target.value })} className={INPUT}>
                  <option value="percentage_of_agents">نسبة % من عمولة مناديبه</option>
                  <option value="percentage_of_revenue">نسبة % من إيراد الاشتراكات</option>
                  <option value="fixed">مبلغ ثابت / اشتراك</option>
                </select>
              </div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">{editMgrForm.commissionType === "fixed" ? "المبلغ (ج.م)" : "النسبة (%)"}</label><input type="number" value={editMgrForm.commissionRate} onChange={(e) => setEditMgrForm({ ...editMgrForm, commissionRate: e.target.value })} className={INPUT} /></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">الحالة</label><select value={editMgrForm.isActive ? "1" : "0"} onChange={(e) => setEditMgrForm({ ...editMgrForm, isActive: e.target.value === "1" })} className={INPUT}><option value="1">نشط</option><option value="0">موقوف</option></select></div>
              <div><label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات</label><textarea value={editMgrForm.notes} onChange={(e) => setEditMgrForm({ ...editMgrForm, notes: e.target.value })} rows={2} className={INPUT + " resize-none"} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleEditMgr()} disabled={editSaving} className="flex-1 rounded-xl bg-pink-600 py-2.5 font-black text-white disabled:opacity-50">{editSaving ? "جاري الحفظ..." : "حفظ"}</button>
              <button onClick={() => setEditMgr(null)} className="rounded-xl bg-gray-800 px-5 py-2.5 font-bold text-gray-300">إلغاء</button>
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
              {selectedAgent.managerName && <p className="text-xs text-gray-400">المدير: <span className="text-pink-300">{selectedAgent.managerName}</span></p>}
              <ReferralLink code={selectedAgent.referralCode} />
              {detailLoading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : agentDetail ? (
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
                  <p className="text-xs font-bold text-gray-400">العملاء ({agentDetail.referrals.length})</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {agentDetail.referrals.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm">
                        <div><p className="text-white">{r.user.name ?? "—"}</p><p className="text-xs text-gray-400">{r.user.phone ?? r.user.email ?? "—"}</p></div>
                        <span className={r.convertedAt ? "text-emerald-400 text-xs" : "text-gray-500 text-xs"}>{r.convertedAt ? "✓ مشترك" : "لم يشترك"}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ── Manager Detail Drawer ── */}
      {selectedMgr && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-4 print-hidden" onClick={() => { setSelectedMgr(null); setMgrDetail(null); }}>
          <div className="w-full max-w-lg h-full rounded-2xl border border-gray-700 bg-gray-900 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-white">{selectedMgr.name}</h3>
                <button onClick={() => { setSelectedMgr(null); setMgrDetail(null); }} className="text-gray-400 hover:text-white text-xl">×</button>
              </div>
              <p className="text-sm text-gray-400">{selectedMgr.user.email} · {selectedMgr.user.phone ?? ""}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "مناديبه", value: mgrDetail?.agents.length ?? selectedMgr.agentsCount },
                  { label: "نوع عمولته", value: commTypeLabel[selectedMgr.commissionType] ?? selectedMgr.commissionType },
                  { label: "معلق", value: `${(mgrDetail?.pendingCommission ?? selectedMgr.pendingCommission).toFixed(0)} ج.م` },
                  { label: "محصّل", value: `${(mgrDetail?.settledCommission ?? selectedMgr.settledCommission).toFixed(0)} ج.م` },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-gray-800 p-3 text-center">
                    <p className="font-black text-pink-300 text-sm">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                ))}
              </div>
              {mgrDetailLoading ? <p className="text-sm text-[#d7aabd]">جاري التحميل...</p> : mgrDetail && mgrDetail.agents.length > 0 ? (
                <>
                  <p className="text-xs font-bold text-gray-400">مناديبه ({mgrDetail.agents.length})</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {mgrDetail.agents.map((a) => (
                      <div key={a.id} className="rounded-lg bg-gray-800 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div><p className="text-white font-bold text-sm">{a.name}</p><p className="text-xs text-gray-400">{a.user.email}</p></div>
                          <div className="text-right text-xs">
                            <p className="text-yellow-400">{a.pendingCommission.toFixed(0)} ج.م معلق</p>
                            <p className="text-emerald-400">{a.settledCommission.toFixed(0)} ج.م محصّل</p>
                          </div>
                        </div>
                        <ReferralLink code={a.referralCode} />
                      </div>
                    ))}
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
