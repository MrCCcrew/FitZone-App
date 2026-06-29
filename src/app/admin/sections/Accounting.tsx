"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { AdminSectionShell, AdminCard, AdminEmptyState } from "./shared";
import {
  printStoreReport, printClubReport,
  printSalesInvoice, printPurchaseInvoice,
} from "@/lib/print-pdf";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreSummary {
  grossSales: number;
  returnsTotal: number;
  salesRevenue: number;
  vatCollected: number;
  shippingRevenue: number;
  discountsGranted: number;
  purchaseInvoicesTotal: number;
  cogs: number;
  expenseTotal: number;
  feeTotal: number;
  grossProfit: number;
  netProfit: number;
  orderCount: number;
  returnCount: number;
  purchaseInvoiceCount: number;
}

interface ClubSummary {
  membershipRevenue: number;
  bookingRevenue: number;
  totalRevenue: number;
  walletTopupCollected: number;
  walletTopupCount: number;
  walletBonusCost: number;
  redeemedPointsCost: number;
  currentPointsLiability: number;
  expenseTotal: number;
  feeTotal: number;
  partnerCommissionsPending: number;
  partnerCommissionsWithdrawn: number;
  partnerCommissionsTotal: number;
  agentCommissionsPending: number;
  agentCommissionsSettled: number;
  agentCommissionsTotal: number;
  clubDiscountsGranted: number;
  grossProfit: number;
  netProfit: number;
  membershipCount: number;
  bookingCount: number;
}

interface SaleRow {
  id: string;
  date: string;
  customerName: string;
  items: string;
  paymentMethod: string;
  total: number;
  vatTotal: number;
  shippingFee: number;
  subtotal: number;
  status: string;
}

interface PurchaseRow {
  id: string;
  date: string;
  referenceNumber: string | null;
  supplierName: string | null;
  totalCost: number;
  items: { productName: string; quantity: number; unitCost: number; totalCost: number }[];
}

interface MembershipRow {
  id: string;
  date: string;
  customerName: string;
  membershipName: string;
  paymentAmount: number;
  paymentMethod: string;
  walletBonus: number;
  status: string;
  offerTitle: string | null;
}

interface BookingRow {
  id: string;
  date: string;
  customerName: string;
  className: string;
  paymentMethod: string;
  paidAmount: number;
  status: string;
}

interface ExpenseRow {
  id: string;
  businessUnit: string;
  category: string;
  label: string;
  description?: string | null;
  amount: number;
  vendor?: string | null;
  referenceNumber?: string | null;
  expenseDate: string;
  createdAt: string;
}

interface FeeRule {
  id: string;
  businessUnit: string;
  category: string;
  label: string;
  appliesToPurpose: string;
  provider: string | null;
  paymentMethod: string | null;
  rateType: string;
  rateValue: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ReturnRow {
  id: string;
  date: string;
  customerName: string;
  items: string;
  paymentMethod: string;
  total: number;
}

interface AccountingData {
  range: { from: string | null; to: string | null };
  feeRules: FeeRule[];
  expenses: ExpenseRow[];
  store: {
    summary: StoreSummary;
    sales: SaleRow[];
    returns: ReturnRow[];
    purchases: PurchaseRow[];
    expenses: ExpenseRow[];
    feeBreakdown: { label: string; amount: number }[];
  };
  club: {
    summary: ClubSummary;
    memberships: MembershipRow[];
    bookings: BookingRow[];
    expenses: ExpenseRow[];
    rewards: { pointValueEGP: number; currentPointsLiability: number; redeemedPointsCost: number };
    feeBreakdown: { label: string; amount: number }[];
  };
  contracts: {
    summary: {
      salesAgentPending: number;
      salesAgentSettled: number;
      managerAgentPending: number;
      managerAgentSettled: number;
      managerPartnerPending: number;
      managerPartnerSettled: number;
    };
    salesAgentCommissions: ContractAgentCommissionRow[];
    managerCommissions: ContractManagerCommissionRow[];
    managerPartnerCommissions: ContractManagerPartnerCommissionRow[];
    managers: ContractManagerAccountingRow[];
  };
}

interface ContractAgentCommissionRow {
  id: string;
  agentName: string;
  managerName: string | null;
  customerName: string;
  customerEmail: string;
  membershipName: string;
  amount: number;
  status: "earned" | "settled";
  settledAt: string | null;
  createdAt: string;
}

interface ContractManagerCommissionRow {
  id: string;
  managerName: string;
  agentName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  membershipName: string | null;
  amount: number;
  status: "earned" | "settled";
  settledAt: string | null;
  createdAt: string;
}

interface ContractManagerPartnerCommissionRow {
  id: string;
  managerName: string;
  partnerName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  membershipName: string | null;
  amount: number;
  status: "earned" | "settled";
  settledAt: string | null;
  createdAt: string;
}

interface ContractManagerAccountingRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  agents: { id: string; name: string; email: string; phone: string | null; totalEarned: number; pendingCommission: number; settledCommission: number }[];
  partners: { id: string; name: string; email: string; phone: string | null; totalCommissionPending: number; totalCommissionPaid: number }[];
  pendingCommission: number;
  settledCommission: number;
  pendingPartnerCommission: number;
  settledPartnerCommission: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT = "w-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,188,219,0.2)] focus:border-pink-400 rounded-xl px-4 py-2.5 text-[#fff4f8] text-sm outline-none transition-colors placeholder:text-[#a07080] [&_option]:bg-[#2a0f1b]";
const LABEL = "block text-xs font-bold text-[#d7aabd] mb-1";
const BTN_PRIMARY = "rounded-xl bg-[#E91E63] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#C2185B] disabled:opacity-50";
const BTN_GHOST = "rounded-xl border border-[rgba(255,188,219,0.2)] px-3 py-1.5 text-xs font-bold text-[#d7aabd] transition-colors hover:border-pink-400 hover:text-white";

const fmt = (n: number) =>
  n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("ar-EG");

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-[rgba(255,255,255,.04)] p-4">
      <p className="mb-1 text-xs text-[#a07080]">{label}</p>
      <p className={`text-xl font-black ${color ?? "text-[#fff4f8]"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#a07080]">{sub}</p>}
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-sm font-black text-[#fff4f8]">{title}</span>
      <div className="flex-1 h-px bg-[rgba(255,188,219,0.12)]" />
    </div>
  );
}

const PER_PAGE = 10;

function PaginationBar({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2 text-sm text-[#d7aabd]">
      <span>{total} سجل · صفحة {page} من {totalPages}</span>
      <div className="flex gap-2">
        <button className={BTN_GHOST} onClick={() => onPage(page - 1)} disabled={page <= 1}>السابق</button>
        <button className={BTN_GHOST} onClick={() => onPage(page + 1)} disabled={page >= totalPages}>التالي</button>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-2xl border border-[rgba(255,188,219,0.2)] bg-[rgba(40,10,22,0.97)] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-[#fff4f8]">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-[#a07080] hover:text-white">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Add Expense Form ─────────────────────────────────────────────────────────

const EMPTY_EXPENSE = { businessUnit: "store", category: "general", label: "", amount: "", vendor: "", referenceNumber: "", expenseDate: new Date().toISOString().slice(0, 10), description: "" };

const EXPENSE_CATEGORIES = [
  { value: "general", label: "عام" },
  { value: "rent", label: "إيجار" },
  { value: "salary", label: "رواتب" },
  { value: "utilities", label: "مرافق (كهرباء/مياه)" },
  { value: "marketing", label: "تسويق وإعلان" },
  { value: "maintenance", label: "صيانة" },
  { value: "supplies", label: "مستلزمات" },
  { value: "transport", label: "نقل وشحن" },
  { value: "other", label: "أخرى" },
];

function AddExpenseModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({ ...EMPTY_EXPENSE });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.label.trim()) { setErr("اسم المصروف مطلوب"); return; }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) { setErr("المبلغ مطلوب"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "expense",
          payload: { ...form, amount: Number(form.amount) },
        }),
      });
      if (!res.ok) { setErr("حدث خطأ أثناء الحفظ"); return; }
      onSave();
      onClose();
    } catch { setErr("تعذر الحفظ"); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="إضافة مصروف جديد" onClose={onClose}>
      {err && <div className="mb-4 rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-3 text-sm text-red-300">{err}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>القطاع</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.businessUnit} onChange={f("businessUnit")}>
              <option value="store">المتجر</option>
              <option value="club">الجيم</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>التصنيف</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.category} onChange={f("category")}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL}>اسم المصروف *</label>
          <input className={INPUT} value={form.label} onChange={f("label")} placeholder="مثال: إيجار شهر يونيو" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>المبلغ (جنيه) *</label>
            <input className={INPUT} type="number" min="0" step="0.01" value={form.amount} onChange={f("amount")} placeholder="0.00" />
          </div>
          <div>
            <label className={LABEL}>التاريخ</label>
            <input className={INPUT} type="date" value={form.expenseDate} onChange={f("expenseDate")} />
          </div>
        </div>
        <div>
          <label className={LABEL}>المورد / الجهة</label>
          <input className={INPUT} value={form.vendor} onChange={f("vendor")} placeholder="اختياري" />
        </div>
        <div>
          <label className={LABEL}>رقم المرجع / الفاتورة</label>
          <input className={INPUT} value={form.referenceNumber} onChange={f("referenceNumber")} placeholder="اختياري" />
        </div>
        <div>
          <label className={LABEL}>ملاحظات</label>
          <textarea className={INPUT} rows={2} value={form.description} onChange={f("description")} placeholder="اختياري" />
        </div>
        <div className="flex gap-3 pt-2">
          <button className={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ المصروف"}
          </button>
          <button className={BTN_GHOST} onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add Fee Rule Form ────────────────────────────────────────────────────────

const EMPTY_RULE = { businessUnit: "store", category: "platform", label: "", appliesToPurpose: "all", provider: "", paymentMethod: "", rateType: "percentage", rateValue: "", notes: "", isActive: true };

const PURPOSE_OPTIONS = [
  { value: "all", label: "كل العمليات" },
  { value: "order", label: "طلبات المتجر" },
  { value: "membership", label: "اشتراكات الجيم" },
  { value: "booking", label: "حجوزات الكلاسات" },
  { value: "wallet_topup", label: "شحن المحفظة" },
];

function AddFeeRuleModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({ ...EMPTY_RULE });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const handleSave = async () => {
    if (!form.label.trim()) { setErr("اسم القاعدة مطلوب"); return; }
    if (!form.rateValue || isNaN(Number(form.rateValue))) { setErr("النسبة/القيمة مطلوبة"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "feeRule",
          payload: { ...form, rateValue: Number(form.rateValue) },
        }),
      });
      if (!res.ok) { setErr("حدث خطأ أثناء الحفظ"); return; }
      onSave();
      onClose();
    } catch { setErr("تعذر الحفظ"); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="إضافة قاعدة عمولة / رسوم" onClose={onClose}>
      {err && <div className="mb-4 rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-3 text-sm text-red-300">{err}</div>}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>ينطبق على</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.businessUnit} onChange={f("businessUnit")}>
              <option value="store">المتجر فقط</option>
              <option value="club">الجيم فقط</option>
              <option value="both">الاثنين</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>نوع الرسوم</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.category} onChange={f("category")}>
              <option value="platform">عمولة منصة</option>
              <option value="external_service">خدمة خارجية</option>
              <option value="other">أخرى</option>
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL}>اسم العمولة / الرسوم *</label>
          <input className={INPUT} value={form.label} onChange={f("label")} placeholder="مثال: عمولة انستاباي 2%" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>تنطبق على العملية</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.appliesToPurpose} onChange={f("appliesToPurpose")}>
              {PURPOSE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>طريقة الدفع (اختياري)</label>
            <input className={INPUT} value={form.paymentMethod} onChange={f("paymentMethod")} placeholder="مثال: instapay" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>نوع الاحتساب</label>
            <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={form.rateType} onChange={f("rateType")}>
              <option value="percentage">نسبة مئوية %</option>
              <option value="fixed">مبلغ ثابت (جنيه)</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>القيمة * {form.rateType === "percentage" ? "(%)" : "(جنيه)"}</label>
            <input className={INPUT} type="number" min="0" step="0.01" value={form.rateValue} onChange={f("rateValue")} placeholder="0" />
          </div>
        </div>
        <div>
          <label className={LABEL}>ملاحظات</label>
          <textarea className={INPUT} rows={2} value={form.notes} onChange={f("notes")} placeholder="اختياري" />
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 accent-pink-500" />
          <span className="text-sm text-[#d7aabd]">فعّال</span>
        </label>
        <div className="flex gap-3 pt-2">
          <button className={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ القاعدة"}
          </button>
          <button className={BTN_GHOST} onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Store Tab ────────────────────────────────────────────────────────────────

function StoreTab({ data, onRefresh, dateRange }: { data: AccountingData; onRefresh: () => void; dateRange: string }) {
  const s = data.store.summary;
  const [showExpense, setShowExpense] = useState(false);
  const [showFeeRule, setShowFeeRule] = useState(false);
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [pageSales, setPageSales] = useState(1);
  const [pagePurchases, setPagePurchases] = useState(1);
  const pagedSales = data.store.sales.slice((pageSales - 1) * PER_PAGE, pageSales * PER_PAGE);
  const pagedPurchases = data.store.purchases.slice((pagePurchases - 1) * PER_PAGE, pagePurchases * PER_PAGE);

  const [selSales, setSelSales] = useState<Set<string>>(new Set());
  const [selPurchases, setSelPurchases] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  useEffect(() => setSelSales(new Set()), [pageSales]);
  useEffect(() => setSelPurchases(new Set()), [pagePurchases]);

  const allSalesSelected = pagedSales.length > 0 && pagedSales.every(r => selSales.has(r.id));
  const someSalesSelected = !allSalesSelected && pagedSales.some(r => selSales.has(r.id));
  const toggleAllSales = () => setSelSales(prev => { const n = new Set(prev); if (allSalesSelected) pagedSales.forEach(r => n.delete(r.id)); else pagedSales.forEach(r => n.add(r.id)); return n; });
  const toggleSale = (id: string) => setSelSales(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteSales = async () => {
    if (!selSales.size || !confirm(`حذف ${selSales.size} فاتورة مبيعات نهائياً؟`)) return;
    setWorking(true);
    await Promise.all(Array.from(selSales).map(id => fetch("/api/admin/orders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })));
    setSelSales(new Set()); onRefresh(); setWorking(false);
  };

  const allPurchasesSelected = pagedPurchases.length > 0 && pagedPurchases.every(r => selPurchases.has(r.id));
  const somePurchasesSelected = !allPurchasesSelected && pagedPurchases.some(r => selPurchases.has(r.id));
  const toggleAllPurchases = () => setSelPurchases(prev => { const n = new Set(prev); if (allPurchasesSelected) pagedPurchases.forEach(r => n.delete(r.id)); else pagedPurchases.forEach(r => n.add(r.id)); return n; });
  const togglePurchase = (id: string) => setSelPurchases(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deletePurchases = async () => {
    if (!selPurchases.size || !confirm(`حذف ${selPurchases.size} فاتورة مشتريات نهائياً؟`)) return;
    setWorking(true);
    await Promise.all(Array.from(selPurchases).map(id => fetch("/api/admin/inventory/receipts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })));
    setSelPurchases(new Set()); onRefresh(); setWorking(false);
  };

  const salesAllRef = useRef<HTMLInputElement>(null);
  const purchasesAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (salesAllRef.current) salesAllRef.current.indeterminate = someSalesSelected; }, [someSalesSelected]);
  useEffect(() => { if (purchasesAllRef.current) purchasesAllRef.current.indeterminate = somePurchasesSelected; }, [somePurchasesSelected]);

  const handlePrintReport = () => printStoreReport({
    summary: s,
    sales: data.store.sales,
    returns: data.store.returns,
    purchases: data.store.purchases,
    expenses: data.store.expenses.map(e => ({ ...e, vendor: e.vendor ?? null })),
    dateRange,
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="إجمالي المبيعات (قبل المرتجعات)" value={`${fmt(s.grossSales)} ج`} sub={`${s.orderCount} طلب`} />
        <KpiCard label="المرتجعات" value={`− ${fmt(s.returnsTotal)} ج`} sub={`${s.returnCount} طلب مرتجع`} color="text-red-400" />
        <KpiCard label="صافي الإيرادات" value={`${fmt(s.salesRevenue)} ج`} color="text-emerald-400" />
        <KpiCard label="رسوم التوصيل" value={`${fmt(s.shippingRevenue)} ج`} />
      </div>
      {s.vatCollected > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="ضريبة القيمة المضافة المحصلة (14%)" value={`${fmt(s.vatCollected)} ج`} color="text-blue-400" sub="مجموع VAT من المنتجات الخاضعة للضريبة" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="تكلفة البضاعة (COGS)" value={`${fmt(s.cogs)} ج`} color="text-yellow-400" />
        <KpiCard label="إجمالي المشتريات" value={`${fmt(s.purchaseInvoicesTotal)} ج`} sub={`${s.purchaseInvoiceCount} فاتورة`} />
        <KpiCard label="المصاريف" value={`${fmt(s.expenseTotal)} ج`} color="text-red-400" />
        <KpiCard label="العمولات والرسوم" value={`${fmt(s.feeTotal)} ج`} color="text-orange-300" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[rgba(255,188,219,0.2)] bg-[rgba(255,255,255,.04)] p-5">
          <p className="mb-1 text-sm text-[#d7aabd]">إجمالي الربح</p>
          <p className={`text-2xl font-black ${s.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.grossProfit)} ج</p>
          <p className="mt-1 text-xs text-[#a07080]">= {fmt(s.salesRevenue)} صافي إيرادات − {fmt(s.cogs)} تكلفة بضاعة</p>
        </div>
        <div className="rounded-2xl border-2 border-[rgba(255,188,219,0.25)] bg-[rgba(255,255,255,.04)] p-5">
          <p className="mb-1 text-sm text-[#d7aabd]">صافي الربح</p>
          <p className={`text-3xl font-black ${s.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.netProfit)} ج</p>
          <p className="mt-1 text-xs text-[#a07080]">
            = {fmt(s.grossProfit)} إجمالي − {fmt(s.expenseTotal)} مصاريف − {fmt(s.feeTotal)} عمولات
          </p>
        </div>
      </div>

      {/* Print report button */}
      <div className="flex justify-end">
        <button className={BTN_PRIMARY} onClick={handlePrintReport}>🖨️ طباعة / تصدير PDF</button>
      </div>

      {/* Sales */}
      <SectionDivider title="فواتير المبيعات" />
      {selSales.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-sm">
          <span className="text-red-300">تم تحديد {selSales.size} سجل</span>
          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" onClick={deleteSales} disabled={working}>حذف المحدد</button>
        </div>
      )}
      <AdminCard>
        {data.store.sales.length === 0 ? <AdminEmptyState title="لا توجد مبيعات" description="لا توجد طلبات مؤكدة في هذه الفترة" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">العميل</th>
                  <th className="py-2 text-right font-bold">المنتجات</th>
                  <th className="py-2 text-right font-bold">الدفع</th>
                  <th className="py-2 text-right font-bold">ضريبة</th>
                  <th className="py-2 text-right font-bold">الإجمالي</th>
                  <th className="py-2 text-right font-bold">فاتورة</th>
                  <th className="py-2 text-center w-8"><input ref={salesAllRef} type="checkbox" checked={allSalesSelected} onChange={toggleAllSales} className="accent-[#E91E63] cursor-pointer" /></th>
                </tr>
              </thead>
              <tbody>
                {pagedSales.map(row => (
                  <tr key={row.id} className={`border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5 ${selSales.has(row.id) ? "bg-rose-950/20" : ""}`}>
                    <td className="py-2 text-[#d7aabd]">{fmtDate(row.date)}</td>
                    <td className="py-2 font-bold text-[#fff4f8]">{row.customerName}</td>
                    <td className="py-2 text-[#d7aabd] max-w-[160px] truncate">{row.items}</td>
                    <td className="py-2 text-[#d7aabd]">{row.paymentMethod}</td>
                    <td className="py-2 text-blue-400">{row.vatTotal > 0 ? `${fmt(row.vatTotal)} ج` : "—"}</td>
                    <td className="py-2 font-bold text-emerald-400">{fmt(row.total)} ج</td>
                    <td className="py-2">
                      <button className={BTN_GHOST} onClick={() => printSalesInvoice({
                        id: row.id, date: row.date, customerName: row.customerName,
                        paymentMethod: row.paymentMethod, subtotal: row.subtotal,
                        shippingFee: row.shippingFee, total: row.total,
                        items: row.items.split("، ").map(name => ({ productName: name, total: 0 })),
                      })}>🖨️</button>
                    </td>
                    <td className="py-2 text-center"><input type="checkbox" checked={selSales.has(row.id)} onChange={() => toggleSale(row.id)} className="accent-[#E91E63] cursor-pointer" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar page={pageSales} total={data.store.sales.length} onPage={setPageSales} />
          </div>
        )}
      </AdminCard>

      {/* Returns */}
      {data.store.returns.length > 0 && (
        <>
          <SectionDivider title="المرتجعات (طلبات ملغاة كانت مدفوعة)" />
          <AdminCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                    <th className="py-2 text-right font-bold">تاريخ الإلغاء</th>
                    <th className="py-2 text-right font-bold">العميل</th>
                    <th className="py-2 text-right font-bold">المنتجات</th>
                    <th className="py-2 text-right font-bold">الدفع</th>
                    <th className="py-2 text-right font-bold">المبلغ المرتجع</th>
                  </tr>
                </thead>
                <tbody>
                  {data.store.returns.map(row => (
                    <tr key={row.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                      <td className="py-2 text-[#d7aabd]">{fmtDate(row.date)}</td>
                      <td className="py-2 font-bold text-[#fff4f8]">{row.customerName}</td>
                      <td className="py-2 text-[#d7aabd] max-w-[160px] truncate">{row.items}</td>
                      <td className="py-2 text-[#d7aabd]">{row.paymentMethod}</td>
                      <td className="py-2 font-bold text-red-400">− {fmt(row.total)} ج</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[rgba(255,188,219,0.2)]">
                    <td colSpan={4} className="py-2 text-sm font-bold text-[#d7aabd]">إجمالي المرتجعات</td>
                    <td className="py-2 font-black text-red-400">− {fmt(data.store.summary.returnsTotal)} ج</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </AdminCard>
        </>
      )}

      {/* Purchases */}
      <SectionDivider title="فواتير المشتريات" />
      {selPurchases.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-sm">
          <span className="text-red-300">تم تحديد {selPurchases.size} سجل</span>
          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" onClick={deletePurchases} disabled={working}>حذف المحدد</button>
        </div>
      )}
      <AdminCard>
        {data.store.purchases.length === 0 ? <AdminEmptyState title="لا توجد مشتريات" description="لا توجد فواتير شراء في هذه الفترة" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">المورد</th>
                  <th className="py-2 text-right font-bold">المرجع</th>
                  <th className="py-2 text-right font-bold">الإجمالي</th>
                  <th className="py-2 text-right font-bold">التفاصيل</th>
                  <th className="py-2 text-center w-8"><input ref={purchasesAllRef} type="checkbox" checked={allPurchasesSelected} onChange={toggleAllPurchases} className="accent-[#E91E63] cursor-pointer" /></th>
                </tr>
              </thead>
              <tbody>
                {pagedPurchases.map(row => (
                  <>
                    <tr key={row.id} className={`border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5 ${selPurchases.has(row.id) ? "bg-rose-950/20" : ""}`}>
                      <td className="py-2 text-[#d7aabd]">{fmtDate(row.date)}</td>
                      <td className="py-2 font-bold text-[#fff4f8]">{row.supplierName ?? "—"}</td>
                      <td className="py-2 text-[#d7aabd]">{row.referenceNumber ?? "—"}</td>
                      <td className="py-2 font-bold text-orange-300">{fmt(row.totalCost)} ج</td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button className={BTN_GHOST} onClick={() => setExpandedPurchase(expandedPurchase === row.id ? null : row.id)}>
                            {expandedPurchase === row.id ? "إخفاء" : "عرض"}
                          </button>
                          <button className={BTN_GHOST} onClick={() => printPurchaseInvoice({
                            id: row.id, date: row.date,
                            supplierName: row.supplierName, referenceNumber: row.referenceNumber,
                            totalCost: row.totalCost, items: row.items,
                          })}>🖨️</button>
                        </div>
                      </td>
                      <td className="py-2 text-center"><input type="checkbox" checked={selPurchases.has(row.id)} onChange={() => togglePurchase(row.id)} className="accent-[#E91E63] cursor-pointer" /></td>
                    </tr>
                    {expandedPurchase === row.id && (
                      <tr key={`${row.id}-details`}>
                        <td colSpan={6} className="bg-white/5 px-4 pb-3 pt-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[#a07080]">
                                <th className="py-1 text-right">المنتج</th>
                                <th className="py-1 text-right">الكمية</th>
                                <th className="py-1 text-right">سعر الوحدة</th>
                                <th className="py-1 text-right">الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.items.map((item, i) => (
                                <tr key={i} className="border-t border-white/5">
                                  <td className="py-1 text-[#d7aabd]">{item.productName}</td>
                                  <td className="py-1 text-[#d7aabd]">{item.quantity}</td>
                                  <td className="py-1 text-[#d7aabd]">{fmt(item.unitCost)} ج</td>
                                  <td className="py-1 font-bold text-[#fff4f8]">{fmt(item.totalCost)} ج</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            <PaginationBar page={pagePurchases} total={data.store.purchases.length} onPage={setPagePurchases} />
          </div>
        )}
      </AdminCard>

      {/* Store Expenses */}
      <div className="flex items-center justify-between">
        <SectionDivider title="مصاريف المتجر" />
        <button className={BTN_PRIMARY} onClick={() => setShowExpense(true)}>+ إضافة مصروف</button>
      </div>
      <AdminCard>
        {data.store.expenses.length === 0 ? <AdminEmptyState title="لا توجد مصاريف" description="أضف مصاريف المتجر التشغيلية" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">المصروف</th>
                  <th className="py-2 text-right font-bold">التصنيف</th>
                  <th className="py-2 text-right font-bold">الجهة</th>
                  <th className="py-2 text-right font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {data.store.expenses.map(row => (
                  <tr key={row.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                    <td className="py-2 text-[#d7aabd]">{fmtDate(row.expenseDate)}</td>
                    <td className="py-2 font-bold text-[#fff4f8]">{row.label}</td>
                    <td className="py-2 text-[#d7aabd]">{row.category}</td>
                    <td className="py-2 text-[#d7aabd]">{row.vendor ?? "—"}</td>
                    <td className="py-2 font-bold text-red-400">{fmt(row.amount)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Fee Breakdown */}
      {data.store.feeBreakdown.length > 0 && (
        <>
          <SectionDivider title="تفاصيل العمولات المحتسبة" />
          <AdminCard>
            <div className="space-y-2">
              {Object.entries(
                data.store.feeBreakdown.reduce<Record<string, number>>((acc, item) => {
                  acc[item.label] = (acc[item.label] ?? 0) + item.amount;
                  return acc;
                }, {})
              ).map(([label, total]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-[#d7aabd]">{label}</span>
                  <span className="font-bold text-orange-300">{fmt(total)} ج</span>
                </div>
              ))}
            </div>
          </AdminCard>
        </>
      )}

      {showExpense && <AddExpenseModal onClose={() => setShowExpense(false)} onSave={onRefresh} />}
      {showFeeRule && <AddFeeRuleModal onClose={() => setShowFeeRule(false)} onSave={onRefresh} />}
    </div>
  );
}

// ─── Club Tab ─────────────────────────────────────────────────────────────────

function ClubTab({ data, onRefresh, dateRange }: { data: AccountingData; onRefresh: () => void; dateRange: string }) {
  const s = data.club.summary;
  const r = data.club.rewards;
  const [showExpense, setShowExpense] = useState(false);
  const [pageMemberships, setPageMemberships] = useState(1);
  const [pageBookings, setPageBookings] = useState(1);
  const pagedMemberships = data.club.memberships.slice((pageMemberships - 1) * PER_PAGE, pageMemberships * PER_PAGE);
  const pagedBookings = data.club.bookings.slice((pageBookings - 1) * PER_PAGE, pageBookings * PER_PAGE);

  const [selMemberships, setSelMemberships] = useState<Set<string>>(new Set());
  const [selBookings, setSelBookings] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  useEffect(() => setSelMemberships(new Set()), [pageMemberships]);
  useEffect(() => setSelBookings(new Set()), [pageBookings]);

  const allMembershipsSelected = pagedMemberships.length > 0 && pagedMemberships.every(r => selMemberships.has(r.id));
  const someMembershipsSelected = !allMembershipsSelected && pagedMemberships.some(r => selMemberships.has(r.id));
  const toggleAllMemberships = () => setSelMemberships(prev => { const n = new Set(prev); if (allMembershipsSelected) pagedMemberships.forEach(r => n.delete(r.id)); else pagedMemberships.forEach(r => n.add(r.id)); return n; });
  const toggleMembership = (id: string) => setSelMemberships(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteMemberships = async () => {
    if (!selMemberships.size || !confirm(`حذف ${selMemberships.size} فاتورة اشتراك نهائياً؟`)) return;
    setWorking(true);
    await Promise.all(Array.from(selMemberships).map(id => fetch("/api/admin/accounting", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entityType: "userMembership", id }) })));
    setSelMemberships(new Set()); onRefresh(); setWorking(false);
  };

  const allBookingsSelected = pagedBookings.length > 0 && pagedBookings.every(r => selBookings.has(r.id));
  const someBookingsSelected = !allBookingsSelected && pagedBookings.some(r => selBookings.has(r.id));
  const toggleAllBookings = () => setSelBookings(prev => { const n = new Set(prev); if (allBookingsSelected) pagedBookings.forEach(r => n.delete(r.id)); else pagedBookings.forEach(r => n.add(r.id)); return n; });
  const toggleBooking = (id: string) => setSelBookings(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const deleteBookings = async () => {
    if (!selBookings.size || !confirm(`حذف ${selBookings.size} حجز نهائياً؟`)) return;
    setWorking(true);
    await Promise.all(Array.from(selBookings).map(id => fetch("/api/admin/bookings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: id }) })));
    setSelBookings(new Set()); onRefresh(); setWorking(false);
  };

  const membershipsAllRef = useRef<HTMLInputElement>(null);
  const bookingsAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (membershipsAllRef.current) membershipsAllRef.current.indeterminate = someMembershipsSelected; }, [someMembershipsSelected]);
  useEffect(() => { if (bookingsAllRef.current) bookingsAllRef.current.indeterminate = someBookingsSelected; }, [someBookingsSelected]);

  const handlePrintReport = () => printClubReport({
    summary: s,
    memberships: data.club.memberships,
    bookings: data.club.bookings,
    expenses: data.club.expenses.map(e => ({ ...e, vendor: e.vendor ?? null })),
    pointValueEGP: r.pointValueEGP,
    dateRange,
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="إيرادات الاشتراكات" value={`${fmt(s.membershipRevenue)} ج`} sub={`${s.membershipCount} اشتراك`} />
        <KpiCard label="إيرادات الحجوزات" value={`${fmt(s.bookingRevenue)} ج`} sub={`${s.bookingCount} حجز`} />
        <KpiCard label="إجمالي الإيرادات الفعلية" value={`${fmt(s.totalRevenue)} ج`} color="text-pink-300" />
        <KpiCard label="مكافآت المحافظ الممنوحة" value={`${fmt(s.walletBonusCost)} ج`} color="text-yellow-400" />
      </div>

      {/* Wallet Topup — deferred liability */}
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-950/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-yellow-300">💰 أموال محافظ مشحونة (التزام مؤجل)</p>
            <p className="mt-1 text-xs text-[#a07080]">
              هذه المبالغ دُفعت لكنها لم تُصرف بعد — ستتحول لإيراد عند استخدامها في اشتراك أو منتج. لا تُحتسب ضمن الإيرادات الفعلية.
            </p>
          </div>
          <div className="text-left shrink-0">
            <p className="text-xl font-black text-yellow-300">{fmt(s.walletTopupCollected)} ج</p>
            <p className="text-xs text-[#a07080]">{s.walletTopupCount} عملية شحن</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="نقاط مستردة (تكلفة)" value={`${fmt(s.redeemedPointsCost)} ج`} color="text-orange-400" sub={`سعر النقطة: ${r.pointValueEGP} ج`} />
        <KpiCard label="التزامات النقاط الحالية" value={`${fmt(r.currentPointsLiability)} ج`} color="text-yellow-300" />
        <KpiCard label="المصاريف" value={`${fmt(s.expenseTotal)} ج`} color="text-red-400" />
        <KpiCard label="رسوم المنصات" value={`${fmt(s.feeTotal)} ج`} color="text-orange-300" />
      </div>

      {/* Commissions — liability & cost */}
      {(s.partnerCommissionsTotal > 0 || s.agentCommissionsTotal > 0) && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
          <p className="text-sm font-bold text-amber-300">🤝 العمولات المستحقة (تُخصم من الربح)</p>
          {s.partnerCommissionsTotal > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-white font-medium">عمولات الشركاء</span>
                <span className="mx-2 text-[#a07080] text-xs">
                  ({fmt(s.partnerCommissionsPending)} ج مستحق غير مسوَّى · {fmt(s.partnerCommissionsWithdrawn)} ج مدفوع)
                </span>
              </div>
              <span className="font-black text-amber-300">− {fmt(s.partnerCommissionsTotal)} ج</span>
            </div>
          )}
          {s.agentCommissionsTotal > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="text-white font-medium">عمولات الموظفين والمدربات</span>
                <span className="mx-2 text-[#a07080] text-xs">
                  ({fmt(s.agentCommissionsPending)} ج مستحق غير مسوَّى · {fmt(s.agentCommissionsSettled)} ج مدفوع)
                </span>
              </div>
              <span className="font-black text-amber-300">− {fmt(s.agentCommissionsTotal)} ج</span>
            </div>
          )}
          <p className="text-xs text-[#a07080]">
            تُحتسب بمجرد نشوئها بصرف النظر عن حالة الصرف (أساس الاستحقاق). الجزء المستحق غير المسوَّى هو التزام قائم في ذمة الجيم.
          </p>
        </div>
      )}

      {/* Discounts — memo line */}
      {s.clubDiscountsGranted > 0 && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-950/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-blue-300">🏷️ إجمالي الخصومات الممنوحة (للمعلومية)</p>
              <p className="mt-0.5 text-xs text-[#a07080]">
                خصومات أكواد الجيم · المدربات · الموظفين · الشركاء — متضمنة بالفعل في الإيرادات الفعلية، لا تُخصم مرة أخرى.
              </p>
            </div>
            <p className="text-xl font-black text-blue-300 shrink-0">{fmt(s.clubDiscountsGranted)} ج</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[rgba(255,188,219,0.2)] bg-[rgba(255,255,255,.04)] p-5">
          <p className="mb-1 text-sm text-[#d7aabd]">إجمالي الربح</p>
          <p className={`text-2xl font-black ${s.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.grossProfit)} ج</p>
          <p className="mt-1 text-xs text-[#a07080]">= الإيرادات − مكافآت المحفظة − النقاط المستردة</p>
        </div>
        <div className="rounded-2xl border-2 border-[rgba(255,188,219,0.25)] bg-[rgba(255,255,255,.04)] p-5">
          <p className="mb-1 text-sm text-[#d7aabd]">صافي الربح</p>
          <p className={`text-2xl font-black ${s.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(s.netProfit)} ج</p>
          <p className="mt-1 text-xs text-[#a07080]">
            = إجمالي ربح − {fmt(s.expenseTotal)} مصاريف − {fmt(s.feeTotal)} رسوم
            {s.partnerCommissionsTotal > 0 ? ` − ${fmt(s.partnerCommissionsTotal)} ع.شركاء` : ""}
            {s.agentCommissionsTotal > 0 ? ` − ${fmt(s.agentCommissionsTotal)} ع.موظفين` : ""}
          </p>
        </div>
      </div>

      {/* Print report button */}
      <div className="flex justify-end">
        <button className={BTN_PRIMARY} onClick={handlePrintReport}>🖨️ طباعة / تصدير PDF</button>
      </div>

      {/* Memberships */}
      <SectionDivider title="فواتير الاشتراكات" />
      {selMemberships.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-sm">
          <span className="text-red-300">تم تحديد {selMemberships.size} سجل</span>
          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" onClick={deleteMemberships} disabled={working}>حذف المحدد</button>
        </div>
      )}
      <AdminCard>
        {data.club.memberships.length === 0 ? <AdminEmptyState title="لا توجد اشتراكات" description="لا توجد اشتراكات في هذه الفترة" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">العضوة</th>
                  <th className="py-2 text-right font-bold">الباقة</th>
                  <th className="py-2 text-right font-bold">الدفع</th>
                  <th className="py-2 text-right font-bold">المبلغ</th>
                  <th className="py-2 text-right font-bold">مكافأة المحفظة</th>
                  <th className="py-2 text-center w-8"><input ref={membershipsAllRef} type="checkbox" checked={allMembershipsSelected} onChange={toggleAllMemberships} className="accent-[#E91E63] cursor-pointer" /></th>
                </tr>
              </thead>
              <tbody>
                {pagedMemberships.map(row => (
                  <tr key={row.id} className={`border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5 ${selMemberships.has(row.id) ? "bg-rose-950/20" : ""}`}>
                    <td className="py-2 text-[#d7aabd]">{fmtDate(row.date)}</td>
                    <td className="py-2 font-bold text-[#fff4f8]">{row.customerName}</td>
                    <td className="py-2 text-[#d7aabd]">{row.offerTitle ?? row.membershipName}</td>
                    <td className="py-2 text-[#d7aabd]">{row.paymentMethod}</td>
                    <td className="py-2 font-bold text-emerald-400">{fmt(row.paymentAmount)} ج</td>
                    <td className="py-2 text-yellow-400">{row.walletBonus > 0 ? `+${fmt(row.walletBonus)} ج` : "—"}</td>
                    <td className="py-2 text-center"><input type="checkbox" checked={selMemberships.has(row.id)} onChange={() => toggleMembership(row.id)} className="accent-[#E91E63] cursor-pointer" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationBar page={pageMemberships} total={data.club.memberships.length} onPage={setPageMemberships} />
          </div>
        )}
      </AdminCard>

      {/* Bookings */}
      {data.club.bookings.length > 0 && (
        <>
          <SectionDivider title="فواتير الحجوزات" />
          {selBookings.size > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-sm">
              <span className="text-red-300">تم تحديد {selBookings.size} سجل</span>
              <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50" onClick={deleteBookings} disabled={working}>حذف المحدد</button>
            </div>
          )}
          <AdminCard>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                    <th className="py-2 text-right font-bold">التاريخ</th>
                    <th className="py-2 text-right font-bold">العضوة</th>
                    <th className="py-2 text-right font-bold">الكلاس</th>
                    <th className="py-2 text-right font-bold">الدفع</th>
                    <th className="py-2 text-right font-bold">المبلغ</th>
                    <th className="py-2 text-center w-8"><input ref={bookingsAllRef} type="checkbox" checked={allBookingsSelected} onChange={toggleAllBookings} className="accent-[#E91E63] cursor-pointer" /></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBookings.map(row => (
                    <tr key={row.id} className={`border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5 ${selBookings.has(row.id) ? "bg-rose-950/20" : ""}`}>
                      <td className="py-2 text-[#d7aabd]">{fmtDate(row.date)}</td>
                      <td className="py-2 font-bold text-[#fff4f8]">{row.customerName}</td>
                      <td className="py-2 text-[#d7aabd]">{row.className}</td>
                      <td className="py-2 text-[#d7aabd]">{row.paymentMethod}</td>
                      <td className="py-2 font-bold text-emerald-400">{fmt(row.paidAmount)} ج</td>
                      <td className="py-2 text-center"><input type="checkbox" checked={selBookings.has(row.id)} onChange={() => toggleBooking(row.id)} className="accent-[#E91E63] cursor-pointer" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationBar page={pageBookings} total={data.club.bookings.length} onPage={setPageBookings} />
            </div>
          </AdminCard>
        </>
      )}

      {/* Club Expenses */}
      <div className="flex items-center justify-between">
        <SectionDivider title="مصاريف الجيم" />
        <button className={BTN_PRIMARY} onClick={() => setShowExpense(true)}>+ إضافة مصروف</button>
      </div>
      <AdminCard>
        {data.club.expenses.length === 0 ? <AdminEmptyState title="لا توجد مصاريف" description="أضف مصاريف الجيم التشغيلية" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">المصروف</th>
                  <th className="py-2 text-right font-bold">التصنيف</th>
                  <th className="py-2 text-right font-bold">الجهة</th>
                  <th className="py-2 text-right font-bold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {data.club.expenses.map(row => (
                  <tr key={row.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                    <td className="py-2 text-[#d7aabd]">{fmtDate(row.expenseDate)}</td>
                    <td className="py-2 font-bold text-[#fff4f8]">{row.label}</td>
                    <td className="py-2 text-[#d7aabd]">{row.category}</td>
                    <td className="py-2 text-[#d7aabd]">{row.vendor ?? "—"}</td>
                    <td className="py-2 font-bold text-red-400">{fmt(row.amount)} ج</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Fee Breakdown */}
      {data.club.feeBreakdown.length > 0 && (
        <>
          <SectionDivider title="تفاصيل العمولات المحتسبة" />
          <AdminCard>
            <div className="space-y-2">
              {Object.entries(
                data.club.feeBreakdown.reduce<Record<string, number>>((acc, item) => {
                  acc[item.label] = (acc[item.label] ?? 0) + item.amount;
                  return acc;
                }, {})
              ).map(([label, total]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-[#d7aabd]">{label}</span>
                  <span className="font-bold text-orange-300">{fmt(total)} ج</span>
                </div>
              ))}
            </div>
          </AdminCard>
        </>
      )}

      {showExpense && <AddExpenseModal onClose={() => setShowExpense(false)} onSave={onRefresh} />}
    </div>
  );
}

// ─── Fee Rules Tab ────────────────────────────────────────────────────────────

function FeeRulesTab({ data, onRefresh }: { data: AccountingData; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);

  const toggleRule = async (rule: FeeRule) => {
    await fetch("/api/admin/accounting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "feeRule", id: rule.id, payload: { isActive: !rule.isActive } }),
    });
    onRefresh();
  };

  const unitLabel = (v: string) => ({ store: "المتجر", club: "الجيم", both: "الاثنين" }[v] ?? v);
  const catLabel = (v: string) => ({ platform: "عمولة منصة", external_service: "خدمة خارجية", other: "أخرى" }[v] ?? v);
  const purposeLabel = (v: string) => ({ all: "الكل", order: "طلبات", membership: "اشتراكات", booking: "حجوزات", wallet_topup: "شحن محفظة" }[v] ?? v);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className={BTN_PRIMARY} onClick={() => setShowForm(true)}>+ إضافة قاعدة عمولة</button>
      </div>
      <AdminCard>
        {data.feeRules.length === 0 ? (
          <AdminEmptyState title="لا توجد قواعد عمولات" description="أضف قواعد العمولات والرسوم الخارجية" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                  <th className="py-2 text-right font-bold">الاسم</th>
                  <th className="py-2 text-right font-bold">القطاع</th>
                  <th className="py-2 text-right font-bold">النوع</th>
                  <th className="py-2 text-right font-bold">يطبق على</th>
                  <th className="py-2 text-right font-bold">القيمة</th>
                  <th className="py-2 text-right font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.feeRules.map(rule => (
                  <tr key={rule.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                    <td className="py-2 font-bold text-[#fff4f8]">{rule.label}</td>
                    <td className="py-2 text-[#d7aabd]">{unitLabel(rule.businessUnit)}</td>
                    <td className="py-2 text-[#d7aabd]">{catLabel(rule.category)}</td>
                    <td className="py-2 text-[#d7aabd]">{purposeLabel(rule.appliesToPurpose)}{rule.paymentMethod ? ` / ${rule.paymentMethod}` : ""}</td>
                    <td className="py-2 font-bold text-orange-300">
                      {rule.rateType === "percentage" ? `${rule.rateValue}%` : `${rule.rateValue} ج`}
                    </td>
                    <td className="py-2">
                      <button onClick={() => toggleRule(rule)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${rule.isActive ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "bg-red-500/15 text-red-400 hover:bg-red-500/25"}`}>
                        {rule.isActive ? "فعّال" : "معطّل"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
      {showForm && <AddFeeRuleModal onClose={() => setShowForm(false)} onSave={onRefresh} />}
    </div>
  );
}

// ─── Partner Commissions Tab ──────────────────────────────────────────────────

type PartnerCommissionRow = {
  id: string;
  partnerName: string;
  partnerCategory: string;
  customerName: string;
  membershipName: string;
  paymentAmount: number;
  amount: number;
  status: "pending" | "paid";
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
};

type CommissionsData = {
  commissions: PartnerCommissionRow[];
  summary: { pending: number; paid: number; total: number; count: number };
};

const PARTNER_CAT_LABELS: Record<string, string> = {
  beauty_center: "سنتر تجميل", salon: "كوافير", pharmacy: "صيدلية",
  clinic: "عيادة", physiotherapy: "علاج طبيعي", nutrition: "تغذية",
  nursery: "حضانة", education: "تعليم أطفال", clothing: "ملابس نسائية", other: "أخرى",
};

function PartnerCommissionsTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<CommissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [patching, setPatching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/admin/partner-commissions?${params}`);
      if (res.ok) setData(await res.json() as CommissionsData);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const toggleStatus = async (row: PartnerCommissionRow) => {
    setPatching(row.id);
    const newStatus = row.status === "paid" ? "pending" : "paid";
    await fetch("/api/admin/partner-commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status: newStatus }),
    });
    await load();
    setPatching(null);
  };

  if (loading) return <AdminCard><div className="py-12 text-center text-sm text-[#d7aabd]">جارٍ التحميل...</div></AdminCard>;
  if (!data) return null;

  const { summary, commissions } = data;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "إجمالي العمولات", value: `${summary.total.toFixed(2)} ج`, color: "text-white" },
          { label: "معلّقة", value: `${summary.pending.toFixed(2)} ج`, color: "text-amber-300" },
          { label: "مدفوعة", value: `${summary.paid.toFixed(2)} ج`, color: "text-emerald-300" },
          { label: "عدد السجلات", value: summary.count, color: "text-[#d7aabd]" },
        ].map((card) => (
          <AdminCard key={card.label}>
            <div className="text-xs text-[#a07080] mb-1">{card.label}</div>
            <div className={`text-xl font-black ${card.color}`}>{card.value}</div>
          </AdminCard>
        ))}
      </div>

      {/* Table */}
      <AdminCard>
        {commissions.length === 0 ? (
          <AdminEmptyState title="🤝 لا توجد عمولات" description="لم يتم تسجيل أي عمولات في هذه الفترة." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#a07080]">
                  <th className="py-2 text-right font-bold">الشريك</th>
                  <th className="py-2 text-right font-bold">العميل</th>
                  <th className="py-2 text-right font-bold">الاشتراك</th>
                  <th className="py-2 text-right font-bold">المبلوغ المدفوع</th>
                  <th className="py-2 text-right font-bold">العمولة</th>
                  <th className="py-2 text-right font-bold">التاريخ</th>
                  <th className="py-2 text-right font-bold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((row) => (
                  <tr key={row.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                    <td className="py-2">
                      <div className="font-bold text-[#fff4f8]">{row.partnerName}</div>
                      <div className="text-xs text-[#a07080]">{PARTNER_CAT_LABELS[row.partnerCategory] ?? row.partnerCategory}</div>
                    </td>
                    <td className="py-2 text-[#d7aabd]">{row.customerName}</td>
                    <td className="py-2 text-[#d7aabd]">{row.membershipName}</td>
                    <td className="py-2 text-[#d7aabd]">{row.paymentAmount} ج</td>
                    <td className="py-2 font-bold text-amber-300">{row.amount.toFixed(2)} ج</td>
                    <td className="py-2 text-[#a07080] text-xs">{fmtDate(row.createdAt)}</td>
                    <td className="py-2">
                      <button
                        disabled={patching === row.id}
                        onClick={() => void toggleStatus(row)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
                          row.status === "paid"
                            ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                            : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                        }`}
                      >
                        {row.status === "paid" ? "✓ مدفوعة" : "معلّقة"}
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

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Agent Commissions (Staff / Trainer) ──────────────────────────────────────
type AgentCommissionRow = {
  id: string;
  amount: number;
  status: string;
  settledAt: string | null;
  createdAt: string;
  customerName: string;
  membershipName: string;
  agentUser: { id: string; name: string; email: string; role: string };
};
type AgentCommissionsData = {
  commissions: AgentCommissionRow[];
  agents: { id: string; name: string; email: string; role: string; commissionRate: number; commissionType: string }[];
  totals: { earned: number; settled: number };
};

function AgentCommissionsAdminTab({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<AgentCommissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agentFilter) params.set("agentUserId", agentFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (from) params.set("from", from);
    if (to)   params.set("to", to);
    try {
      const res = await fetch(`/api/admin/agent-commissions?${params}`);
      if (res.ok) setData(await res.json() as AgentCommissionsData);
    } finally {
      setLoading(false);
    }
  }, [agentFilter, statusFilter, from, to]);

  useEffect(() => { void load(); }, [load]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const settle = async () => {
    if (!selected.size) return;
    setSettling(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-commissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], status: "settled" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "خطأ");
      setMsg({ ok: true, text: `تم تسوية ${selected.size} عمولة.` });
      setSelected(new Set());
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "خطأ" });
    } finally {
      setSettling(false);
    }
  };

  const earned = data?.commissions.filter(c => c.status === "earned") ?? [];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "إجمالي مستحق", value: data?.totals.earned ?? 0, color: "#f9a8d4" },
          { label: "إجمالي مُسوَّى", value: data?.totals.settled ?? 0, color: "#86efac" },
        ].map(s => (
          <AdminCard key={s.label}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value.toFixed(0)} ج.م</div>
            <div style={{ fontSize: 12, color: "#d7aabd", marginTop: 2 }}>{s.label}</div>
          </AdminCard>
        ))}
      </div>

      {/* Filters */}
      <AdminCard>
        <div className="flex flex-wrap gap-3">
          <select className={INPUT} value={agentFilter} onChange={e => setAgentFilter(e.target.value)} style={{ maxWidth: 220 }}>
            <option value="">كل الموظفين</option>
            {(data?.agents ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.role === "trainer" ? "مدربة" : "موظف"})</option>
            ))}
          </select>
          <select className={INPUT} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="all">كل الحالات</option>
            <option value="earned">مستحقة</option>
            <option value="settled">مُسوَّاة</option>
          </select>
          <button className={BTN_PRIMARY} onClick={load} disabled={loading}>تحديث</button>
          {selected.size > 0 && (
            <button className={BTN_PRIMARY} onClick={settle} disabled={settling} style={{ background: "#059669" }}>
              {settling ? "جارٍ التسوية..." : `تسوية ${selected.size} محدد`}
            </button>
          )}
        </div>
        {msg && <div className={`mt-3 rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-emerald-950/40 text-emerald-200" : "bg-red-950/40 text-red-200"}`}>{msg.text}</div>}
      </AdminCard>

      <AdminCard>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-black text-white">الموظفون بنظام عمولة</div>
            <div className="text-xs text-[#d7aabd]">كل موظف أو مدربة لها نسبة أو مبلغ عمولة محدد في الإعدادات.</div>
          </div>
          <div className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">{data?.agents.length ?? 0} حساب</div>
        </div>
        {!data?.agents.length ? (
          <div className="py-6 text-center text-sm text-[#d7aabd]">لا يوجد موظفون بنظام عمولة حاليًا.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-white/10 text-xs text-[#d7aabd]">
                <tr>
                  <th className="px-3 py-2">الحساب</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">نظام العمولة</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => (
                  <tr key={a.id} className="border-t border-white/10 text-white hover:bg-white/5">
                    <td className="px-3 py-2.5">
                      <div className="font-bold">{a.name}</div>
                      <div className="text-xs text-[#d7aabd]">{a.email}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[#d7aabd]">{a.role === "trainer" ? "مدربة" : "موظف"}</td>
                    <td className="px-3 py-2.5 font-bold text-pink-300">
                      {a.commissionType === "fixed" ? `${a.commissionRate} ج.م` : `${a.commissionRate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Table */}
      {loading ? (
        <AdminCard><div className="py-10 text-center text-sm text-[#d7aabd]">جارٍ التحميل...</div></AdminCard>
      ) : (
        <AdminCard>
          {!data?.commissions.length ? (
            <div className="py-10 text-center text-sm text-[#d7aabd]">لا توجد عمولات.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="text-xs text-[#d7aabd] border-b border-white/10">
                  <tr>
                    <th className="py-2 px-3">
                      <input type="checkbox"
                        checked={selected.size === earned.length && earned.length > 0}
                        onChange={() => setSelected(selected.size === earned.length ? new Set() : new Set(earned.map(c => c.id)))}
                      />
                    </th>
                    <th className="py-2 px-3">الموظف / المدربة</th>
                    <th className="py-2 px-3">العميل</th>
                    <th className="py-2 px-3">الباقة</th>
                    <th className="py-2 px-3">العمولة</th>
                    <th className="py-2 px-3">الحالة</th>
                    <th className="py-2 px-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.map(c => (
                    <tr key={c.id} className="border-t border-white/10 text-white hover:bg-white/5">
                      <td className="py-2.5 px-3">
                        {c.status === "earned" && (
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold">{c.agentUser.name}</div>
                        <div className="text-xs text-[#d7aabd]">{c.agentUser.role === "trainer" ? "مدربة" : "موظف"}</div>
                      </td>
                      <td className="py-2.5 px-3">{c.customerName}</td>
                      <td className="py-2.5 px-3 text-[#d7aabd]">{c.membershipName}</td>
                      <td className="py-2.5 px-3 font-bold text-pink-300">{c.amount.toFixed(0)} ج.م</td>
                      <td className="py-2.5 px-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.status === "settled" ? "bg-emerald-900/40 text-emerald-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                          {c.status === "settled" ? "مُسوَّاة" : "مستحقة"}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#d7aabd]">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      )}
    </div>
  );
}

function ContractsCommissionsTab({ data }: { data: AccountingData }) {
  const c = data.contracts;
  const managerTotal = c.summary.managerAgentPending + c.summary.managerAgentSettled + c.summary.managerPartnerPending + c.summary.managerPartnerSettled;
  const agentTotal = c.summary.salesAgentPending + c.summary.salesAgentSettled;
  const statusBadge = (status: string) => (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${status === "settled" ? "bg-emerald-900/40 text-emerald-300" : "bg-yellow-900/40 text-yellow-300"}`}>
      {status === "settled" ? "مسواة" : "مستحقة"}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="عمولات المناديب" value={`${fmt(agentTotal)} ج`} sub={`${fmt(c.summary.salesAgentPending)} مستحق`} color="text-pink-300" />
        <KpiCard label="عمولات المديرين" value={`${fmt(managerTotal)} ج`} sub={`${fmt(c.summary.managerAgentPending + c.summary.managerPartnerPending)} مستحق`} color="text-amber-300" />
        <KpiCard label="عدد المديرين" value={`${c.managers.length}`} color="text-[#fff4f8]" />
        <KpiCard label="مناديب وشركاء" value={`${c.managers.reduce((s, m) => s + m.agents.length + m.partners.length, 0)}`} color="text-[#d7aabd]" />
      </div>

      <AdminCard>
        <SectionDivider title="المديرون ومناديبهم وشركاؤهم" />
        {!c.managers.length ? (
          <div className="py-8 text-center text-sm text-[#d7aabd]">لا توجد بيانات مديرين.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {c.managers.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{m.name}</div>
                    <div className="text-xs text-[#d7aabd]">{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
                  </div>
                  <div className="text-xs text-[#d7aabd]">
                    مناديب: <span className="font-bold text-white">{m.agents.length}</span> · شركاء: <span className="font-bold text-white">{m.partners.length}</span>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-black text-pink-200">المناديب</div>
                    {!m.agents.length ? <div className="text-xs text-[#a07080]">لا يوجد مناديب.</div> : (
                      <div className="space-y-2">
                        {m.agents.map((a) => (
                          <div key={a.id} className="rounded-lg bg-black/20 px-3 py-2 text-sm">
                            <div className="font-bold text-white">{a.name}</div>
                            <div className="text-xs text-[#d7aabd]">{a.email}</div>
                            <div className="mt-1 text-xs text-[#a07080]">مستحق {fmt(a.pendingCommission)} ج · مسوى {fmt(a.settledCommission)} ج</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-black text-amber-200">الشركاء</div>
                    {!m.partners.length ? <div className="text-xs text-[#a07080]">لا يوجد شركاء.</div> : (
                      <div className="space-y-2">
                        {m.partners.map((p) => (
                          <div key={p.id} className="rounded-lg bg-black/20 px-3 py-2 text-sm">
                            <div className="font-bold text-white">{p.name}</div>
                            <div className="text-xs text-[#d7aabd]">{p.email}</div>
                            <div className="mt-1 text-xs text-[#a07080]">معلق {fmt(p.totalCommissionPending)} ج · مدفوع {fmt(p.totalCommissionPaid)} ج</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <SectionDivider title="عمولات المناديب" />
        {!c.salesAgentCommissions.length ? (
          <div className="py-8 text-center text-sm text-[#d7aabd]">لا توجد عمولات مناديب في الفترة.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-white/10 text-xs text-[#d7aabd]"><tr><th className="px-3 py-2">المندوب</th><th className="px-3 py-2">المدير</th><th className="px-3 py-2">العميل</th><th className="px-3 py-2">الباقة</th><th className="px-3 py-2">العمولة</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2">التاريخ</th></tr></thead>
              <tbody>{c.salesAgentCommissions.map((row) => (
                <tr key={row.id} className="border-t border-white/10 text-white hover:bg-white/5">
                  <td className="px-3 py-2.5 font-bold">{row.agentName}</td><td className="px-3 py-2.5 text-[#d7aabd]">{row.managerName ?? "بدون مدير"}</td>
                  <td className="px-3 py-2.5"><div>{row.customerName}</div><div className="text-xs text-[#d7aabd]">{row.customerEmail}</div></td>
                  <td className="px-3 py-2.5 text-[#d7aabd]">{row.membershipName}</td><td className="px-3 py-2.5 font-bold text-pink-300">{fmt(row.amount)} ج</td>
                  <td className="px-3 py-2.5">{statusBadge(row.status)}</td><td className="px-3 py-2.5 text-xs text-[#d7aabd]">{fmtDate(row.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <SectionDivider title="عمولات المديرين" />
        {c.managerCommissions.length + c.managerPartnerCommissions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#d7aabd]">لا توجد عمولات مديرين في الفترة.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-white/10 text-xs text-[#d7aabd]"><tr><th className="px-3 py-2">المدير</th><th className="px-3 py-2">المصدر</th><th className="px-3 py-2">العميل</th><th className="px-3 py-2">الباقة</th><th className="px-3 py-2">عمولة المدير</th><th className="px-3 py-2">الحالة</th><th className="px-3 py-2">التاريخ</th></tr></thead>
              <tbody>
                {[...c.managerCommissions.map((row) => ({ ...row, sourceName: row.agentName ?? "مندوب" })), ...c.managerPartnerCommissions.map((row) => ({ ...row, sourceName: row.partnerName ?? "شريك" }))].map((row) => (
                  <tr key={row.id} className="border-t border-white/10 text-white hover:bg-white/5">
                    <td className="px-3 py-2.5 font-bold">{row.managerName}</td><td className="px-3 py-2.5 text-[#d7aabd]">{row.sourceName}</td>
                    <td className="px-3 py-2.5"><div>{row.customerName ?? "—"}</div><div className="text-xs text-[#d7aabd]">{row.customerEmail ?? ""}</div></td>
                    <td className="px-3 py-2.5 text-[#d7aabd]">{row.membershipName ?? "—"}</td><td className="px-3 py-2.5 font-bold text-amber-300">{fmt(row.amount)} ج</td>
                    <td className="px-3 py-2.5">{statusBadge(row.status)}</td><td className="px-3 py-2.5 text-xs text-[#d7aabd]">{fmtDate(row.createdAt)}</td>
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

type MainTab = "store" | "club" | "fees" | "commissions" | "agentCommissions" | "contractCommissions" | "customerStatement";

// ─── Customer Statement Tab ───────────────────────────────────────────────────

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  joinedAt: string;
  walletBalance: number;
  rewardPoints: number;
  rewardTier: string;
  totalPaid: number;
  totalMembershipPaid: number;
  totalBookingPaid: number;
  totalDiscounts: number;
  membershipsCount: number;
  activeMembership: {
    membershipName: string;
    endDate: string;
    remainingDays: number;
    totalSessions: number | null;
    usedSessions: number;
    remainSessions: number | null;
  } | null;
  memberships: {
    id: string;
    membershipName: string;
    kind: string;
    startDate: string;
    endDate: string;
    status: string;
    paymentAmount: number;
    paymentMethod: string;
    remainingDays: number;
    totalSessions: number | null;
    usedSessions: number;
    remainSessions: number | null;
    bookingsCount: number;
  }[];
  discounts: { code: string; amount: number; source: string }[];
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "كاش", card: "كارت", wallet: "محفظة",
  instapay: "انستاباي", free: "مجاني", offer: "عرض",
};

function CustomerStatementTab({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 30;

  const load = useCallback(async (pg = 1, q = search, st = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search: q, status: st, page: String(pg), limit: String(limit) });
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const res = await fetch(`/api/admin/accounting/customers-report?${params}`);
      if (!res.ok) return;
      const json = await res.json() as { rows: CustomerRow[]; total: number; totalPages: number };
      setRows(json.rows);
      setTotal(json.total);
      setTotalPages(json.totalPages ?? 1);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, from, to]);

  useEffect(() => { void load(1, search, statusFilter); }, [statusFilter, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { void load(1, search, statusFilter); }, 400);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      {/* Header + filters */}
      <AdminCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-black text-white">📋 كشف حساب العملاء</div>
            <div className="text-xs text-[#d7aabd]">
              {loading ? "جارٍ التحميل..." : `${total} عميل`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className={INPUT}
              style={{ maxWidth: 160 }}
            >
              <option value="all">كل العملاء</option>
              <option value="active">اشتراك نشط</option>
              <option value="expired">منتهي / بدون</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="🔍 ابحث بالاسم أو الإيميل أو التليفون..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-right text-sm text-white placeholder-[#d7aabd] focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </AdminCard>

      {/* Table */}
      {loading ? (
        <AdminCard>
          <div className="py-16 text-center text-sm text-[#d7aabd]">جارٍ تحميل البيانات...</div>
        </AdminCard>
      ) : rows.length === 0 ? (
        <AdminCard>
          <AdminEmptyState title="لا توجد نتائج" description="جرّب تغيير كلمة البحث أو الفلتر." />
        </AdminCard>
      ) : (
        <AdminCard>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead className="border-b border-white/10 text-xs text-[#d7aabd]">
                <tr>
                  <th className="px-3 py-2">العميل</th>
                  <th className="px-3 py-2">الاشتراك الحالي</th>
                  <th className="px-3 py-2">المتبقي</th>
                  <th className="px-3 py-2">إجمالي الدفع</th>
                  <th className="px-3 py-2">الخصومات</th>
                  <th className="px-3 py-2">المحفظة</th>
                  <th className="px-3 py-2">الحالة</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      className="border-t border-white/10 text-white hover:bg-white/5 cursor-pointer"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      {/* العميل */}
                      <td className="px-3 py-3">
                        <div className="font-bold text-white">{row.name}</div>
                        <div className="text-xs text-[#d7aabd]">{row.email}</div>
                        {row.phone && <div className="text-xs text-[#a07080]">{row.phone}</div>}
                        <div className="text-xs text-[#a07080]">
                          انضم: {new Date(row.joinedAt).toLocaleDateString("ar-EG")}
                        </div>
                      </td>

                      {/* الاشتراك الحالي */}
                      <td className="px-3 py-3">
                        {row.activeMembership ? (
                          <div>
                            <div className="font-bold text-pink-200">{row.activeMembership.membershipName}</div>
                            <div className="text-xs text-[#d7aabd]">
                              ينتهي: {new Date(row.activeMembership.endDate).toLocaleDateString("ar-EG")}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-[#a07080]">لا يوجد اشتراك نشط</span>
                        )}
                      </td>

                      {/* المتبقي */}
                      <td className="px-3 py-3">
                        {row.activeMembership ? (
                          <div className="space-y-1">
                            <div className={`text-sm font-bold ${
                              (row.activeMembership.remainingDays ?? 0) <= 7 ? "text-red-300" :
                              (row.activeMembership.remainingDays ?? 0) <= 15 ? "text-amber-300" : "text-emerald-300"
                            }`}>
                              {row.activeMembership.remainingDays} يوم
                            </div>
                            {row.activeMembership.totalSessions !== null && (
                              <div className="text-xs text-[#d7aabd]">
                                {row.activeMembership.remainSessions} حصة متبقية
                                <span className="text-[#a07080]"> / {row.activeMembership.totalSessions}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[#a07080]">—</span>
                        )}
                      </td>

                      {/* إجمالي الدفع */}
                      <td className="px-3 py-3">
                        <div className="font-black text-white">{row.totalPaid.toFixed(0)} ج</div>
                        <div className="text-xs text-[#d7aabd]">{row.membershipsCount} اشتراك</div>
                      </td>

                      {/* الخصومات */}
                      <td className="px-3 py-3">
                        {row.totalDiscounts > 0 ? (
                          <div className="font-bold text-amber-300">{row.totalDiscounts.toFixed(0)} ج</div>
                        ) : (
                          <span className="text-xs text-[#a07080]">—</span>
                        )}
                      </td>

                      {/* المحفظة */}
                      <td className="px-3 py-3">
                        <div className={`font-bold ${row.walletBalance > 0 ? "text-emerald-300" : "text-[#a07080]"}`}>
                          {row.walletBalance.toFixed(0)} ج
                        </div>
                      </td>

                      {/* الحالة */}
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          row.activeMembership
                            ? "bg-emerald-900/40 text-emerald-300"
                            : "bg-[#3a1a2a] text-[#d7aabd]"
                        }`}>
                          {row.activeMembership ? "نشط" : "منتهي"}
                        </span>
                      </td>

                      {/* Toggle */}
                      <td className="px-3 py-3 text-[#d7aabd] text-center">
                        {expanded === row.id ? "▲" : "▼"}
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expanded === row.id && (
                      <tr className="bg-white/[0.02]">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="space-y-4">

                            {/* Financial summary cards */}
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                              {[
                                { label: "اشتراكات", value: `${row.totalMembershipPaid.toFixed(0)} ج`, color: "text-pink-300" },
                                { label: "حجوزات", value: `${row.totalBookingPaid.toFixed(0)} ج`, color: "text-blue-300" },
                                { label: "خصومات", value: `${row.totalDiscounts.toFixed(0)} ج`, color: "text-amber-300" },
                                { label: "رصيد المحفظة", value: `${row.walletBalance.toFixed(0)} ج`, color: "text-emerald-300" },
                              ].map(card => (
                                <div key={card.label} className="rounded-xl border border-white/10 bg-black/20 p-3 text-center">
                                  <div className={`text-lg font-black ${card.color}`}>{card.value}</div>
                                  <div className="text-xs text-[#d7aabd] mt-1">{card.label}</div>
                                </div>
                              ))}
                            </div>

                            {/* Memberships history */}
                            {row.memberships.length > 0 && (
                              <div>
                                <div className="mb-2 text-xs font-black text-pink-200">سجل الاشتراكات</div>
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-right text-xs">
                                    <thead className="border-b border-white/10 text-[#a07080]">
                                      <tr>
                                        <th className="px-2 py-1.5">الباقة</th>
                                        <th className="px-2 py-1.5">من</th>
                                        <th className="px-2 py-1.5">إلى</th>
                                        <th className="px-2 py-1.5">المدفوع</th>
                                        <th className="px-2 py-1.5">طريقة الدفع</th>
                                        <th className="px-2 py-1.5">الحصص</th>
                                        <th className="px-2 py-1.5">المتبقي</th>
                                        <th className="px-2 py-1.5">الحالة</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.memberships.map((m) => (
                                        <tr key={m.id} className="border-t border-white/5 text-white">
                                          <td className="px-2 py-2">
                                            <div className="font-bold">{m.membershipName}</div>
                                            <div className="text-[#a07080]">{m.kind === "package" ? "باقة" : "اشتراك"}</div>
                                          </td>
                                          <td className="px-2 py-2 text-[#d7aabd]">
                                            {new Date(m.startDate).toLocaleDateString("ar-EG")}
                                          </td>
                                          <td className="px-2 py-2 text-[#d7aabd]">
                                            {new Date(m.endDate).toLocaleDateString("ar-EG")}
                                          </td>
                                          <td className="px-2 py-2 font-bold text-pink-300">
                                            {m.paymentAmount.toFixed(0)} ج
                                          </td>
                                          <td className="px-2 py-2 text-[#d7aabd]">
                                            {PAYMENT_METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod}
                                          </td>
                                          <td className="px-2 py-2 text-[#d7aabd]">
                                            {m.totalSessions !== null
                                              ? `${m.usedSessions} / ${m.totalSessions}`
                                              : "غير محدود"}
                                          </td>
                                          <td className="px-2 py-2">
                                            {m.status === "active" ? (
                                              <span className={`font-bold ${
                                                m.remainingDays <= 7 ? "text-red-300" :
                                                m.remainingDays <= 15 ? "text-amber-300" : "text-emerald-300"
                                              }`}>
                                                {m.remainingDays} يوم
                                                {m.remainSessions !== null && ` · ${m.remainSessions} حصة`}
                                              </span>
                                            ) : (
                                              <span className="text-[#a07080]">—</span>
                                            )}
                                          </td>
                                          <td className="px-2 py-2">
                                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                              m.status === "active"
                                                ? "bg-emerald-900/40 text-emerald-300"
                                                : m.status === "expired"
                                                ? "bg-red-900/30 text-red-300"
                                                : m.status === "pending_payment" || m.status === "pending"
                                                ? "bg-amber-900/40 text-amber-300"
                                                : "bg-white/10 text-[#d7aabd]"
                                            }`}>
                                              {m.status === "active"          ? "نشط" :
                                               m.status === "expired"         ? "منتهي" :
                                               m.status === "cancelled"       ? "ملغي" :
                                               m.status === "pending_payment" ? "بانتظار الدفع" :
                                               m.status === "pending"         ? "معلق" : m.status}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* Discount codes */}
                            {row.discounts.length > 0 && (
                              <div>
                                <div className="mb-2 text-xs font-black text-amber-200">أكواد الخصم المستخدمة</div>
                                <div className="flex flex-wrap gap-2">
                                  {row.discounts.map((d, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full bg-amber-900/30 px-3 py-1 text-xs text-amber-200"
                                    >
                                      {d.code} — {d.source}
                                      {d.amount > 0 && ` (${d.amount.toFixed(0)} ج)`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                className={BTN_GHOST}
                disabled={page <= 1}
                onClick={() => void load(page - 1)}
              >
                ← السابق
              </button>
              <span className="text-sm text-[#d7aabd]">
                صفحة {page} من {totalPages}
              </span>
              <button
                className={BTN_GHOST}
                disabled={page >= totalPages}
                onClick={() => void load(page + 1)}
              >
                التالي →
              </button>
            </div>
          )}
        </AdminCard>
      )}
    </div>
  );
}

const THIS_MONTH_START = new Date();
THIS_MONTH_START.setDate(1);
THIS_MONTH_START.setHours(0, 0, 0, 0);

export default function Accounting() {
  const [tab, setTab] = useState<MainTab>("store");
  const [data, setData] = useState<AccountingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [from, setFrom] = useState(THIS_MONTH_START.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/accounting?${params.toString()}`);
      if (!res.ok) { setError("تعذر تحميل البيانات المحاسبية"); return; }
      setData(await res.json() as AccountingData);
    } catch {
      setError("خطأ في الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const TABS: { id: MainTab; label: string; icon: string }[] = [
    { id: "store", label: "حسابات المتجر", icon: "🛒" },
    { id: "club", label: "حسابات الجيم", icon: "🏋️" },
    { id: "fees", label: "قواعد العمولات", icon: "⚙️" },
    { id: "commissions", label: "عمولات الشركاء", icon: "🤝" },
    { id: "agentCommissions", label: "عمولات الموظفين", icon: "👥" },
    { id: "contractCommissions", label: "عمولات التعاقدات", icon: "📊" },
    { id: "customerStatement", label: "كشف حساب العملاء", icon: "📋" },
  ];

  return (
    <AdminSectionShell
      title="المحاسبة"
      subtitle="Accounting — متجر | جيم | تقارير مالية دقيقة"
    >
      {/* Date range */}
      <AdminCard>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className={LABEL}>من تاريخ</label>
            <input className={INPUT} style={{ width: 160 }} type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>إلى تاريخ</label>
            <input className={INPUT} style={{ width: 160 }} type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <button className={BTN_PRIMARY} onClick={fetchData} disabled={loading}>
            {loading ? "جاري التحميل..." : "تحديث التقرير"}
          </button>
          {/* Quick filters */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "هذا الشهر", fn: () => { const s = new Date(); s.setDate(1); setFrom(s.toISOString().slice(0,10)); setTo(new Date().toISOString().slice(0,10)); } },
              { label: "الشهر الماضي", fn: () => { const s = new Date(); s.setDate(1); s.setMonth(s.getMonth()-1); const e = new Date(s); e.setMonth(e.getMonth()+1); e.setDate(0); setFrom(s.toISOString().slice(0,10)); setTo(e.toISOString().slice(0,10)); } },
              { label: "هذا العام", fn: () => { const s = new Date(new Date().getFullYear(), 0, 1); setFrom(s.toISOString().slice(0,10)); setTo(new Date().toISOString().slice(0,10)); } },
              { label: "الكل", fn: () => { setFrom(""); setTo(""); } },
            ].map(q => (
              <button key={q.label} className={BTN_GHOST} onClick={q.fn}>{q.label}</button>
            ))}
          </div>
        </div>
      </AdminCard>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === t.id ? "bg-[#E91E63] text-white" : "border border-[rgba(255,188,219,0.2)] text-[#d7aabd] hover:text-white"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {loading && (
        <AdminCard><div className="py-16 text-center text-sm text-[#d7aabd]">جاري تحميل البيانات المحاسبية...</div></AdminCard>
      )}

      {!loading && data && tab === "store" && <StoreTab data={data} onRefresh={fetchData} dateRange={from && to ? `${from} — ${to}` : "كل الفترات"} />}
      {!loading && data && tab === "club" && <ClubTab data={data} onRefresh={fetchData} dateRange={from && to ? `${from} — ${to}` : "كل الفترات"} />}
      {!loading && data && tab === "fees" && <FeeRulesTab data={data} onRefresh={fetchData} />}
      {tab === "commissions"       && <PartnerCommissionsTab from={from} to={to} />}
      {tab === "agentCommissions"  && <AgentCommissionsAdminTab from={from} to={to} />}
      {!loading && data && tab === "contractCommissions" && <ContractsCommissionsTab data={data} />}
      {tab === "customerStatement" && <CustomerStatementTab from={from} to={to} />}
    </AdminSectionShell>
  );
}
