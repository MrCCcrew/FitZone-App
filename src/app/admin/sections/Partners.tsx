"use client";

import { useCallback, useEffect, useState } from "react";
import type { Partner, PartnerCode, PartnerAffiliateLink, PartnerWithdrawalRequest } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
  beauty_center: "سنتر تجميل",
  salon: "كوافير",
  pharmacy: "صيدلية",
  clinic: "عيادة",
  physiotherapy: "علاج طبيعي",
  nutrition: "دكتور تغذية",
  nursery: "حضانة",
  education: "مركز تعليم أطفال",
  clothing: "محل ملابس نسائية",
  other: "خدمات نسائية أخرى",
};

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none focus:border-pink-500";

type ViewMode = "admin" | "partner";
type AdminTab = "partners" | "commissions" | "withdrawals";
type WdFilter = "all" | "pending" | "approved" | "rejected";
type WdEntry = { notes: string; receiptUrl: string; uploading: boolean; acting: boolean };

type CodeCustomer = {
  id: string; customerName: string; membershipName: string; paymentAmount: number;
  codeName: string; discountType: string; discountValue: number; createdAt: string;
};
type ReferralCustomer = {
  id: string; customerName: string; membershipName: string; paymentAmount: number;
  commissionAmount: number; commissionStatus: string; linkLabel: string | null; createdAt: string;
};

type DashboardData = {
  partner: { id: string; name: string; commissionRate: number; commissionType: string };
  stats: { totalCodes: number; activeCodes: number; totalLinks: number; totalCustomers: number; totalCommissionPending: number; totalCommissionPaid: number };
  links: PartnerAffiliateLink[];
  recentCommissions: Array<{ id: string; amount: number; status: string; createdAt: string; customerName: string; membershipName: string; source: "code" | "link" }>;
  codeCustomers: CodeCustomer[];
  referralCustomers: ReferralCustomer[];
};

type AdminCommission = {
  id: string; partnerName: string; customerName: string; membershipName: string;
  paymentAmount: number; amount: number; status: string; withdrawnAt: string | null;
  notes: string | null; createdAt: string;
};

export default function Partners({ viewMode = "admin" }: { viewMode?: ViewMode }) {
  // ── Admin State ────────────────────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([]);
  const [commissions, setCommissions] = useState<AdminCommission[]>([]);
  const [adminWithdrawals, setAdminWithdrawals] = useState<PartnerWithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadLogoError, setUploadLogoError] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("partners");
  const [wdFilter, setWdFilter] = useState<WdFilter>("pending");
  const [wdState, setWdState] = useState<Record<string, WdEntry>>({});

  // Admin modal
  const [modal, setModal] = useState<Partial<Partner & { email: string; password: string }> | null>(null);
  const isNew = !modal?.id;

  // Codes management inside modal
  const [partnerCodes, setPartnerCodes] = useState<PartnerCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [newCodeForm, setNewCodeForm] = useState({ code: "", discountType: "percentage", discountValue: "", maxUsage: "", expiresAt: "" });
  const [newCodeSaving, setNewCodeSaving] = useState(false);
  const [newCodeError, setNewCodeError] = useState("");

  // ── Partner Portal State ───────────────────────────────────────────────────
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [portalTab, setPortalTab] = useState<"links" | "codeCustomers" | "referralCustomers" | "commissions" | "withdrawal">("links");
  const [linkForm, setLinkForm] = useState({ label: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [withdrawal, setWithdrawal] = useState<{
    totalPending: number; totalWithdrawn: number; canRequest: boolean; minWithdrawal: number;
    requests: { id: string; amount: number; status: string; adminNotes: string | null; receiptUrl: string | null; createdAt: string; processedAt: string | null }[];
  } | null>(null);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalRequesting, setWithdrawalRequesting] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, wRes] = await Promise.all([
        fetch("/api/admin/partners", { cache: "no-store" }),
        fetch("/api/admin/partner-commissions", { cache: "no-store" }),
        fetch("/api/admin/partner-withdrawals", { cache: "no-store" }),
      ]);
      const p = await pRes.json().catch(() => []);
      const cData = await cRes.json().catch(() => ({})) as { commissions?: AdminCommission[] };
      const w = await wRes.json().catch(() => []);
      setPartners(Array.isArray(p) ? p : []);
      setCommissions(Array.isArray(cData.commissions) ? cData.commissions : []);
      setAdminWithdrawals(Array.isArray(w) ? w : []);
    } finally { setLoading(false); }
  }, []);

  const loadPartnerPortal = useCallback(async () => {
    setLoading(true);
    try {
      const dRes = await fetch("/api/partner/dashboard", { cache: "no-store" });
      const d = await dRes.json().catch(() => null) as DashboardData | null;
      if (d && !("error" in (d as object))) setDashboard(d);
    } finally { setLoading(false); }
  }, []);

  const loadWithdrawal = useCallback(async () => {
    setWithdrawalLoading(true);
    try {
      const res = await fetch("/api/partner/withdrawal", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (d && !d.error) setWithdrawal(d as typeof withdrawal);
    } finally { setWithdrawalLoading(false); }
  }, []);

  const loadPartnerCodes = useCallback(async (partnerId: string) => {
    setCodesLoading(true);
    try {
      const res = await fetch(`/api/admin/partner-codes?partnerId=${encodeURIComponent(partnerId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => []);
      setPartnerCodes(Array.isArray(data) ? data : []);
    } finally { setCodesLoading(false); }
  }, []);

  useEffect(() => {
    if (viewMode === "admin") void loadAdmin();
    else { void loadPartnerPortal(); void loadWithdrawal(); }
  }, [viewMode, loadAdmin, loadPartnerPortal, loadWithdrawal]);

  // ── Upload Logo ────────────────────────────────────────────────────────────
  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    setUploadLogoError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "partners");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "تعذر رفع الشعار الآن.");
      setModal((prev) => prev ? { ...prev, logoUrl: data.url } : prev);
    } catch (err) {
      setUploadLogoError(err instanceof Error ? err.message : "تعذر رفع الشعار الآن.");
    } finally {
      setUploadingLogo(false);
    }
  };

  // ── Admin Save Partner ─────────────────────────────────────────────────────
  const savePartner = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/partners", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; id?: string };
      if (!res.ok) { window.alert(data.error ?? "حدث خطأ."); return; }

      // Create discount code for new partners if code value was entered
      if (isNew && newCodeForm.discountValue && data.id) {
        await fetch("/api/admin/partner-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerId: data.id,
            code: newCodeForm.code || undefined,
            discountType: newCodeForm.discountType,
            discountValue: Number(newCodeForm.discountValue),
            maxUsage: newCodeForm.maxUsage ? Number(newCodeForm.maxUsage) : null,
            expiresAt: newCodeForm.expiresAt || null,
          }),
        });
      }

      setModal(null);
      void loadAdmin();
    } finally { setSaving(false); }
  };

  const deletePartner = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الشريك وحسابه؟")) return;
    await fetch("/api/admin/partners", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void loadAdmin();
  };

  // ── Admin Code Management ──────────────────────────────────────────────────
  const addPartnerCode = async (partnerId: string) => {
    if (!newCodeForm.discountValue) { setNewCodeError("قيمة الخصم مطلوبة."); return; }
    setNewCodeSaving(true); setNewCodeError("");
    try {
      const res = await fetch("/api/admin/partner-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partnerId,
          code: newCodeForm.code || undefined,
          discountType: newCodeForm.discountType,
          discountValue: Number(newCodeForm.discountValue),
          maxUsage: newCodeForm.maxUsage ? Number(newCodeForm.maxUsage) : null,
          expiresAt: newCodeForm.expiresAt || null,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setNewCodeError(data.error ?? "حدث خطأ."); return; }
      setNewCodeForm({ code: "", discountType: "percentage", discountValue: "", maxUsage: "", expiresAt: "" });
      void loadPartnerCodes(partnerId);
    } finally { setNewCodeSaving(false); }
  };

  const deletePartnerCode = async (id: string, partnerId: string) => {
    if (!window.confirm("حذف الكود؟")) return;
    const res = await fetch("/api/admin/partner-codes", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) { window.alert(data.error ?? "حدث خطأ."); return; }
    void loadPartnerCodes(partnerId);
  };

  // ── Admin Withdrawal Management ────────────────────────────────────────────
  const getWdEntry = (req: PartnerWithdrawalRequest): WdEntry =>
    wdState[req.id] ?? { notes: req.adminNotes ?? "", receiptUrl: req.receiptUrl ?? "", uploading: false, acting: false };

  const patchWd = (id: string, patch: Partial<WdEntry>) =>
    setWdState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { notes: "", receiptUrl: "", uploading: false, acting: false }), ...patch } }));

  const uploadWithdrawalReceipt = async (reqId: string, file: File) => {
    patchWd(reqId, { uploading: true });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "partners");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "تعذر رفع الإيصال.");
      patchWd(reqId, { receiptUrl: data.url });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "تعذر رفع الإيصال.");
    } finally {
      patchWd(reqId, { uploading: false });
    }
  };

  const actWithdrawal = async (req: PartnerWithdrawalRequest, status: "approved" | "rejected") => {
    const entry = getWdEntry(req);
    patchWd(req.id, { acting: true });
    try {
      const res = await fetch("/api/admin/partner-withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: req.id, status, adminNotes: entry.notes, receiptUrl: entry.receiptUrl }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { window.alert(data.error ?? "حدث خطأ."); return; }
      void loadAdmin();
    } finally {
      patchWd(req.id, { acting: false });
    }
  };

  // ── Partner Portal Actions ─────────────────────────────────────────────────
  const createLink = async () => {
    setLinkSaving(true); setLinkError("");
    try {
      const res = await fetch("/api/partner/links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: linkForm.label || undefined }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setLinkError(data.error ?? "حدث خطأ."); return; }
      setLinkForm({ label: "" });
      void loadPartnerPortal();
    } finally { setLinkSaving(false); }
  };

  const copyLink = (token: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/?ref=${token}`);
    window.alert("تم نسخ الرابط!");
  };

  const deleteLink = async (id: string) => {
    if (!window.confirm("حذف الرابط؟")) return;
    await fetch("/api/partner/links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void loadPartnerPortal();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-500">جارٍ التحميل...</div>;

  // ══════════════════════════════════════════════════════════════════════════
  // PARTNER PORTAL VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (viewMode === "partner") {
    if (!dashboard) return <div className="py-20 text-center text-sm text-gray-500">جارٍ التحميل...</div>;

    const { stats, links, recentCommissions, codeCustomers, referralCustomers } = dashboard;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    const requestWithdrawal = async () => {
      setWithdrawalRequesting(true);
      try {
        const res = await fetch("/api/partner/withdrawal", { method: "POST" });
        const d = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) { window.alert(d.error ?? "تعذر إرسال الطلب."); return; }
        await loadWithdrawal();
      } finally { setWithdrawalRequesting(false); }
    };

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "عملاء منضمون", value: stats.totalCustomers, color: "text-emerald-300" },
            { label: "عمولة معلقة", value: `${stats.totalCommissionPending.toFixed(0)} ج.م`, color: "text-yellow-300" },
            { label: "عمولة مسحوبة", value: `${stats.totalCommissionPaid.toFixed(0)} ج.م`, color: "text-pink-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">{s.label}</div>
              <div className={`mt-2 text-3xl font-black ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-1">
          {([
            ["links", "روابط الإحالة"],
            ["codeCustomers", `عملاء الكود${codeCustomers.length > 0 ? ` (${codeCustomers.length})` : ""}`],
            ["referralCustomers", `عملاء الإحالة${referralCustomers.length > 0 ? ` (${referralCustomers.length})` : ""}`],
            ["commissions", "العمولات"],
            ["withdrawal", "طلبات السحب"],
          ] as [typeof portalTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setPortalTab(key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${portalTab === key ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Links Tab ── */}
        {portalTab === "links" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 space-y-4">
              <h3 className="font-black text-white">إنشاء رابط إحالة</h3>
              <p className="text-xs leading-6 text-gray-400">
                شارك الرابط مع عملائك — لما حد يسجل عن طريقه ويكمل اشتراك مدفوع بالكامل، بتتسجلّك عمولة تلقائياً.
              </p>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">وصف داخلي (اختياري)</label>
                <input value={linkForm.label} onChange={(e) => setLinkForm({ label: e.target.value })}
                  className={INPUT} placeholder="مثال: رابط انستجرام" />
              </div>
              {linkError && <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-xs text-red-300">{linkError}</div>}
              <button onClick={() => void createLink()} disabled={linkSaving}
                className="rounded-xl bg-pink-600 px-6 py-2.5 font-black text-white disabled:opacity-50">
                {linkSaving ? "جارٍ الإنشاء..." : "إنشاء رابط جديد"}
              </button>
            </div>

            <div className="space-y-3">
              {links.length === 0 && <div className="py-8 text-center text-sm text-gray-500">لا توجد روابط بعد.</div>}
              {links.map((l) => (
                <div key={l.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      {l.label && <div className="font-bold text-white">{l.label}</div>}
                      <div className="text-xs text-gray-500">نقرات: <span className="font-bold text-white">{l.clickCount}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(l.token)}
                        className="rounded-lg bg-emerald-900/40 px-3 py-1.5 text-xs font-bold text-emerald-300">📋 نسخ الرابط</button>
                      <button onClick={() => void deleteLink(l.id)}
                        className="rounded-lg bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300">حذف</button>
                    </div>
                  </div>
                  <div dir="ltr" className="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-gray-400 break-all">
                    {origin}/?ref={l.token}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Code Customers Tab ── */}
        {portalTab === "codeCustomers" && (
          <div className="space-y-3">
            {codeCustomers.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500">لا يوجد عملاء استخدموا كود الخصم بعد.</div>
            )}
            {codeCustomers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="space-y-1">
                  <div className="font-bold text-white">{c.customerName}</div>
                  <div className="text-xs text-gray-400">{c.membershipName} · {c.createdAt.slice(0, 10)}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-pink-300">{c.codeName}</span>
                    <span className="text-xs text-gray-500">
                      {c.discountType === "percentage" ? `${c.discountValue}% خصم` : `${c.discountValue} ج.م خصم`}
                    </span>
                  </div>
                </div>
                <div className="text-lg font-black text-white">{c.paymentAmount.toFixed(0)} ج.م</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Referral Customers Tab ── */}
        {portalTab === "referralCustomers" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3 text-xs text-gray-400">
              يظهر هنا فقط العملاء اللي جوا عن طريق رابط الإحالة <span className="font-bold text-white">وأتمّوا اشتراك مدفوع</span> — العملاء اللي سجلوا بس ماشترکوش مش بيظهروا.
            </div>
            {referralCustomers.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-500">لا يوجد عملاء أكملوا اشتراكاً عن طريق رابط الإحالة بعد.</div>
            )}
            {referralCustomers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="space-y-1">
                  <div className="font-bold text-white">{c.customerName}</div>
                  <div className="text-xs text-gray-400">{c.membershipName} · {c.createdAt.slice(0, 10)}</div>
                  {c.linkLabel && (
                    <div className="text-xs text-gray-500">عبر: <span className="text-gray-300">{c.linkLabel}</span></div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-gray-500">قيمة الاشتراك</div>
                    <div className="font-black text-white">{c.paymentAmount.toFixed(0)} ج.م</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">عمولتك</div>
                    <div className="text-lg font-black text-emerald-300">{c.commissionAmount.toFixed(0)} ج.م</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${c.commissionStatus === "withdrawn" ? "bg-pink-900/40 text-pink-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                    {c.commissionStatus === "withdrawn" ? "مسحوبة" : "معلقة"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Commissions Tab ── */}
        {portalTab === "commissions" && (
          <div className="space-y-3">
            {recentCommissions.length === 0 && <div className="py-8 text-center text-sm text-gray-500">لا توجد عمولات بعد.</div>}
            {recentCommissions.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="space-y-1">
                  <div className="font-bold text-white">{c.customerName}</div>
                  <div className="text-xs text-gray-400">{c.membershipName} · {c.createdAt.slice(0, 10)}</div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${c.source === "link" ? "bg-blue-900/40 text-blue-300" : "bg-purple-900/40 text-purple-300"}`}>
                    {c.source === "link" ? "رابط إحالة" : "كود خصم"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-lg font-black text-emerald-300">{c.amount.toFixed(0)} ج.م</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "withdrawn" ? "bg-pink-900/40 text-pink-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                    {c.status === "withdrawn" ? "مسحوبة" : "معلقة"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Withdrawal Tab ── */}
        {portalTab === "withdrawal" && (
          <div className="space-y-5">
            {withdrawalLoading ? (
              <div className="py-8 text-center text-sm text-gray-500">جارٍ التحميل...</div>
            ) : withdrawal ? (
              <>
                <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-gray-400">عمولة معلقة</div>
                      <div className="mt-1 text-2xl font-black text-yellow-300">{withdrawal.totalPending.toFixed(2)} ج.م</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">إجمالي مسحوب</div>
                      <div className="mt-1 text-2xl font-black text-pink-300">{withdrawal.totalWithdrawn.toFixed(2)} ج.م</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-black/20 px-4 py-3 text-xs text-gray-400">
                    الحد الأدنى للسحب: <span className="font-bold text-white">{withdrawal.minWithdrawal} ج.م</span>
                  </div>
                  {withdrawal.canRequest && !withdrawal.requests.find((r) => r.status === "pending") ? (
                    <button onClick={() => void requestWithdrawal()} disabled={withdrawalRequesting}
                      className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50">
                      {withdrawalRequesting ? "جارٍ الإرسال..." : `طلب سحب ${withdrawal.totalPending.toFixed(0)} ج.م`}
                    </button>
                  ) : withdrawal.requests.find((r) => r.status === "pending") ? (
                    <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/20 px-4 py-3 text-sm font-bold text-yellow-300">
                      ⏳ يوجد طلب سحب معلّق — في انتظار موافقة الإدارة
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3 text-xs text-gray-400">
                      تحتاج {withdrawal.minWithdrawal} ج.م على الأقل — رصيدك الحالي {withdrawal.totalPending.toFixed(2)} ج.م
                    </div>
                  )}
                </div>

                {withdrawal.requests.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-black text-white">سجل طلبات السحب</h3>
                    {withdrawal.requests.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-lg font-black text-white">{r.amount.toFixed(2)} ج.م</div>
                            <div className="text-xs text-gray-400">{r.createdAt.slice(0, 10)}</div>
                          </div>
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                            r.status === "approved" ? "bg-emerald-900/40 text-emerald-300" :
                            r.status === "rejected" ? "bg-red-900/40 text-red-300" :
                            "bg-yellow-900/40 text-yellow-300"
                          }`}>
                            {r.status === "approved" ? "✓ تم الدفع" : r.status === "rejected" ? "مرفوض" : "معلّق"}
                          </span>
                        </div>
                        {r.adminNotes && <div className="text-xs text-gray-400">ملاحظة: {r.adminNotes}</div>}
                        {r.receiptUrl && (
                          <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-block rounded-lg bg-emerald-900/30 px-3 py-1.5 text-xs font-bold text-emerald-300">
                            📄 عرض إيصال الدفع
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalWithdrawn = commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);
  const pendingWithdrawalsCount = adminWithdrawals.filter((r) => r.status === "pending").length;
  const filteredWithdrawals = wdFilter === "all" ? adminWithdrawals : adminWithdrawals.filter((r) => r.status === wdFilter);

  const openModal = (partner?: Partner) => {
    setModal(partner ? { ...partner } : { commissionRate: 10, commissionType: "percentage", isActive: true, showOnPublicPage: true });
    setPartnerCodes([]);
    setNewCodeForm({ code: "", discountType: "percentage", discountValue: "", maxUsage: "", expiresAt: "" });
    setNewCodeError("");
    if (partner) void loadPartnerCodes(partner.id);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-1">
        {(
          [
            ["partners", "الشركاء"],
            ["commissions", "العمولات المالية"],
            ["withdrawals", `طلبات السحب${pendingWithdrawalsCount > 0 ? ` (${pendingWithdrawalsCount})` : ""}`],
          ] as [AdminTab, string][]
        ).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${tab === key ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Partners Tab ── */}
      {tab === "partners" && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">إدارة الشركاء ({partners.length})</h3>
            <button onClick={() => openModal()} className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">+ شريك جديد</button>
          </div>

          {partners.length === 0 && <div className="py-16 text-center text-sm text-gray-500">لا يوجد شركاء بعد.</div>}

          <div className="grid gap-4 xl:grid-cols-2">
            {partners.map((p) => (
              <div key={p.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-3">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
                    {p.logoUrl
                      ? <img src={p.logoUrl} alt={p.name} className="h-full w-full object-cover" />
                      : <div className="flex h-full items-center justify-center text-xl font-black text-gray-500">{p.name[0]}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-black text-white">{p.name}</div>
                      <span className="rounded-full bg-pink-900/30 px-2 py-0.5 text-xs text-pink-300">{CATEGORY_LABELS[p.category] ?? p.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.isActive ? "bg-emerald-900/30 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                        {p.isActive ? "نشط" : "معطل"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">{p.linkedUser?.email}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      عمولة: <span className="font-bold text-white">{p.commissionType === "percentage" ? `${p.commissionRate}%` : `${p.commissionRate} ج.م`}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  {[
                    { label: "أكواد", val: p.codesCount },
                    { label: "روابط", val: p.linksCount },
                    { label: "معلقة", val: `${p.totalCommissionPending.toFixed(0)} ج`, color: "text-yellow-300" },
                    { label: "مسحوبة", val: `${p.totalCommissionPaid.toFixed(0)} ج`, color: "text-emerald-300" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className={`font-black text-white ${s.color ?? ""}`}>{s.val}</div>
                      <div>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => openModal(p)} className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs font-bold text-white">تعديل</button>
                  <button onClick={() => void deletePartner(p.id)} className="rounded-lg bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Commissions Tab ── */}
      {tab === "commissions" && (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">إجمالي العمولات</div>
              <div className="mt-2 text-2xl font-black text-white">{(totalPending + totalWithdrawn).toFixed(0)} ج.م</div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">عمولات معلقة</div>
              <div className="mt-2 text-2xl font-black text-yellow-300">{totalPending.toFixed(0)} ج.م</div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">عمولات مسحوبة</div>
              <div className="mt-2 text-2xl font-black text-emerald-300">{totalWithdrawn.toFixed(0)} ج.م</div>
            </div>
          </div>

          {commissions.length === 0 && <div className="py-16 text-center text-sm text-gray-500">لا توجد عمولات بعد.</div>}

          {commissions.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-right text-xs text-gray-500">
                    <th className="px-4 py-3">الشريك</th>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">الاشتراك</th>
                    <th className="px-4 py-3">العمولة</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {commissions.map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-bold text-white">{c.partnerName}</td>
                      <td className="px-4 py-3 text-white">{c.customerName}</td>
                      <td className="px-4 py-3 text-gray-300">{c.membershipName}</td>
                      <td className="px-4 py-3 font-black text-emerald-300">{c.amount.toFixed(0)} ج.م</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "withdrawn" ? "bg-emerald-900/30 text-emerald-300" : "bg-yellow-900/30 text-yellow-300"}`}>
                          {c.status === "withdrawn" ? "مسحوبة" : "معلقة"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{c.createdAt.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Withdrawals Tab ── */}
      {tab === "withdrawals" && (
        <section className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {([["all", "الكل"], ["pending", "معلّق"], ["approved", "مدفوع"], ["rejected", "مرفوض"]] as [WdFilter, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setWdFilter(key)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${wdFilter === key ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>

          {filteredWithdrawals.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-500">لا توجد طلبات سحب.</div>
          )}

          <div className="space-y-4">
            {filteredWithdrawals.map((req) => {
              const entry = getWdEntry(req);
              const isPending = req.status === "pending";
              return (
                <div key={req.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-black text-white">{req.partnerName}</div>
                      <div className="text-xs text-gray-400">{CATEGORY_LABELS[req.partnerCategory] ?? req.partnerCategory} · {req.partnerPhone ?? "—"}</div>
                      <div className="mt-1 text-xs text-gray-500">{req.createdAt.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-black text-white">{req.amount.toFixed(2)} ج.م</div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                        req.status === "approved" ? "bg-emerald-900/40 text-emerald-300" :
                        req.status === "rejected" ? "bg-red-900/40 text-red-300" :
                        "bg-yellow-900/40 text-yellow-300"
                      }`}>
                        {req.status === "approved" ? "✓ تم الدفع" : req.status === "rejected" ? "مرفوض" : "معلّق"}
                      </span>
                    </div>
                  </div>

                  {isPending && (
                    <div className="space-y-3 border-t border-gray-800 pt-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">ملاحظات (اختياري)</label>
                        <input value={entry.notes}
                          onChange={(e) => patchWd(req.id, { notes: e.target.value })}
                          className={INPUT} placeholder="مثال: تم التحويل عبر إنستاباي" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-1">إيصال الدفع</label>
                        {entry.receiptUrl ? (
                          <div className="flex items-center gap-3">
                            <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-lg bg-emerald-900/30 px-3 py-1.5 text-xs font-bold text-emerald-300">📄 عرض الإيصال</a>
                            <button onClick={() => patchWd(req.id, { receiptUrl: "" })}
                              className="text-xs text-gray-500 hover:text-red-300">تغيير</button>
                          </div>
                        ) : (
                          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadWithdrawalReceipt(req.id, f); e.currentTarget.value = ""; }}
                            disabled={entry.uploading}
                            className="block w-full text-sm text-[#d7aabd] file:ml-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white disabled:opacity-50" />
                        )}
                        {entry.uploading && <div className="mt-1 text-xs text-[#d7aabd]">جارٍ رفع الإيصال...</div>}
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => void actWithdrawal(req, "approved")} disabled={entry.acting}
                          className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white disabled:opacity-50">
                          {entry.acting ? "جارٍ المعالجة..." : "✓ موافقة وتسجيل الدفع"}
                        </button>
                        <button onClick={() => void actWithdrawal(req, "rejected")} disabled={entry.acting}
                          className="rounded-xl bg-red-900/50 px-5 py-2.5 text-sm font-black text-red-300 disabled:opacity-50">
                          رفض
                        </button>
                      </div>
                    </div>
                  )}

                  {!isPending && (req.adminNotes || req.receiptUrl || req.processedAt) && (
                    <div className="space-y-2 border-t border-gray-800 pt-3">
                      {req.adminNotes && <div className="text-xs text-gray-400">ملاحظة: {req.adminNotes}</div>}
                      {req.receiptUrl && (
                        <a href={req.receiptUrl} target="_blank" rel="noopener noreferrer"
                          className="inline-block rounded-lg bg-emerald-900/30 px-3 py-1.5 text-xs font-bold text-emerald-300">
                          📄 عرض إيصال الدفع
                        </a>
                      )}
                      {req.processedAt && <div className="text-xs text-gray-500">تاريخ المعالجة: {req.processedAt.slice(0, 10)}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Add/Edit Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModal(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">{isNew ? "إضافة شريك جديد" : "تعديل بيانات الشريك"}</h3>
              <button onClick={() => setModal(null)} className="text-2xl leading-none text-gray-500 hover:text-white">×</button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">اسم الشريك *</span>
                <input value={modal.name ?? ""} onChange={(e) => setModal({ ...modal, name: e.target.value })} className={INPUT} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">الفئة *</span>
                <select value={modal.category ?? ""} onChange={(e) => setModal({ ...modal, category: e.target.value })} className={INPUT}>
                  <option value="">اختر الفئة...</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>

              {isNew && (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-gray-400">البريد الإلكتروني *</span>
                    <input type="email" value={(modal as { email?: string }).email ?? ""}
                      onChange={(e) => setModal({ ...modal, email: e.target.value } as typeof modal)} className={INPUT} dir="ltr" />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-gray-400">كلمة المرور</span>
                    <input type="text" value={(modal as { password?: string }).password ?? ""}
                      onChange={(e) => setModal({ ...modal, password: e.target.value } as typeof modal)}
                      className={INPUT} placeholder="FitZone@Partner!" dir="ltr" />
                  </label>
                </>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">نسبة / قيمة العمولة</span>
                <input type="number" value={modal.commissionRate ?? 10}
                  onChange={(e) => setModal({ ...modal, commissionRate: Number(e.target.value) })} className={INPUT} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">نوع العمولة</span>
                <select value={modal.commissionType ?? "percentage"}
                  onChange={(e) => setModal({ ...modal, commissionType: e.target.value as "percentage" | "fixed" })} className={INPUT}>
                  <option value="percentage">نسبة مئوية %</option>
                  <option value="fixed">مبلغ ثابت ج.م</option>
                </select>
              </label>

              <div className="block space-y-2 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">شعار الشريك (logo)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.currentTarget.value = ""; }}
                  className="block w-full text-sm text-[#d7aabd] file:ml-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white" />
                <input value={modal.logoUrl ?? ""} onChange={(e) => setModal({ ...modal, logoUrl: e.target.value })}
                  className={INPUT} placeholder="أو ضع رابط الصورة المباشر" dir="ltr" />
                {uploadingLogo && <div className="text-xs text-[#d7aabd]">جارٍ رفع الشعار...</div>}
                {uploadLogoError && <div className="text-xs text-red-400">{uploadLogoError}</div>}
                {modal.logoUrl && (
                  <img src={modal.logoUrl} alt="معاينة" className="h-16 w-16 rounded-xl border border-[rgba(255,188,219,0.2)] object-contain bg-white p-1" />
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">الموقع الإلكتروني</span>
                <input value={modal.websiteUrl ?? ""} onChange={(e) => setModal({ ...modal, websiteUrl: e.target.value })}
                  className={INPUT} placeholder="https://..." dir="ltr" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">رقم التواصل</span>
                <input value={modal.contactPhone ?? ""} onChange={(e) => setModal({ ...modal, contactPhone: e.target.value })}
                  className={INPUT} placeholder="01xxxxxxxxx" />
              </label>

              <div className="flex gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 flex-1">
                  <input type="checkbox" checked={modal.isActive !== false}
                    onChange={(e) => setModal({ ...modal, isActive: e.target.checked })} className="accent-pink-500" />
                  <span className="text-sm text-white">نشط</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 flex-1">
                  <input type="checkbox" checked={modal.showOnPublicPage !== false}
                    onChange={(e) => setModal({ ...modal, showOnPublicPage: e.target.checked })} className="accent-pink-500" />
                  <span className="text-sm text-white">يظهر في الصفحة</span>
                </label>
              </div>

              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-gray-400">ملاحظات داخلية</span>
                <textarea value={modal.notes ?? ""} onChange={(e) => setModal({ ...modal, notes: e.target.value })}
                  rows={3} className={`${INPUT} resize-none`} />
              </label>
            </div>

            {/* ── Discount Code Section ── */}
            <div className="border-t border-gray-800 pt-5 space-y-4">
              <h4 className="font-black text-white">أكواد الخصم</h4>

              {/* Existing codes — edit mode only */}
              {!isNew && (
                <div className="space-y-2">
                  {codesLoading ? (
                    <div className="text-xs text-gray-500">جارٍ تحميل الأكواد...</div>
                  ) : partnerCodes.length > 0 ? (
                    partnerCodes.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="font-mono font-black text-pink-300">{c.code}</div>
                          <div className="text-xs text-gray-400">
                            {c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue} ج.م`}
                            {c.maxUsage ? ` · ${c.usageCount}/${c.maxUsage} استخدام` : ` · ${c.usageCount} استخدام`}
                            {c.expiresAt ? ` · ينتهي ${c.expiresAt.slice(0, 10)}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.isActive ? "bg-emerald-900/30 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                            {c.isActive ? "نشط" : "معطل"}
                          </span>
                          {c.usageCount === 0 && (
                            <button onClick={() => void deletePartnerCode(c.id, modal.id!)}
                              className="text-xs font-bold text-red-400 hover:text-red-300">حذف</button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">لا توجد أكواد خصم بعد.</div>
                  )}
                </div>
              )}

              {/* Add new code form */}
              <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/30 p-4 space-y-3">
                <div className="text-xs font-bold text-gray-400">{isNew ? "كود خصم للشريك (اختياري)" : "إضافة كود جديد"}</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الكود (فارغ = توليد تلقائي)</label>
                    <input value={newCodeForm.code}
                      onChange={(e) => setNewCodeForm({ ...newCodeForm, code: e.target.value.toUpperCase() })}
                      className={INPUT} placeholder="مثال: FITZONE20" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">نوع الخصم</label>
                    <select value={newCodeForm.discountType}
                      onChange={(e) => setNewCodeForm({ ...newCodeForm, discountType: e.target.value })} className={INPUT}>
                      <option value="percentage">نسبة مئوية %</option>
                      <option value="fixed">مبلغ ثابت ج.م</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">قيمة الخصم *</label>
                    <input type="number" value={newCodeForm.discountValue}
                      onChange={(e) => setNewCodeForm({ ...newCodeForm, discountValue: e.target.value })}
                      className={INPUT} placeholder={newCodeForm.discountType === "percentage" ? "مثال: 20" : "مثال: 100"} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">الحد الأقصى للاستخدام</label>
                    <input type="number" value={newCodeForm.maxUsage}
                      onChange={(e) => setNewCodeForm({ ...newCodeForm, maxUsage: e.target.value })}
                      className={INPUT} placeholder="فارغ = غير محدود" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">تاريخ الانتهاء</label>
                    <input type="date" value={newCodeForm.expiresAt}
                      onChange={(e) => setNewCodeForm({ ...newCodeForm, expiresAt: e.target.value })} className={INPUT} />
                  </div>
                </div>
                {newCodeError && <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-xs text-red-300">{newCodeError}</div>}
                {!isNew && (
                  <button onClick={() => void addPartnerCode(modal.id!)} disabled={newCodeSaving}
                    className="rounded-xl bg-gray-700 px-5 py-2 text-xs font-black text-white disabled:opacity-50">
                    {newCodeSaving ? "جارٍ الإضافة..." : "+ إضافة كود"}
                  </button>
                )}
                {isNew && <p className="text-xs text-gray-500">سيتم إنشاء الكود بعد حفظ بيانات الشريك.</p>}
              </div>
            </div>

            <button onClick={() => void savePartner()} disabled={saving}
              className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50">
              {saving ? "جارٍ الحفظ..." : isNew ? "إنشاء حساب الشريك" : "حفظ التعديلات"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
