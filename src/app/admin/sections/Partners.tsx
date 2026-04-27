"use client";

import { useCallback, useEffect, useState } from "react";
import type { Partner, PartnerCode, PartnerAffiliateLink, PartnerCommission } from "../types";

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

type DashboardData = {
  partner: { id: string; name: string; commissionRate: number; commissionType: string };
  stats: { totalCodes: number; activeCodes: number; totalLinks: number; totalCustomers: number; totalCommissionPending: number; totalCommissionPaid: number };
  codes: PartnerCode[];
  links: PartnerAffiliateLink[];
  recentCommissions: Array<{ id: string; amount: number; status: string; createdAt: string; customerName: string; membershipName: string }>;
};

type Membership = { id: string; name: string; price: number };

export default function Partners({ viewMode = "admin" }: { viewMode?: ViewMode }) {
  // ── Admin State ────────────────────────────────────────────────────────────
  const [partners, setPartners] = useState<Partner[]>([]);
  const [commissions, setCommissions] = useState<PartnerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadLogoError, setUploadLogoError] = useState<string | null>(null);
  const [tab, setTab] = useState<"partners" | "commissions">("partners");

  // Admin modal
  const [modal, setModal] = useState<Partial<Partner & { email: string; password: string }> | null>(null);
  const isNew = !modal?.id;

  // ── Partner Portal State ───────────────────────────────────────────────────
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [portalTab, setPortalTab] = useState<"codes" | "links" | "commissions">("codes");

  // Code form
  const [codeForm, setCodeForm] = useState({ code: "", discountType: "percentage", discountValue: "", maxUsage: "", expiresAt: "" });
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeError, setCodeError] = useState("");

  // Link form
  const [linkForm, setLinkForm] = useState({ membershipId: "", label: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/admin/partners", { cache: "no-store" }),
        fetch("/api/partner/commissions", { cache: "no-store" }),
      ]);
      const p = await pRes.json().catch(() => []);
      const c = await cRes.json().catch(() => []);
      setPartners(Array.isArray(p) ? p : []);
      setCommissions(Array.isArray(c) ? c : []);
    } finally { setLoading(false); }
  }, []);

  const loadPartnerPortal = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, mRes] = await Promise.all([
        fetch("/api/partner/dashboard", { cache: "no-store" }),
        fetch("/api/admin/memberships", { cache: "no-store" }),
      ]);
      const d = await dRes.json().catch(() => null);
      const m = await mRes.json().catch(() => []);
      if (d && !d.error) setDashboard(d);
      setMemberships(Array.isArray(m) ? m.filter((x: { active?: boolean }) => x.active !== false) : []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (viewMode === "admin") void loadAdmin();
    else void loadPartnerPortal();
  }, [viewMode, loadAdmin, loadPartnerPortal]);

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { window.alert((data as { error?: string }).error ?? "حدث خطأ."); return; }
      setModal(null);
      void loadAdmin();
    } finally { setSaving(false); }
  };

  const deletePartner = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الشريك وحسابه؟")) return;
    await fetch("/api/admin/partners", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void loadAdmin();
  };

  const markCommissionPaid = async (id: string, current: string) => {
    const next = current === "pending" ? "paid" : "pending";
    await fetch("/api/partner/commissions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    void loadAdmin();
  };

  // ── Partner Portal Actions ─────────────────────────────────────────────────
  const createCode = async () => {
    if (!codeForm.discountValue) { setCodeError("قيمة الخصم مطلوبة."); return; }
    setCodeSaving(true); setCodeError("");
    try {
      const res = await fetch("/api/partner/codes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeForm.code || undefined,
          discountType: codeForm.discountType,
          discountValue: Number(codeForm.discountValue),
          maxUsage: codeForm.maxUsage ? Number(codeForm.maxUsage) : null,
          expiresAt: codeForm.expiresAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCodeError((data as { error?: string }).error ?? "حدث خطأ."); return; }
      setCodeForm({ code: "", discountType: "percentage", discountValue: "", maxUsage: "", expiresAt: "" });
      void loadPartnerPortal();
    } finally { setCodeSaving(false); }
  };

  const toggleCode = async (id: string, current: boolean) => {
    await fetch("/api/partner/codes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: !current }),
    });
    void loadPartnerPortal();
  };

  const deleteCode = async (id: string) => {
    if (!window.confirm("حذف الكود؟")) return;
    await fetch("/api/partner/codes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    void loadPartnerPortal();
  };

  const createLink = async () => {
    if (!linkForm.membershipId) { setLinkError("يجب اختيار الاشتراك."); return; }
    setLinkSaving(true); setLinkError("");
    try {
      const res = await fetch("/api/partner/links", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: linkForm.membershipId, label: linkForm.label || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setLinkError((data as { error?: string }).error ?? "حدث خطأ."); return; }
      setLinkForm({ membershipId: "", label: "" });
      void loadPartnerPortal();
    } finally { setLinkSaving(false); }
  };

  const copyLink = (token: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}/subscribe?ref=${token}`);
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
    if (!dashboard) return <div className="py-20 text-center text-sm text-gray-500">لم يتم العثور على ملف الشريك.</div>;

    const { stats, codes, links, recentCommissions } = dashboard;

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "عملاء منضمون", value: stats.totalCustomers, color: "text-emerald-300" },
            { label: "عمولة معلقة", value: `${stats.totalCommissionPending.toFixed(0)} ج.م`, color: "text-yellow-300" },
            { label: "عمولة مُستلمة", value: `${stats.totalCommissionPaid.toFixed(0)} ج.م`, color: "text-pink-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">{s.label}</div>
              <div className={`mt-2 text-3xl font-black ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-800 pb-1">
          {([["codes", "أكواد الخصم"], ["links", "روابط التسجيل"], ["commissions", "العمولات"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setPortalTab(key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${portalTab === key ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Codes Tab ── */}
        {portalTab === "codes" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 space-y-4">
              <h3 className="font-black text-white">إنشاء كود خصم جديد</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">الكود (اتركه فارغاً للتوليد التلقائي)</label>
                  <input value={codeForm.code} onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value.toUpperCase() })}
                    className={INPUT} placeholder="مثال: SALON20" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">نوع الخصم</label>
                  <select value={codeForm.discountType} onChange={(e) => setCodeForm({ ...codeForm, discountType: e.target.value })} className={INPUT}>
                    <option value="percentage">نسبة مئوية %</option>
                    <option value="fixed">مبلغ ثابت ج.م</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">القيمة *</label>
                  <input type="number" value={codeForm.discountValue} onChange={(e) => setCodeForm({ ...codeForm, discountValue: e.target.value })}
                    className={INPUT} placeholder={codeForm.discountType === "percentage" ? "مثال: 15" : "مثال: 100"} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">الحد الأقصى للاستخدام (اختياري)</label>
                  <input type="number" value={codeForm.maxUsage} onChange={(e) => setCodeForm({ ...codeForm, maxUsage: e.target.value })}
                    className={INPUT} placeholder="غير محدود إذا تُرك فارغاً" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">تاريخ الانتهاء (اختياري)</label>
                  <input type="date" value={codeForm.expiresAt} onChange={(e) => setCodeForm({ ...codeForm, expiresAt: e.target.value })} className={INPUT} />
                </div>
              </div>
              {codeError && <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-xs text-red-300">{codeError}</div>}
              <button onClick={() => void createCode()} disabled={codeSaving}
                className="rounded-xl bg-pink-600 px-6 py-2.5 font-black text-white disabled:opacity-50">
                {codeSaving ? "جارٍ الإنشاء..." : "إنشاء الكود"}
              </button>
            </div>

            <div className="space-y-3">
              {codes.length === 0 && <div className="py-8 text-center text-sm text-gray-500">لا توجد أكواد بعد.</div>}
              {codes.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="space-y-1">
                    <div className="font-mono text-xl font-black text-pink-300">{c.code}</div>
                    <div className="text-xs text-gray-400">
                      خصم {c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue} ج.م`}
                      {c.maxUsage ? ` · حد ${c.maxUsage}` : " · غير محدود"}
                      {c.expiresAt ? ` · ينتهي ${c.expiresAt.slice(0, 10)}` : ""}
                    </div>
                    <div className="text-xs text-gray-500">مرّات الاستخدام: <span className="font-bold text-white">{c.usageCount}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.isActive ? "bg-emerald-900/40 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                      {c.isActive ? "نشط" : "معطل"}
                    </span>
                    <button onClick={() => void toggleCode(c.id, c.isActive)}
                      className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-300">
                      {c.isActive ? "تعطيل" : "تفعيل"}
                    </button>
                    {c.usageCount === 0 && (
                      <button onClick={() => void deleteCode(c.id)} className="rounded-lg bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300">حذف</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Links Tab ── */}
        {portalTab === "links" && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-700 bg-gray-900/60 p-5 space-y-4">
              <h3 className="font-black text-white">إنشاء رابط اشتراك تابع</h3>
              <p className="text-xs leading-6 text-gray-400">
                اختر الاشتراك الذي تريد الترويج له. سيحصل العميل الذي يسجل عن طريق رابطك على نفس العرض المعتاد، وستحصل على عمولتك تلقائياً عند إتمام الدفع.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">الاشتراك *</label>
                  <select value={linkForm.membershipId} onChange={(e) => setLinkForm({ ...linkForm, membershipId: e.target.value })} className={INPUT}>
                    <option value="">اختر الاشتراك...</option>
                    {memberships.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} — {m.price} ج.م</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">وصف داخلي (اختياري)</label>
                  <input value={linkForm.label} onChange={(e) => setLinkForm({ ...linkForm, label: e.target.value })}
                    className={INPUT} placeholder="مثال: رابط انستجرام" />
                </div>
              </div>
              {linkError && <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-xs text-red-300">{linkError}</div>}
              <button onClick={() => void createLink()} disabled={linkSaving}
                className="rounded-xl bg-pink-600 px-6 py-2.5 font-black text-white disabled:opacity-50">
                {linkSaving ? "جارٍ الإنشاء..." : "إنشاء الرابط"}
              </button>
            </div>

            <div className="space-y-3">
              {links.length === 0 && <div className="py-8 text-center text-sm text-gray-500">لا توجد روابط بعد.</div>}
              {links.map((l) => (
                <div key={l.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{l.membershipName}</div>
                      {l.label && <div className="text-xs text-gray-400">{l.label}</div>}
                      <div className="mt-1 text-xs text-gray-500">نقرات: <span className="font-bold text-white">{l.clickCount}</span></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(l.token)}
                        className="rounded-lg bg-emerald-900/40 px-3 py-1.5 text-xs font-bold text-emerald-300">📋 نسخ الرابط</button>
                      <button onClick={() => void deleteLink(l.id)}
                        className="rounded-lg bg-red-950/50 px-3 py-1.5 text-xs font-bold text-red-300">حذف</button>
                    </div>
                  </div>
                  <div dir="ltr" className="rounded-lg bg-black/30 px-3 py-2 text-xs font-mono text-gray-400 break-all">
                    {typeof window !== "undefined" ? window.location.origin : ""}/subscribe?ref={l.token}
                  </div>
                </div>
              ))}
            </div>
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
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-lg font-black text-emerald-300">{c.amount.toFixed(0)} ج.م</div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "paid" ? "bg-emerald-900/40 text-emerald-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                    {c.status === "paid" ? "مُستلمة" : "معلقة"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-1">
        {([["partners", "الشركاء"], ["commissions", "العمولات المالية"]] as const).map(([key, label]) => (
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
            <button onClick={() => setModal({ commissionRate: 10, commissionType: "percentage", isActive: true, showOnPublicPage: true })}
              className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">+ شريك جديد</button>
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
                    { label: "مدفوعة", val: `${p.totalCommissionPaid.toFixed(0)} ج`, color: "text-emerald-300" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className={`font-black text-white ${s.color ?? ""}`}>{s.val}</div>
                      <div>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setModal({ ...p })}
                    className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs font-bold text-white">تعديل</button>
                  <button onClick={() => void deletePartner(p.id)}
                    className="rounded-lg bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300">حذف</button>
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
              <div className="mt-2 text-2xl font-black text-white">{(totalPending + totalPaid).toFixed(0)} ج.م</div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">عمولات معلقة</div>
              <div className="mt-2 text-2xl font-black text-yellow-300">{totalPending.toFixed(0)} ج.م</div>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="text-sm text-gray-400">عمولات مدفوعة</div>
              <div className="mt-2 text-2xl font-black text-emerald-300">{totalPaid.toFixed(0)} ج.م</div>
            </div>
          </div>

          {commissions.length === 0 && <div className="py-16 text-center text-sm text-gray-500">لا توجد عمولات بعد.</div>}

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
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {commissions.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-bold text-white">{c.partnerName}</td>
                    <td className="px-4 py-3">
                      <div className="text-white">{c.customerName}</div>
                      <div className="text-xs text-gray-500">{c.customerEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{c.membershipName}</td>
                    <td className="px-4 py-3 font-black text-emerald-300">{c.amount.toFixed(0)} ج.م</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "paid" ? "bg-emerald-900/30 text-emerald-300" : "bg-yellow-900/30 text-yellow-300"}`}>
                        {c.status === "paid" ? "مدفوعة" : "معلقة"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{c.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => void markCommissionPaid(c.id, c.status)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${c.status === "pending" ? "bg-emerald-900/40 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                        {c.status === "pending" ? "تسجيل كمدفوعة" : "إعادة تعليق"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadLogo(f);
                    e.currentTarget.value = "";
                  }}
                  className="block w-full text-sm text-[#d7aabd] file:ml-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
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
