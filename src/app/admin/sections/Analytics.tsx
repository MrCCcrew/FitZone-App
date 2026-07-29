"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { analyticsDisplayNumber, analyticsQuery, analyticsSectionErrorLabels, loadAdminAnalytics, resolveAdminAnalyticsLoad, type AnalyticsFilters } from "@/lib/analytics/admin-client";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type Overview = { traffic: { visitors: number; sessions: number; pageViews: number; bounceRate: number; averageSessionDuration: number }; business: { checkoutStarted: number; paymentSucceeded: number; membershipActivated: number }; revenue: { successfulPaymentValue: number | null; averageSuccessfulPaymentValue: number | null; currencyBreakdown: { currency: string; value: number; payments: number; averageValue: number }[] } };
type Traffic = { daily: { date: string; visitors: number; sessions: number; pageViews: number; averageDuration: number; bounceRate: number }[]; topPages: { path: string; views: number; uniqueVisitors: number; averageDuration: number; exits: number }[]; landingPages: { path: string; count: number }[]; exitPages: { path: string; count: number }[]; topReferrers: { referrer: string; count: number }[] };
type Events = { totalsByEventName: { eventName: string; count: number }[]; topEntities: { entityType: string | null; entityName: string | null; count: number; successfulValue: number }[]; paymentMethodBreakdown: { paymentMethodType: string; count: number }[]; failureCategoryBreakdown: { failureCategory: string; count: number }[] };
type Conversions = { definition: string; membershipFunnel: { views: number; checkoutStarted: number; paymentSucceeded: number; membershipActivated: number; viewToCheckoutRate: number; checkoutToPaymentRate: number; paymentToActivationRate: number }; storeFunnel: { checkoutStarted: number; paymentSucceeded: number; totalRate: number } };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const initialFilters = (): AnalyticsFilters => {
  if (typeof window === "undefined") return { from: daysAgo(29), to: today(), timezone: "Asia/Kuwait" };
  const params = new URLSearchParams(window.location.search);
  return { from: params.get("from") ?? daysAgo(29), to: params.get("to") ?? today(), timezone: params.get("timezone") ?? "Asia/Kuwait" };
};
const count = (value: number) => value.toLocaleString("ar-EG");
const duration = (value: number) => `${Math.floor(value / 60)} د ${Math.round(value % 60)} ث`;
const rate = (value: number) => `${Number.isFinite(value) ? Math.min(value, 100).toFixed(2).replace(/\.00$/, "") : "0"}%`;

const eventLabel = (eventName: string) => ({
  subscription_viewed: "مشاهدة الاشتراك",
  package_viewed: "مشاهدة الباقة",
  offer_viewed: "مشاهدة العرض",
  checkout_started: "بدء الدفع",
  payment_succeeded: "الدفع الناجح",
  payment_failed: "فشل الدفع",
  membership_activated: "تفعيل العضوية",
}[eventName] ?? eventName);

const entityTypeLabel = (entityType: string | null) => ({
  subscription: "اشتراك",
  package: "باقة",
  offer: "عرض",
  order: "طلب متجر",
}[entityType ?? ""] ?? "—");

const paymentMethodLabel = (paymentMethod: string) => ({
  card: "بطاقة",
  wallet: "محفظة",
  bnpl: "اشترِ الآن وادفع لاحقًا",
  cash: "نقدًا",
  unknown: "غير معروف",
}[paymentMethod] ?? paymentMethod);

const failureCategoryLabel = (category: string) => ({
  cancelled: "ملغي",
  expired: "منتهي",
  unknown: "غير معروف",
}[category] ?? category);

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <AdminCard><div className="text-2xl font-black text-[#ff97bf]">{value}</div><div className="mt-2 text-sm font-bold text-[#fff4f8]">{label}</div>{hint ? <div className="mt-1 text-xs text-[#d7aabd]">{hint}</div> : null}</AdminCard>;
}
function SimpleTable({ title, columns, rows }: { title: string; columns: string[]; rows: (string | number)[][] }) {
  return <AdminCard><h3 className="mb-4 font-black text-[#fff4f8]">{title}</h3>{rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-right text-sm"><thead className="border-b border-white/10 text-[#d7aabd]"><tr>{columns.map((column) => <th className="px-2 py-2" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className="border-b border-white/5 text-[#fff4f8]" key={index}>{row.map((cell, cellIndex) => <td className="px-2 py-3" key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <AdminEmptyState title="لا توجد بيانات" description="لا توجد بيانات ضمن الفترة المختارة." />}</AdminCard>;
}

export default function Analytics() {
  const [draft, setDraft] = useState<AnalyticsFilters>(initialFilters);
  const [filters, setFilters] = useState<AnalyticsFilters>(initialFilters);
  const [data, setData] = useState<{ overview?: Overview; traffic?: Traffic; events?: Events; conversions?: Conversions }>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (next = filters) => {
    if (!next.from || !next.to || next.from > next.to) { setErrors(["يرجى اختيار نطاق تاريخ صحيح."]); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current; setLoading(true); setErrors([]);
    try {
      const result = await loadAdminAnalytics(next, current.signal); if (current.signal.aborted) return;
      const { payload, failedSections } = resolveAdminAnalyticsLoad(result);
      setData(payload as typeof data); setErrors(failedSections.map((section) => analyticsSectionErrorLabels[section]));
    } catch (error) { if (!current.signal.aborted) { setData({}); setErrors(["تعذر تحميل بيانات التحليلات. حاول مرة أخرى."]); } }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(filters); return () => controller.current?.abort(); }, []); // initial request only
  const apply = () => { setFilters(draft); const query = analyticsQuery(draft); window.history.replaceState(null, "", `${window.location.pathname}?${query}`); void load(draft); };
  const preset = (days: number) => setDraft({ ...draft, from: daysAgo(days - 1), to: today() });
  const thisMonth = () => { const now = new Date(); setDraft({ ...draft, from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: today() }); };
  const overview = data.overview, traffic = data.traffic, events = data.events, conversions = data.conversions;
  const funnel = useMemo(() => conversions ? [{ name: "المشاهدات", count: conversions.membershipFunnel.views }, { name: "بدء الدفع", count: conversions.membershipFunnel.checkoutStarted }, { name: "الدفع الناجح", count: conversions.membershipFunnel.paymentSucceeded }, { name: "تفعيل العضوية", count: conversions.membershipFunnel.membershipActivated }] : [], [conversions]);
  return <AdminSectionShell title="تحليلات الموقع" subtitle="مؤشرات مجمعة، مع مسار تحويل مبني على الأحداث وليس على مستخدمين فريدين." actions={errors.length ? <button onClick={() => void load(filters)} className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">إعادة المحاولة</button> : null}>
    <AdminCard><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm text-[#d7aabd]">من<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 w-full rounded-lg bg-black/20 p-2 text-white" /></label><label className="text-sm text-[#d7aabd]">إلى<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 w-full rounded-lg bg-black/20 p-2 text-white" /></label><label className="text-sm text-[#d7aabd]">المنطقة الزمنية<select value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })} className="mt-1 w-full rounded-lg bg-black/20 p-2 text-white"><option>Asia/Kuwait</option><option>UTC</option></select></label><label className="text-sm text-[#d7aabd]">المصدر (اختياري)<input value={draft.source ?? ""} onChange={(e) => setDraft({ ...draft, source: e.target.value || undefined })} className="mt-1 w-full rounded-lg bg-black/20 p-2 text-white" /></label><div className="flex items-end gap-2"><button onClick={apply} className="rounded-xl bg-pink-600 px-4 py-2 font-bold text-white">تطبيق</button><button onClick={() => setDraft({ from: daysAgo(29), to: today(), timezone: "Asia/Kuwait" })} className="rounded-xl border border-white/15 px-3 py-2">إعادة ضبط</button></div></div><div className="mt-3 flex flex-wrap gap-2">{[[1,"اليوم"],[7,"آخر 7 أيام"],[30,"آخر 30 يومًا"]].map(([days, label]) => <button key={String(days)} onClick={() => preset(Number(days))} className="rounded-full bg-white/10 px-3 py-1 text-xs">{label}</button>)}<button onClick={thisMonth} className="rounded-full bg-white/10 px-3 py-1 text-xs">هذا الشهر</button></div></AdminCard>
    {errors.map((error) => <div key={error} className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{error}</div>)}
    {loading && !overview ? <AdminCard className="h-52 animate-pulse bg-white/10"><span className="sr-only">جارٍ التحميل</span></AdminCard> : <>
      {overview ? <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="الزوار" value={count(overview.traffic.visitors)} /><Metric label="الجلسات" value={count(overview.traffic.sessions)} /><Metric label="مشاهدات الصفحة" value={count(overview.traffic.pageViews)} /><Metric label="معدل الارتداد" value={rate(overview.traffic.bounceRate)} /><Metric label="متوسط الجلسة" value={duration(overview.traffic.averageSessionDuration)} /><Metric label="بدء الدفع" value={count(overview.business.checkoutStarted)} /><Metric label="دفع ناجح" value={count(overview.business.paymentSucceeded)} /><Metric label="عضويات مفعلة" value={count(overview.business.membershipActivated)} /></div><div className="grid gap-4 lg:grid-cols-2">{overview.revenue.currencyBreakdown.length ? overview.revenue.currencyBreakdown.map((entry) => <Metric key={entry.currency} label={`إيراد ناجح (${entry.currency})`} value={`${count(analyticsDisplayNumber(entry.value))} ${entry.currency}`} hint={`المتوسط: ${count(analyticsDisplayNumber(entry.averageValue))} ${entry.currency}`} />) : <AdminCard><AdminEmptyState title="لا توجد إيرادات" description="لا توجد مدفوعات ناجحة ضمن الفترة." /></AdminCard>}</div></> : null}
      {traffic ? <AdminCard><h3 className="mb-4 font-black">الزيارات اليومية</h3><div className="h-72" dir="ltr"><ResponsiveContainer><LineChart data={traffic.daily}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff22" /><XAxis dataKey="date" /><YAxis /><Tooltip /><Legend /><Line type="monotone" dataKey="visitors" name="الزوار" stroke="#ff4f93" /><Line type="monotone" dataKey="sessions" name="الجلسات" stroke="#f8b94d" /><Line type="monotone" dataKey="pageViews" name="مشاهدات الصفحة" stroke="#8b5cf6" /></LineChart></ResponsiveContainer></div></AdminCard> : null}
      {conversions ? <div className="grid gap-4 lg:grid-cols-2"><AdminCard><h3 className="font-black">مسار العضوية</h3><p className="mt-1 text-xs text-[#d7aabd]">مسار التحويل المبني على الأحداث</p><div className="h-64" dir="ltr"><ResponsiveContainer><BarChart data={funnel}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="count" name="العدد" fill="#ff4f93" radius={[8,8,0,0]} /></BarChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-2 text-center text-xs"><span>من المشاهدة إلى بدء الدفع {rate(conversions.membershipFunnel.viewToCheckoutRate)}</span><span>من بدء الدفع إلى نجاح الدفع {rate(conversions.membershipFunnel.checkoutToPaymentRate)}</span><span>من نجاح الدفع إلى تفعيل العضوية {rate(conversions.membershipFunnel.paymentToActivationRate)}</span></div></AdminCard><AdminCard><h3 className="font-black">مسار المتجر المنفصل</h3><p className="mt-4 text-sm">بدء طلب المتجر: <b>{count(conversions.storeFunnel.checkoutStarted)}</b></p><p className="mt-2 text-sm">نجاح دفع طلب المتجر: <b>{count(conversions.storeFunnel.paymentSucceeded)}</b></p><p className="mt-2 text-xs text-[#d7aabd]">التحويل: {rate(conversions.storeFunnel.totalRate)}</p></AdminCard></div> : null}
      {traffic ? <div className="grid gap-4 xl:grid-cols-2"><SimpleTable title="أهم الصفحات" columns={["المسار","المشاهدات","زوار فريدون","متوسط المدة","الخروج"]} rows={traffic.topPages.map((entry) => [entry.path, count(entry.views), count(entry.uniqueVisitors), duration(entry.averageDuration), count(entry.exits)])} /><SimpleTable title="صفحات الدخول" columns={["المسار","العدد"]} rows={traffic.landingPages.map((entry) => [entry.path, count(entry.count)])} /><SimpleTable title="صفحات الخروج" columns={["المسار","العدد"]} rows={traffic.exitPages.map((entry) => [entry.path, count(entry.count)])} /><SimpleTable title="أهم المراجع" columns={["المرجع","العدد"]} rows={traffic.topReferrers.map((entry) => [entry.referrer, count(entry.count)])} /></div> : null}
      {events ? <div className="grid gap-4 xl:grid-cols-2"><SimpleTable title="إجمالي الأحداث" columns={["الحدث","العدد"]} rows={events.totalsByEventName.map((entry) => [eventLabel(entry.eventName), count(entry.count)])} /><SimpleTable title="أهم الكيانات" columns={["النوع","الاسم","العدد","قيمة ناجحة"]} rows={events.topEntities.map((entry) => [entityTypeLabel(entry.entityType), entry.entityName ?? "—", count(entry.count), count(entry.successfulValue)])} /><SimpleTable title="طرق الدفع" columns={["الطريقة","العدد"]} rows={events.paymentMethodBreakdown.map((entry) => [paymentMethodLabel(entry.paymentMethodType), count(entry.count)])} /><SimpleTable title="فئات الفشل" columns={["الفئة","العدد"]} rows={events.failureCategoryBreakdown.map((entry) => [failureCategoryLabel(entry.failureCategory), count(entry.count)])} /></div> : null}
    </>}
  </AdminSectionShell>;
}
