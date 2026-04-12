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
};

function tryFormatJson(value?: string | null) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<"employees" | "audit">("employees");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
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
      throw new Error(payload.error ?? "تعذر تحميل حسابات الموظفين.");
    }
    setEmployees(payload.employees ?? []);
  };

  const loadLogs = async (
    filters: { actorUserId: string; targetType: string; action: string; search: string } = auditFilters,
  ) => {
    const params = new URLSearchParams({ limit: "120" });
    if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
    if (filters.targetType) params.set("targetType", filters.targetType);
    if (filters.action) params.set("action", filters.action);
    if (filters.search) params.set("search", filters.search);

    const response = await fetch(`/api/admin/settings/audit-log?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "تعذر تحميل سجل التغييرات.");
    }
    setLogs(payload.logs ?? []);
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
                  {ADMIN_FEATURES.map((feature) => (
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
                    <th className="px-4 py-3">الدخول</th>
                    <th className="px-4 py-3">النشاط</th>
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
                      <td className="px-4 py-3">{employee.adminAccess ? "مفعل" : "غير مفعل"}</td>
                      <td className="px-4 py-3">{employee.isActive ? "نشط" : "موقوف"}</td>
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
              أي عملية `create / update / delete / upsert` تتم من خلال حسابات الإدارة تسجل هنا تلقائيًا مع اسم الحساب ونوع العملية والكيان المتأثر.
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
                  className="flex-1 rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white"
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
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-bold text-white">
                      {log.actorName || "System"} · {log.action} · {log.targetType}
                    </div>
                    <div className="text-xs text-[#d7aabd]">
                      {new Date(log.createdAt).toLocaleString("ar-EG")}
                    </div>
                  </div>
                  <div className="mb-2 text-xs text-[#d7aabd]">
                    {log.actorEmail || "بدون بريد"} {log.actorRole ? `• ${log.actorRole}` : ""} {log.targetId ? `• ${log.targetId}` : ""}
                  </div>
                  <pre className="overflow-x-auto rounded-xl bg-[#12080d] p-3 text-[11px] leading-6 text-[#f5d4df]">
                    {tryFormatJson(log.details)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
