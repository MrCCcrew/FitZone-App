"use client";

import { useEffect, useState } from "react";
import type { AdminEmployee, AuditLogEntry } from "../types";
import { ADMIN_FEATURES, ROLE_FEATURE_TEMPLATES, type AdminRole } from "@/lib/admin-permissions";

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string }> = [
  { value: "admin", label: "مدير النظام" },
  { value: "staff", label: "استاف" },
  { value: "trainer", label: "مدربة" },
  { value: "accountant", label: "محاسب" },
];

const FEATURE_LABELS: Record<string, string> = {
  settings: "الإعدادات والصلاحيات",
  overview: "لوحة التحكم",
  "site-content": "الصفحات والمحتوى",
  knowledge: "قاعدة معرفة البوت",
  memberships: "الاشتراكات والباقات",
  offers: "العروض",
  classes: "الكلاسات",
  trainers: "المدربات",
  customers: "العملاء",
  products: "المنتجات",
  inventory: "المخزون",
  reviews: "الآراء",
  bookings: "الحجوزات",
  orders: "الطلبات والمدفوعات",
  balance: "الرصيد والنقاط",
  chat: "الدردشة المباشرة",
  complaints: "الشكاوى",
  discounts: "أكواد الخصم",
  rewards: "المكافآت والإحالة",
  "db-maintenance": "إدارة قاعدة البيانات",
  accounting: "الحسابات والتقارير",
  push: "الإشعارات الفورية",
  partners: "الشركاء والعمولات",
};

type EmployeeForm = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: AdminRole;
  jobTitle: string;
  adminAccess: boolean;
  isActive: boolean;
  adminPermissions: string[];
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscount: number | null;
  commissionRate: number;
  commissionType: "percentage" | "fixed";
};

const EMPTY_FORM: EmployeeForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "staff",
  jobTitle: "",
  adminAccess: true,
  isActive: true,
  adminPermissions: [...ROLE_FEATURE_TEMPLATES.staff],
  discountType: "percentage",
  discountValue: 0,
  maxDiscount: null,
  commissionRate: 0,
  commissionType: "percentage",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "موافقة",
  reject: "رفض",
  activate: "تفعيل",
  deactivate: "تعطيل",
  login: "تسجيل دخول",
  logout: "تسجيل خروج",
  gift_trial: "منح تجربة مجانية",
  bulk_delete: "حذف جماعي",
  mark_paid: "تسجيل دفع",
  mark_delivered: "تسليم",
  cancel: "إلغاء",
  settle: "تسوية",
  reset: "إعادة تعيين",
  patch: "تحديث",
};

const AUDIT_TARGET_LABELS: Record<string, string> = {
  userMembership: "اشتراك",
  partner: "شريك",
  partnerCommission: "عمولة شريك",
  agentCommission: "عمولة موظف",
  booking: "حجز",
  user: "مستخدم",
  order: "طلب",
  product: "منتج",
  discount: "كود خصم",
  trainer: "مدربة",
  expense: "مصروف",
  feeRule: "قاعدة عمولة",
  membership: "باقة اشتراك",
  privateSession: "جلسة خاصة",
  complaint: "شكوى",
  notification: "إشعار",
};

const AUDIT_DETAIL_LABELS: Record<string, string> = {
  customerName: "اسم العميل",
  membershipName: "الاشتراك",
  trainerName: "المدربة",
  partnerName: "الشريك",
  agentName: "الموظف",
  amount: "المبلغ",
  paymentMethod: "طريقة الدفع",
  status: "الحالة",
  name: "الاسم",
  category: "الفئة",
  email: "البريد الإلكتروني",
  phone: "الهاتف",
  reason: "السبب",
  note: "الملاحظة",
  notes: "ملاحظات",
  startDate: "تاريخ البداية",
  endDate: "تاريخ الانتهاء",
  code: "الكود",
  value: "القيمة",
  type: "النوع",
  className: "الكلاس",
  label: "الوصف",
  price: "السعر",
  vendor: "المورد",
  count: "العدد",
  ids: "العناصر المحددة",
  scheduledAt: "الموعد",
  paidAt: "تاريخ الدفع",
  settledAt: "تاريخ التسوية",
  withdrawnAt: "تاريخ السحب",
  role: "الصلاحية",
  title: "العنوان",
  description: "الوصف",
  userId: "معرف المستخدم",
  trainerId: "معرف المدربة",
  membershipId: "معرف الباقة",
};

function fmtDetailVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "نعم" : "لا";
  if (Array.isArray(val)) return `${(val as unknown[]).length} عنصر`;
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function AuditDetailsView({ details }: { details?: string | null }) {
  if (!details) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(details) as Record<string, unknown>;
  } catch {
    return <p className="mt-2 rounded-xl bg-[#12080d] p-3 text-[11px] text-[#f5d4df]">{details}</p>;
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl bg-[#12080d] p-3">
      <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns: "max-content 1fr" }}>
        {entries.map(([key, val]) => (
          <>
            <span key={`${key}-k`} className="text-[11px] text-[#a07080] whitespace-nowrap">{AUDIT_DETAIL_LABELS[key] ?? key}</span>
            <span key={`${key}-v`} className="text-[11px] text-[#f5d4df] font-medium break-all">{fmtDetailVal(val)}</span>
          </>
        ))}
      </div>
    </div>
  );
}

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<"employees" | "audit">("employees");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [auditFilters, setAuditFilters] = useState({
    actorUserId: "",
    targetType: "",
    action: "",
    search: "",
  });

  const loadEmployees = async () => {
    const response = await fetch("/api/admin/settings/staff", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "تعذر تحميل بيانات الموظفين.");
    }
    setEmployees(payload.employees ?? []);
  };

  const loadLogs = async (
    filters: { actorUserId: string; targetType: string; action: string; search: string } = auditFilters,
  ) => {
    setAuditLoading(true);
    const params = new URLSearchParams({ limit: "120" });
    if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
    if (filters.targetType) params.set("targetType", filters.targetType);
    if (filters.action) params.set("action", filters.action);
    if (filters.search) params.set("search", filters.search);

    try {
      const response = await fetch(`/api/admin/settings/audit-log?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تحميل سجل التغييرات.");
      }
      setLogs(payload.logs ?? []);
      setMessage(null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "تعذر تحميل سجل التغييرات.", ok: false });
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadEmployees(), loadLogs()]);
      } catch (error) {
        if (!cancelled) {
          setMessage({ text: error instanceof Error ? error.message : "تعذر تحميل الإعدادات.", ok: false });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "audit") return;
    void loadLogs();
  }, [activeTab]);

  const updateForm = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateAuditFilter = <K extends keyof typeof auditFilters>(key: K, value: (typeof auditFilters)[K]) =>
    setAuditFilters((current) => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const editEmployee = (employee: AdminEmployee) => {
    setForm({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? "",
      password: "",
      role: (ROLE_OPTIONS.some((item) => item.value === employee.role) ? employee.role : "staff") as AdminRole,
      jobTitle: employee.jobTitle ?? "",
      adminAccess: employee.adminAccess,
      isActive: employee.isActive,
      adminPermissions: employee.adminPermissions,
      discountType: (employee.discountType as "percentage" | "fixed") ?? "percentage",
      discountValue: employee.discountValue ?? 0,
      maxDiscount: employee.maxDiscount ?? null,
      commissionRate: employee.commissionRate ?? 0,
      commissionType: (employee.commissionType as "percentage" | "fixed") ?? "percentage",
    });
    setActiveTab("employees");
    setMessage(null);
  };

  const togglePermission = (permission: string) => {
    setForm((current) => ({
      ...current,
      adminPermissions: current.adminPermissions.includes(permission)
        ? current.adminPermissions.filter((item) => item !== permission)
        : [...current.adminPermissions, permission],
    }));
  };

  const applyRoleTemplate = (role: AdminRole) => {
    setForm((current) => ({
      ...current,
      role,
      adminPermissions: [...ROLE_FEATURE_TEMPLATES[role]],
      adminAccess: true,
    }));
  };

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const endpoint = "/api/admin/settings/staff";
      const method = form.id ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ بيانات الموظف.");
      }
      await Promise.all([loadEmployees(), loadLogs()]);
      setMessage({ text: form.id ? "تم تحديث الحساب بنجاح." : "تم إنشاء الحساب بنجاح.", ok: true });
      resetForm();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "تعذر حفظ بيانات الموظف.", ok: false });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm text-[#d7aabd]">جارٍ تحميل الإعدادات...</div>;
  }

  const targetTypes = Array.from(new Set(logs.map((log) => log.targetType))).sort();
  const actionTypes = Array.from(new Set(logs.map((log) => log.action))).sort();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab("employees")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "employees" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
          >
            حسابات الموظفين
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "audit" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
          >
            سجل التغييرات
          </button>
        </div>

        {activeTab === "employees" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#1b0d14] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-white">{form.id ? "تعديل حساب موظف" : "إنشاء حساب موظف"}</div>
                  <div className="text-xs text-[#d7aabd]">أنشئ حسابات للمدربات أو الاستاف أو المحاسبين وحدد صلاحيات كل حساب يدويًا.</div>
                </div>
                {form.id ? (
                  <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-[#d7aabd]">
                    حساب جديد
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" placeholder="الاسم" value={form.name} onChange={(e) => updateForm("name", e.target.value)} />
                <input className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" placeholder="البريد الإلكتروني" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
                <input className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" placeholder={form.id ? "كلمة مرور جديدة - اختياري" : "كلمة المرور"} value={form.password} onChange={(e) => updateForm("password", e.target.value)} />
                <input className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" placeholder="رقم الهاتف" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} />
                <input className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" placeholder="المسمى الوظيفي" value={form.jobTitle} onChange={(e) => updateForm("jobTitle", e.target.value)} />
                <select className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white" value={form.role} onChange={(e) => applyRoleTemplate(e.target.value as AdminRole)}>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {(form.role === "staff" || form.role === "trainer") && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-bold text-white">إعدادات الخصم والعمولة</div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">نوع الخصم الممنوح للعملاء</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.discountType}
                        onChange={(e) => updateForm("discountType", e.target.value as "percentage" | "fixed")}
                      >
                        <option value="percentage">نسبة مئوية %</option>
                        <option value="fixed">مبلغ ثابت ج.م</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        {form.discountType === "percentage" ? "نسبة الخصم %" : "مبلغ الخصم ج.م"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={form.discountType === "percentage" ? 1 : 10}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.discountValue}
                        onChange={(e) => updateForm("discountValue", Number(e.target.value))}
                      />
                    </div>
                    {form.discountType === "percentage" && (
                      <div className="space-y-1">
                        <label className="text-xs text-[#d7aabd]">الحد الأقصى للخصم ج.م (اختياري)</label>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                          value={form.maxDiscount ?? ""}
                          placeholder="بدون حد أقصى"
                          onChange={(e) => updateForm("maxDiscount", e.target.value === "" ? null : Number(e.target.value))}
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">نوع العمولة</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.commissionType}
                        onChange={(e) => updateForm("commissionType", e.target.value as "percentage" | "fixed")}
                      >
                        <option value="percentage">نسبة مئوية %</option>
                        <option value="fixed">مبلغ ثابت ج.م</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        {form.commissionType === "percentage" ? "نسبة العمولة %" : "مبلغ العمولة ج.م"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={form.commissionType === "percentage" ? 1 : 10}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.commissionRate}
                        onChange={(e) => updateForm("commissionRate", Number(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-[#fff4f8]">
                  <input type="checkbox" checked={form.adminAccess} onChange={(e) => updateForm("adminAccess", e.target.checked)} />
                  يملك دخول لوحة الإدارة
                </label>
                <label className="flex items-center gap-2 text-sm text-[#fff4f8]">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => updateForm("isActive", e.target.checked)} />
                  الحساب نشط
                </label>
              </div>

              <div className="mt-5">
                <div className="mb-3 text-sm font-bold text-white">الصلاحيات</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ADMIN_FEATURES.filter((feature) => {
                    // Trainers can never be granted discount code management
                    if (form.role === "trainer" && feature === "discounts") return false;
                    return true;
                  }).map((feature) => (
                    <label key={feature} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-[#fff4f8]">
                      <input
                        type="checkbox"
                        checked={form.adminPermissions.includes(feature)}
                        onChange={() => togglePermission(feature)}
                      />
                      <span>{FEATURE_LABELS[feature] ?? feature}</span>
                    </label>
                  ))}
                </div>
              </div>

              {message ? (
                <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-emerald-950/40 text-emerald-200" : "bg-red-950/40 text-red-200"}`}>
                  {message.text}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saving} onClick={submit} className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : form.id ? "حفظ التعديلات" : "إنشاء الحساب"}
                </button>
                <button type="button" onClick={resetForm} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-[#d7aabd]">
                  إعادة تعيين
                </button>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full bg-black/20 text-right">
                <thead className="bg-white/5 text-xs text-[#d7aabd]">
                  <tr>
                    <th className="px-4 py-3">الاسم</th>
                    <th className="px-4 py-3">الدور</th>
                    <th className="px-4 py-3">النشاط</th>
                    <th className="px-4 py-3">الخصم</th>
                    <th className="px-4 py-3">العمولة</th>
                    <th className="px-4 py-3">الصلاحيات</th>
                    <th className="px-4 py-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-t border-white/10 text-sm text-white">
                      <td className="px-4 py-3">
                        <div className="font-bold">{employee.name || "بدون اسم"}</div>
                        <div className="text-xs text-[#d7aabd]">{employee.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{getRoleLabel(employee.role)}</div>
                        <div className="text-xs text-[#d7aabd]">{employee.jobTitle || "بدون مسمى"}</div>
                      </td>
                      <td className="px-4 py-3">{employee.isActive ? "نشط" : "موقوف"}</td>
                      <td className="px-4 py-3 text-xs text-[#d7aabd]">
                        {(employee.role === "staff" || employee.role === "trainer") && employee.discountValue > 0
                          ? employee.discountType === "percentage"
                            ? `${employee.discountValue}%${employee.maxDiscount ? ` (حد ${employee.maxDiscount} ج.م)` : ""}`
                            : `${employee.discountValue} ج.م`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#d7aabd]">
                        {(employee.role === "staff" || employee.role === "trainer") && employee.commissionRate > 0
                          ? employee.commissionType === "percentage"
                            ? `${employee.commissionRate}%`
                            : `${employee.commissionRate} ج.م`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-sm whitespace-normal text-xs text-[#d7aabd]">
                          {employee.adminPermissions.map((permission) => FEATURE_LABELS[permission] ?? permission).join("، ") || "بدون صلاحيات"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => editEmployee(employee)} className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-bold text-white">
                          تعديل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#1b0d14] p-4 text-sm text-[#d7aabd]">
              اعرض سجل العمليات التي تمت داخل لوحة الإدارة، مع توضيح اسم الحساب الذي قام بالإجراء ونوع العملية والبيانات المرتبطة بها.
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#1b0d14] p-4 md:grid-cols-2 xl:grid-cols-5">
              <select
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                value={auditFilters.actorUserId}
                onChange={(e) => updateAuditFilter("actorUserId", e.target.value)}
              >
                <option value="">كل الحسابات</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name || employee.email}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                value={auditFilters.targetType}
                onChange={(e) => updateAuditFilter("targetType", e.target.value)}
              >
                <option value="">كل الكيانات</option>
                {targetTypes.map((targetType) => (
                  <option key={targetType} value={targetType}>
                    {targetType}
                  </option>
                ))}
              </select>
              <select
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                value={auditFilters.action}
                onChange={(e) => updateAuditFilter("action", e.target.value)}
              >
                <option value="">كل العمليات</option>
                {actionTypes.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                placeholder="بحث بالبريد أو النوع أو المعرف"
                value={auditFilters.search}
                onChange={(e) => updateAuditFilter("search", e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadLogs()}
                  disabled={auditLoading}
                  className="flex-1 rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  تحديث
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = { actorUserId: "", targetType: "", action: "", search: "" };
                    setAuditFilters(next);
                    void loadLogs(next);
                  }}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-[#d7aabd]"
                >
                  مسح
                </button>
              </div>
            </div>
            {logs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-10 text-center">
                <div className="text-base font-black text-white">لا توجد بيانات في سجل التغييرات</div>
                <div className="mt-2 text-sm text-[#d7aabd]">إذا لم تظهر نتائج بعد التحديث، فإما لا توجد عمليات مسجلة بعد أو أن الطلب فشل وسيظهر كرسالة أعلى الصفحة.</div>
              </div>
            ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                      <span>{log.actorName || "System"}</span>
                      <span className="rounded-full bg-pink-900/40 px-2 py-0.5 text-xs text-pink-300">
                        {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#d7aabd]">
                        {AUDIT_TARGET_LABELS[log.targetType] ?? log.targetType}
                      </span>
                    </div>
                    <div className="text-xs text-[#d7aabd]">
                      {new Date(log.createdAt).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="mb-2 text-xs text-[#a07080]">
                    {log.actorEmail || "بدون بريد"} {log.actorRole ? `· ${log.actorRole}` : ""}
                  </div>
                  <AuditDetailsView details={log.details} />
                </div>
              ))}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
