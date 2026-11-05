"use client";

import { useEffect, useState } from "react";
import type { AdminEmployee, AuditLogEntry } from "../types";
import {
  ADMIN_FEATURES,
  BOOKING_PERMISSIONS,
  EMPLOYEE_PERMISSIONS,
  MARKETING_PERMISSIONS,
  ROLE_FEATURE_TEMPLATES,
  type AdminRole,
} from "@/lib/admin-permissions";
import Referrals from "./Referrals";
import TrainerReferrals from "./TrainerReferrals";

const ROLE_OPTIONS: Array<{ value: AdminRole; label: string }> = [
  { value: "admin", label: "مدير النظام" },
  { value: "staff", label: "استاف" },
  { value: "trainer", label: "مدربة" },
  { value: "accountant", label: "محاسب" },
  { value: "head_coach", label: "هيد كوتش" },
  { value: "nutritionist", label: "دكتورة التغذية" },
  { value: "contracts_manager", label: "مدير عقود" },
  { value: "agent", label: "مندوب مبيعات" },
  { value: "partner", label: "شريك" },
];

const FEATURE_LABELS: Record<string, string> = {
  settings: "الإعدادات والصلاحيات",
  overview: "لوحة التحكم",
  approvals: "مركز الطلبات والموافقات",
  "site-content": "الصفحات والمحتوى",
  knowledge: "قاعدة معرفة البوت",
  memberships: "الاشتراكات والباقات",
  offers: "العروض",
  classes: "الكلاسات",
  trainers: "المدربات",
  employees: "الموظفون والموارد البشرية",
  customers: "العملاء",
  products: "المنتجات",
  inventory: "المخزون",
  reviews: "الآراء",
  bookings: "الحجوزات",
  orders: "الطلبات والمدفوعات",
  balance: "الرصيد والفيتزونات",
  chat: "الدردشة المباشرة",
  complaints: "الشكاوى",
  discounts: "أكواد الخصم",
  rewards: "المكافآت والإحالة",
  "db-maintenance": "إدارة قاعدة البيانات",
  accounting: "الحسابات والتقارير",
  push: "الإشعارات الفورية",
  partners: "الشركاء والعمولات",
  contracts: "التعاقدات والمناديب",
  referrals: "لينكات إحالة الاستاف",
  nutrition: "التغذية",
  suppliers: "الموردون",
  "delivery-companies": "شركات التوصيل",
  "store-campaigns": "حملة هدايا المتجر",
  "store-free-gifts": "لعبة الهدايا المجانية",
  blog: "المدونة فقط",
  bookings_view: "مشاهدة الحجوزات",
  bookings_create: "إضافة حجز",
  bookings_reschedule: "تعديل موعد الحجز",
  class_exchanges_review: "قبول ورفض طلبات استبدال الكلاسات",
  class_exchanges_execute: "تنفيذ استبدال كلاس مباشر",
  marketing_conversions_manage: "إدارة متابعة التسويق وإغلاق المبيعات",
  customer_followup_assigned_only: "عرض عملاء المتابعة المسندين فقط",
  bookings_cancel: "إلغاء الحجز",
  bookings_delete: "حذف الحجز",
  bookings_bulk_delete: "حذف جماعي",
  manual_attendance: "تسجيل حضور يدوي",
  qr_attendance: "تسجيل حضور عبر QR",
  employees_view: "مشاهدة بيانات الموظفين",
  employees_manage: "إدارة بيانات الموظفين",
  departments_manage: "إدارة الأقسام",
  positions_manage: "إدارة المسميات الوظيفية",
  payroll_eligibility_view: "مشاهدة استحقاق الموظفين للراتب",
  payroll_eligibility_manage: "إدارة استحقاق الموظفين للراتب",
  payroll_run_view: "مشاهدة كشوف الرواتب",
  payroll_run_calculate: "حساب كشوف الرواتب",
  payroll_run_finalize: "اعتماد كشوف الرواتب نهائيًا",

  // الحضور والانصراف
  employee_attendance_view: "مشاهدة الحضور والانصراف",
  employee_attendance_manage: "تسجيل وتعديل الحضور والانصراف",
  employee_attendance_lock: "قفل فترة الحضور والانصراف",
  employee_attendance_override: "إعادة فتح وتجاوز قفل فترة الحضور",
  coach_class_attendance_view: "مشاهدة حضور المدربين للكلاسات",
  coach_class_attendance_manage: "إدارة حضور المدربين للكلاسات",

  // شروط الرواتب
  employee_compensation_view: "مشاهدة شروط الرواتب والمستحقات",
  employee_compensation_manage: "إدارة شروط الرواتب والمستحقات",

  // مستحقات الكلاسات الثابتة
  fixed_class_earning_view: "مشاهدة مستحقات الكلاسات الثابتة",
  fixed_class_earning_calculate: "حساب مستحقات الكلاسات الثابتة",
  fixed_class_earning_finalize: "اعتماد مستحقات الكلاسات الثابتة",

  // مستحقات حضور المتدربين
  trainee_class_earning_view: "مشاهدة مستحقات حضور المتدربين",
  trainee_class_earning_calculate: "حساب مستحقات حضور المتدربين",
  trainee_class_earning_finalize: "اعتماد مستحقات حضور المتدربين",

  // مستحقات اشتراكات المدربين
  coach_membership_earning_view: "مشاهدة مستحقات اشتراكات المدربين",
  coach_membership_earning_finalize: "اعتماد مستحقات اشتراكات المدربين",

  // الجلسات الخاصة
  private_session_earning_view: "مشاهدة مستحقات الجلسات الخاصة",
  private_session_earning_calculate: "حساب مستحقات الجلسات الخاصة",
  private_session_earning_finalize: "اعتماد مستحقات الجلسات الخاصة",

  // التحليلات
  analytics_view: "مشاهدة تحليلات الموقع",
};

type PermissionGroup = {
  id: string;
  title: string;
  description: string;
  permissions: string[];
  accent: {
    border: string;
    badge: string;
    icon: string;
    glow: string;
  };
};

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: "system",
    title: "الوصول والإدارة",
    description: "الشاشات الرئيسية وإعدادات النظام.",
    accent: {
      border: "border-[#e62978]/45",
      badge: "bg-[#e62978]/15 text-[#ffb2d0]",
      icon: "text-[#ff4f98]",
      glow: "shadow-[0_0_24px_rgba(230,41,120,0.08)]",
    },
    permissions: [
      "overview",
      "approvals",
      "settings",
      "analytics_view",
      "db-maintenance",
    ],
  },
  {
    id: "customers-memberships",
    title: "العملاء والاشتراكات",
    description: "العملاء والاشتراكات والعروض والمكافآت.",
    accent: {
      border: "border-[#b66cff]/40",
      badge: "bg-[#b66cff]/15 text-[#d7b0ff]",
      icon: "text-[#c287ff]",
      glow: "shadow-[0_0_24px_rgba(182,108,255,0.07)]",
    },
    permissions: [
      "customers",
      "customer_followup_assigned_only",
      "memberships",
      "offers",
      "rewards",
      "discounts",
    ],
  },
  {
    id: "classes-bookings",
    title: "الكلاسات والحجوزات",
    description: "الكلاسات والمدربين والحجوزات والحضور الخاص بالعملاء.",
    accent: {
      border: "border-[#ff4f9a]/40",
      badge: "bg-[#ff4f9a]/15 text-[#ffbad8]",
      icon: "text-[#ff69a8]",
      glow: "shadow-[0_0_24px_rgba(255,79,154,0.07)]",
    },
    permissions: ["classes", "trainers", "bookings", ...BOOKING_PERMISSIONS],
  },
  {
    id: "employees",
    title: "الموظفون والموارد البشرية",
    description: "ملفات الموظفين والأقسام والمسميات الوظيفية.",
    accent: {
      border: "border-[#8b6cff]/40",
      badge: "bg-[#8b6cff]/15 text-[#c8baff]",
      icon: "text-[#a18cff]",
      glow: "shadow-[0_0_24px_rgba(139,108,255,0.07)]",
    },
    permissions: [
      "employees",
      "employees_view",
      "employees_manage",
      "departments_manage",
      "positions_manage",
    ],
  },
  {
    id: "attendance",
    title: "الحضور والانصراف",
    description: "حضور الموظفين وحضور المدربين للكلاسات.",
    accent: {
      border: "border-[#6d8cff]/40",
      badge: "bg-[#6d8cff]/15 text-[#b9c6ff]",
      icon: "text-[#89a1ff]",
      glow: "shadow-[0_0_24px_rgba(109,140,255,0.07)]",
    },
    permissions: [
      "employee_attendance_view",
      "employee_attendance_manage",
      "employee_attendance_lock",
      "employee_attendance_override",
      "coach_class_attendance_view",
      "coach_class_attendance_manage",
    ],
  },
  {
    id: "payroll",
    title: "الرواتب والمستحقات",
    description: "شروط الرواتب والاستحقاق وكشوف الرواتب ومستحقات المدربين.",
    accent: {
      border: "border-[#d7a94b]/40",
      badge: "bg-[#d7a94b]/15 text-[#f2d48a]",
      icon: "text-[#e6bd64]",
      glow: "shadow-[0_0_24px_rgba(215,169,75,0.07)]",
    },
    permissions: [
      "employee_compensation_view",
      "employee_compensation_manage",
      "payroll_eligibility_view",
      "payroll_eligibility_manage",
      "payroll_run_view",
      "payroll_run_calculate",
      "payroll_run_finalize",
      "fixed_class_earning_view",
      "fixed_class_earning_calculate",
      "fixed_class_earning_finalize",
      "trainee_class_earning_view",
      "trainee_class_earning_calculate",
      "trainee_class_earning_finalize",
      "coach_membership_earning_view",
      "coach_membership_earning_finalize",
      "private_session_earning_view",
      "private_session_earning_calculate",
      "private_session_earning_finalize",
    ],
  },
  {
    id: "store",
    title: "المتجر والمخزون",
    description: "المنتجات والمخزون والموردون وشركات التوصيل.",
    accent: {
      border: "border-[#4fa983]/40",
      badge: "bg-[#4fa983]/15 text-[#9fd6c0]",
      icon: "text-[#6fc29c]",
      glow: "shadow-[0_0_24px_rgba(79,169,131,0.07)]",
    },
    permissions: [
      "products",
      "inventory",
      "suppliers",
      "delivery-companies",
      "store-campaigns",
      "store-free-gifts",
    ],
  },
  {
    id: "finance",
    title: "الحسابات والمدفوعات",
    description: "الحسابات والطلبات والمدفوعات والأرصدة.",
    accent: {
      border: "border-[#4f93a9]/40",
      badge: "bg-[#4f93a9]/15 text-[#abd5df]",
      icon: "text-[#72b4c5]",
      glow: "shadow-[0_0_24px_rgba(79,147,169,0.07)]",
    },
    permissions: ["accounting", "orders", "balance"],
  },
  {
    id: "marketing",
    title: "التسويق والشركاء والعمولات",
    description: "الإحالات والشركاء والتعاقدات ومتابعة المبيعات.",
    accent: {
      border: "border-[#d95a76]/40",
      badge: "bg-[#d95a76]/15 text-[#f4b1bf]",
      icon: "text-[#e57990]",
      glow: "shadow-[0_0_24px_rgba(217,90,118,0.07)]",
    },
    permissions: [
      "partners",
      "contracts",
      "referrals",
      ...MARKETING_PERMISSIONS,
    ],
  },
  {
    id: "content",
    title: "المحتوى والتواصل",
    description: "المحتوى والإشعارات والدردشة والشكاوى والتقييمات.",
    accent: {
      border: "border-[#9c7a9b]/40",
      badge: "bg-[#9c7a9b]/15 text-[#d7bdd6]",
      icon: "text-[#b692b5]",
      glow: "shadow-[0_0_24px_rgba(156,122,155,0.07)]",
    },
    permissions: [
      "site-content",
      "blog",
      "knowledge",
      "push",
      "chat",
      "complaints",
      "reviews",
      "nutrition",
    ],
  },
];

const ALL_GROUPED_PERMISSIONS = Array.from(
  new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions)),
);

const permissionLabel = (permission: string) =>
  FEATURE_LABELS[permission] ?? "صلاحية غير معرّفة";

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
  marketingCommissionRate: number;
  marketingCommissionType: "percentage" | "fixed";
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
  marketingCommissionRate: 0,
  marketingCommissionType: "percentage",
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
  // nutrition
  create_nutritionist_profile: "إنشاء ملف دكتورة التغذية",
  update_nutritionist_profile: "تعديل ملف دكتورة التغذية",
  delete_nutritionist_profile: "حذف ملف دكتورة التغذية",
  delete_nutrition_session: "حذف جلسة تغذية",
  nutrition_approve: "قبول جلسة تغذية",
  nutrition_reject: "رفض جلسة تغذية",
  nutrition_propose_slots: "اقتراح مواعيد",
  nutrition_complete: "إتمام جلسة تغذية",
  nutrition_cancel: "إلغاء جلسة تغذية",
  nutritionist_approve: "قبول جلسة (دكتورة)",
  nutritionist_reject: "رفض جلسة (دكتورة)",
  nutritionist_propose_slots: "اقتراح مواعيد (دكتورة)",
  nutritionist_complete: "إتمام جلسة (دكتورة)",
  nutritionist_cancel: "إلغاء جلسة (دكتورة)",
  // suppliers
  create_supplier: "إضافة مورد",
  update_supplier: "تعديل مورد",
  delete_supplier: "حذف مورد",
  activate_supplier: "تفعيل مورد",
  deactivate_supplier: "تعطيل مورد",
  // delivery companies
  create_delivery_company: "إضافة شركة توصيل",
  update_delivery_company: "تعديل شركة توصيل",
  delete_delivery_company: "حذف شركة توصيل",
  activate_delivery_company: "تفعيل شركة توصيل",
  deactivate_delivery_company: "تعطيل شركة توصيل",
  // contracts & partners
  create_partner: "إضافة شريك",
  create_agent: "إضافة مندوب",
  create_contracts_manager: "إضافة مدير عقود",
  settle_commissions: "تسوية عمولات",
  settle_manager_commissions: "تسوية عمولات المدير",
  // orders
  update_order: "تعديل طلب",
};

const AUDIT_TARGET_LABELS: Record<string, string> = {
  userMembership: "اشتراك",
  partner: "شريك",
  partnerCommission: "عمولة شريك",
  agentCommission: "عمولة موظف",
  booking: "حجز",
  user: "مستخدم",
  customer: "عميل",
  order: "طلب",
  Order: "طلب",
  product: "منتج",
  discount: "كود خصم",
  discount_code: "كود خصم",
  trainer: "مدربة",
  expense: "مصروف",
  feeRule: "قاعدة عمولة",
  membership: "باقة اشتراك",
  offer: "عرض",
  privateSession: "جلسة خاصة",
  complaint: "شكوى",
  notification: "إشعار",
  NutritionSession: "جلسة تغذية",
  NutritionistProfile: "دكتورة التغذية",
  Supplier: "مورد",
  DeliveryCompany: "شركة توصيل",
  contracts_manager: "مدير عقود",
  sales_agent: "مندوب مبيعات",
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
  changes: "التغييرات",
  action: "الإجراء",
  deletedMemberships: "اشتراكات محذوفة",
  deletedBookings: "حجوزات محذوفة",
  deletedOffers: "عروض محذوفة",
  deletedProducts: "منتجات محذوفة",
  deletedOrders: "طلبات محذوفة",
  deletedSessions: "جلسات محذوفة",
  token: "الرمز",
  sessionId: "معرف الجلسة",
  nutritionistId: "معرف الدكتورة",
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
    return (
      <p className="mt-2 rounded-xl bg-[#12080d] p-3 text-[11px] text-[#f5d4df]">
        {details}
      </p>
    );
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl bg-[#12080d] p-3">
      <div
        className="grid gap-x-6 gap-y-1"
        style={{ gridTemplateColumns: "max-content 1fr" }}
      >
        {entries.map(([key, val]) => (
          <>
            <span
              key={`${key}-k`}
              className="text-[11px] text-[#a07080] whitespace-nowrap"
            >
              {AUDIT_DETAIL_LABELS[key] ?? key}
            </span>
            <span
              key={`${key}-v`}
              className="text-[11px] text-[#f5d4df] font-medium break-all"
            >
              {fmtDetailVal(val)}
            </span>
          </>
        ))}
      </div>
    </div>
  );
}

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export default function Settings({
  userRole = "staff",
  permissions = [],
}: {
  userRole?: string;
  permissions?: string[];
}) {
  const canManageSettings =
    userRole === "admin" || permissions.includes("settings");
  const canManageTrainerReferrals =
    userRole === "admin" || userRole === "head_coach" || userRole === "trainer";
  const [permissionSearch, setPermissionSearch] = useState("");
  const [openPermissionGroups, setOpenPermissionGroups] = useState<string[]>([
    "system",
    "employees",
    "attendance",
    "payroll",
  ]);

  const [activeTab, setActiveTab] = useState<
    "employees" | "referrals" | "trainer-referrals" | "audit"
  >(canManageSettings ? "employees" : "referrals");
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [auditFilters, setAuditFilters] = useState({
    actorUserId: "",
    targetType: "",
    action: "",
    search: "",
  });

  const loadEmployees = async () => {
    if (!canManageSettings) {
      setEmployees([]);
      return;
    }
    const response = await fetch("/api/admin/settings/staff", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "تعذر تحميل بيانات الموظفين.");
    }
    setEmployees(payload.employees ?? []);
  };

  const loadLogs = async (
    filters: {
      actorUserId: string;
      targetType: string;
      action: string;
      search: string;
    } = auditFilters,
  ) => {
    if (!canManageSettings) {
      setLogs([]);
      return;
    }
    setAuditLoading(true);
    const params = new URLSearchParams({ limit: "120" });
    if (filters.actorUserId) params.set("actorUserId", filters.actorUserId);
    if (filters.targetType) params.set("targetType", filters.targetType);
    if (filters.action) params.set("action", filters.action);
    if (filters.search) params.set("search", filters.search);

    try {
      const response = await fetch(
        `/api/admin/settings/audit-log?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر تحميل سجل التغييرات.");
      }
      setLogs(payload.logs ?? []);
      setMessage(null);
    } catch (error) {
      setMessage({
        text:
          error instanceof Error ? error.message : "تعذر تحميل سجل التغييرات.",
        ok: false,
      });
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await (canManageSettings
          ? Promise.all([loadEmployees(), loadLogs()])
          : Promise.resolve());
      } catch (error) {
        if (!cancelled) {
          setMessage({
            text:
              error instanceof Error ? error.message : "تعذر تحميل الإعدادات.",
            ok: false,
          });
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
    if (!canManageSettings) return;
    void loadLogs();
  }, [activeTab, canManageSettings]);

  const updateForm = <K extends keyof EmployeeForm>(
    key: K,
    value: EmployeeForm[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const updateAuditFilter = <K extends keyof typeof auditFilters>(
    key: K,
    value: (typeof auditFilters)[K],
  ) => setAuditFilters((current) => ({ ...current, [key]: value }));

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
      role: (ROLE_OPTIONS.some((item) => item.value === employee.role)
        ? employee.role
        : "staff") as AdminRole,
      jobTitle: employee.jobTitle ?? "",
      adminAccess: employee.adminAccess,
      isActive: employee.isActive,
      adminPermissions: employee.adminPermissions,
      discountType:
        (employee.discountType as "percentage" | "fixed") ?? "percentage",
      discountValue: employee.discountValue ?? 0,
      maxDiscount: employee.maxDiscount ?? null,
      commissionRate: employee.commissionRate ?? 0,
      commissionType:
        (employee.commissionType as "percentage" | "fixed") ?? "percentage",
      marketingCommissionRate: employee.marketingCommissionRate ?? 0,
      marketingCommissionType:
        (employee.marketingCommissionType as "percentage" | "fixed") ??
        "percentage",
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

  const togglePermissionGroup = (groupId: string) => {
    setOpenPermissionGroups((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  };

  const setPermissionGroupChecked = (
    permissions: string[],
    checked: boolean,
  ) => {
    setForm((current) => {
      if (checked) {
        return {
          ...current,
          adminPermissions: Array.from(
            new Set([...current.adminPermissions, ...permissions]),
          ),
        };
      }

      return {
        ...current,
        adminPermissions: current.adminPermissions.filter(
          (permission) => !permissions.includes(permission),
        ),
      };
    });
  };

  const applyRoleTemplate = (role: AdminRole) => {
    setForm((current) => ({
      ...current,
      role,
      adminPermissions: [...ROLE_FEATURE_TEMPLATES[role]],
      adminAccess: true,
    }));
  };

  const toggleActive = async (employee: AdminEmployee) => {
    setTogglingId(employee.id);
    await fetch("/api/admin/settings/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: employee.id, isActive: !employee.isActive }),
    });
    await loadEmployees();
    setTogglingId(null);
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
      setMessage({
        text: form.id ? "تم تحديث الحساب بنجاح." : "تم إنشاء الحساب بنجاح.",
        ok: true,
      });
      resetForm();
    } catch (error) {
      setMessage({
        text:
          error instanceof Error ? error.message : "تعذر حفظ بيانات الموظف.",
        ok: false,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-black/20 p-6 text-sm text-[#d7aabd]">
        جارٍ تحميل الإعدادات...
      </div>
    );
  }

  const targetTypes = Array.from(
    new Set(logs.map((log) => log.targetType)),
  ).sort();
  const actionTypes = Array.from(new Set(logs.map((log) => log.action))).sort();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
        <div className="mb-4 flex flex-wrap gap-3">
          {canManageSettings && (
            <button
              type="button"
              onClick={() => setActiveTab("employees")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "employees" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
            >
              حسابات الموظفين
            </button>
          )}
          {canManageSettings && (
            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "audit" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
            >
              سجل التغييرات
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("referrals")}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "referrals" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
          >
            لينكات إحالة الاستاف
          </button>
          {canManageTrainerReferrals && (
            <button
              type="button"
              onClick={() => setActiveTab("trainer-referrals")}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${activeTab === "trainer-referrals" ? "bg-pink-600 text-white" : "bg-white/5 text-[#d7aabd]"}`}
            >
              لينكات إحالة المدربات
            </button>
          )}
        </div>

        {activeTab === "employees" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#1b0d14] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-black text-white">
                    {form.id ? "تعديل حساب موظف" : "إنشاء حساب موظف"}
                  </div>
                  <div className="text-xs text-[#d7aabd]">
                    أنشئ حسابات للمدربات أو الاستاف أو المحاسبين وحدد صلاحيات كل
                    حساب يدويًا.
                  </div>
                </div>
                {form.id ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs text-[#d7aabd]"
                  >
                    حساب جديد
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  placeholder="الاسم"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  placeholder="البريد الإلكتروني"
                  value={form.email}
                  onChange={(e) => updateForm("email", e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  placeholder={
                    form.id ? "كلمة مرور جديدة - اختياري" : "كلمة المرور"
                  }
                  value={form.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  placeholder="رقم الهاتف"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                />
                <input
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  placeholder="المسمى الوظيفي"
                  value={form.jobTitle}
                  onChange={(e) => updateForm("jobTitle", e.target.value)}
                />
                <select
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                  value={form.role}
                  onChange={(e) =>
                    applyRoleTemplate(e.target.value as AdminRole)
                  }
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {(form.role === "staff" || form.role === "trainer") && (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm font-bold text-white">
                    إعدادات الخصم والعمولة
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        نوع الخصم الممنوح للعملاء
                      </label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.discountType}
                        onChange={(e) =>
                          updateForm(
                            "discountType",
                            e.target.value as "percentage" | "fixed",
                          )
                        }
                      >
                        <option value="percentage">نسبة مئوية %</option>
                        <option value="fixed">مبلغ ثابت ج.م</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        {form.discountType === "percentage"
                          ? "نسبة الخصم %"
                          : "مبلغ الخصم ج.م"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={form.discountType === "percentage" ? 1 : 10}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.discountValue}
                        onChange={(e) =>
                          updateForm("discountValue", Number(e.target.value))
                        }
                      />
                    </div>
                    {form.discountType === "percentage" && (
                      <div className="space-y-1">
                        <label className="text-xs text-[#d7aabd]">
                          الحد الأقصى للخصم ج.م (اختياري)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                          value={form.maxDiscount ?? ""}
                          placeholder="بدون حد أقصى"
                          onChange={(e) =>
                            updateForm(
                              "maxDiscount",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        نوع العمولة
                      </label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.commissionType}
                        onChange={(e) =>
                          updateForm(
                            "commissionType",
                            e.target.value as "percentage" | "fixed",
                          )
                        }
                      >
                        <option value="percentage">نسبة مئوية %</option>
                        <option value="fixed">مبلغ ثابت ج.م</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-[#d7aabd]">
                        {form.commissionType === "percentage"
                          ? "نسبة العمولة %"
                          : "مبلغ العمولة ج.م"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={form.commissionType === "percentage" ? 1 : 10}
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                        value={form.commissionRate}
                        onChange={(e) =>
                          updateForm("commissionRate", Number(e.target.value))
                        }
                      />
                    </div>

                    <div className="md:col-span-2 mt-2 border-t border-white/10 pt-4">
                      <div className="mb-3">
                        <div className="text-sm font-bold text-white">
                          عمولة إغلاق التسويق
                        </div>
                        <div className="mt-1 text-xs text-[#d7aabd]">
                          مستقلة عن عمولة الإحالة، وتُثبت وقت بدء Checkout
                          للعميل المحال لموظف التسويق.
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs text-[#d7aabd]">
                            نوع عمولة إغلاق التسويق
                          </label>
                          <select
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                            value={form.marketingCommissionType}
                            onChange={(e) =>
                              updateForm(
                                "marketingCommissionType",
                                e.target.value as "percentage" | "fixed",
                              )
                            }
                          >
                            <option value="percentage">نسبة مئوية %</option>
                            <option value="fixed">مبلغ ثابت ج.م</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs text-[#d7aabd]">
                            {form.marketingCommissionType === "percentage"
                              ? "نسبة عمولة إغلاق التسويق %"
                              : "مبلغ عمولة إغلاق التسويق ج.م"}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={
                              form.marketingCommissionType === "percentage"
                                ? 100
                                : undefined
                            }
                            step={
                              form.marketingCommissionType === "percentage"
                                ? 1
                                : 10
                            }
                            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white"
                            value={form.marketingCommissionRate}
                            onChange={(e) =>
                              updateForm(
                                "marketingCommissionRate",
                                Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm text-[#fff4f8]">
                  <input
                    type="checkbox"
                    checked={form.adminAccess}
                    onChange={(e) =>
                      updateForm("adminAccess", e.target.checked)
                    }
                  />
                  يملك دخول لوحة الإدارة
                </label>
                <label className="flex items-center gap-2 text-sm text-[#fff4f8]">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateForm("isActive", e.target.checked)}
                  />
                  الحساب نشط
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-base font-black text-white">
                      مركز الصلاحيات
                    </div>
                    <p className="mt-1 text-xs text-[#d7aabd]">
                      الصلاحيات مقسمة حسب الوظيفة لتسهيل إدارة وصول الموظف.
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-[#ffd6e5]">
                    المختار: {form.adminPermissions.length}
                  </div>
                </div>

                <div className="mt-4">
                  <input
                    type="search"
                    value={permissionSearch}
                    onChange={(event) =>
                      setPermissionSearch(event.target.value)
                    }
                    placeholder="ابحث عن صلاحية..."
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-[#a9798d] focus:border-[#e62978]/60"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {PERMISSION_GROUPS.map((group) => {
                    let permissions = group.permissions.filter((permission) =>
                      ALL_GROUPED_PERMISSIONS.includes(permission),
                    );

                    if (form.role === "trainer") {
                      permissions = permissions.filter(
                        (permission) =>
                          !["discounts", "settings", "accounting"].includes(
                            permission,
                          ),
                      );
                    }

                    const query = permissionSearch.trim().toLowerCase();

                    const filteredPermissions = query
                      ? permissions.filter((permission) =>
                          permissionLabel(permission)
                            .toLowerCase()
                            .includes(query),
                        )
                      : permissions;

                    if (query && filteredPermissions.length === 0) {
                      return null;
                    }

                    const selectedCount = permissions.filter((permission) =>
                      form.adminPermissions.includes(permission),
                    ).length;

                    const allSelected =
                      permissions.length > 0 &&
                      selectedCount === permissions.length;

                    const isOpen =
                      query.length > 0 ||
                      openPermissionGroups.includes(group.id);

                    return (
                      <div
                        key={group.id}
                        className={`overflow-hidden rounded-2xl border bg-black/20 transition-all ${group.accent.border} ${
                          isOpen ? group.accent.glow : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => togglePermissionGroup(group.id)}
                          className="flex w-full items-center justify-between gap-4 px-4 py-4 text-right"
                        >
                          <div>
                            <div className="font-bold text-white">
                              {group.title}
                            </div>
                            <div className="mt-1 text-xs text-[#c997ab]">
                              {group.description}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${group.accent.badge}`}
                            >
                              {selectedCount}/{permissions.length}
                            </span>

                            <span
                              className={`text-lg font-bold ${group.accent.icon}`}
                            >
                              {isOpen ? "−" : "+"}
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-white/10 px-4 pb-4">
                            <div className="flex items-center justify-end py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setPermissionGroupChecked(
                                    permissions,
                                    !allSelected,
                                  )
                                }
                                className="rounded-lg border border-[#e62978]/30 bg-[#e62978]/10 px-3 py-1.5 text-xs font-bold text-[#ffb2d0]"
                              >
                                {allSelected
                                  ? "إلغاء تحديد المجموعة"
                                  : "تحديد المجموعة بالكامل"}
                              </button>
                            </div>

                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {filteredPermissions.map((permission) => (
                                <label
                                  key={permission}
                                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-[#fff4f8] transition hover:border-[#e62978]/40"
                                >
                                  <input
                                    type="checkbox"
                                    checked={form.adminPermissions.includes(
                                      permission,
                                    )}
                                    onChange={() =>
                                      togglePermission(permission)
                                    }
                                  />

                                  <span>{permissionLabel(permission)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {permissionSearch.trim() &&
                  !PERMISSION_GROUPS.some((group) =>
                    group.permissions.some((permission) =>
                      permissionLabel(permission)
                        .toLowerCase()
                        .includes(permissionSearch.trim().toLowerCase()),
                    ),
                  ) && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-center text-sm text-[#d7aabd]">
                      لا توجد صلاحية مطابقة للبحث.
                    </div>
                  )}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={submit}
                  className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {saving
                    ? "جارٍ الحفظ..."
                    : form.id
                      ? "حفظ التعديلات"
                      : "إنشاء الحساب"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm font-bold text-[#d7aabd]"
                >
                  إعادة تعيين
                </button>
              </div>
            </div>

            {/* بحث الموظفين */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍 ابحث بالاسم أو الإيميل أو الدور..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-right text-sm text-white placeholder-[#d7aabd] focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
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
                  {employees
                    .filter((e) => {
                      const q = employeeSearch.toLowerCase();
                      if (!q) return true;
                      return (
                        e.name?.toLowerCase().includes(q) ||
                        e.email?.toLowerCase().includes(q) ||
                        getRoleLabel(e.role).includes(q) ||
                        e.jobTitle?.toLowerCase().includes(q)
                      );
                    })
                    .map((employee) => (
                      <tr
                        key={employee.id}
                        className="border-t border-white/10 text-sm text-white"
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold">
                            {employee.name || "بدون اسم"}
                          </div>
                          <div className="text-xs text-[#d7aabd]">
                            {employee.email}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{getRoleLabel(employee.role)}</div>
                          <div className="text-xs text-[#d7aabd]">
                            {employee.jobTitle || "بدون مسمى"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {employee.isActive ? "نشط" : "موقوف"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#d7aabd]">
                          {(employee.role === "staff" ||
                            employee.role === "trainer") &&
                          employee.discountValue > 0
                            ? employee.discountType === "percentage"
                              ? `${employee.discountValue}%${employee.maxDiscount ? ` (حد ${employee.maxDiscount} ج.م)` : ""}`
                              : `${employee.discountValue} ج.م`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-[#d7aabd]">
                          {(employee.role === "staff" ||
                            employee.role === "trainer") &&
                          employee.commissionRate > 0
                            ? employee.commissionType === "percentage"
                              ? `${employee.commissionRate}%`
                              : `${employee.commissionRate} ج.م`
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-sm whitespace-normal text-xs text-[#d7aabd]">
                            {employee.adminPermissions
                              .map((permission) => permissionLabel(permission))
                              .join("، ") || "بدون صلاحيات"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => editEmployee(employee)}
                              className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-bold text-white"
                            >
                              تعديل
                            </button>
                            <button
                              type="button"
                              disabled={togglingId === employee.id}
                              onClick={() => void toggleActive(employee)}
                              className={`rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${employee.isActive ? "bg-red-700 hover:bg-red-600" : "bg-emerald-700 hover:bg-emerald-600"}`}
                            >
                              {togglingId === employee.id
                                ? "..."
                                : employee.isActive
                                  ? "تعطيل"
                                  : "تفعيل"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === "referrals" ? (
          <Referrals userRole={userRole} />
        ) : activeTab === "trainer-referrals" && canManageTrainerReferrals ? (
          <TrainerReferrals userRole={userRole} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#1b0d14] p-4 text-sm text-[#d7aabd]">
              اعرض سجل العمليات التي تمت داخل لوحة الإدارة، مع توضيح اسم الحساب
              الذي قام بالإجراء ونوع العملية والبيانات المرتبطة بها.
            </div>
            <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#1b0d14] p-4 md:grid-cols-2 xl:grid-cols-5">
              <select
                className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white"
                value={auditFilters.actorUserId}
                onChange={(e) =>
                  updateAuditFilter("actorUserId", e.target.value)
                }
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
                onChange={(e) =>
                  updateAuditFilter("targetType", e.target.value)
                }
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
                    const next = {
                      actorUserId: "",
                      targetType: "",
                      action: "",
                      search: "",
                    };
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
                <div className="text-base font-black text-white">
                  لا توجد بيانات في سجل التغييرات
                </div>
                <div className="mt-2 text-sm text-[#d7aabd]">
                  إذا لم تظهر نتائج بعد التحديث، فإما لا توجد عمليات مسجلة بعد
                  أو أن الطلب فشل وسيظهر كرسالة أعلى الصفحة.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
                        <span>{log.actorName || "System"}</span>
                        <span className="rounded-full bg-pink-900/40 px-2 py-0.5 text-xs text-pink-300">
                          {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                        </span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#d7aabd]">
                          {AUDIT_TARGET_LABELS[log.targetType] ??
                            log.targetType}
                        </span>
                      </div>
                      <div className="text-xs text-[#d7aabd]">
                        {new Date(log.createdAt).toLocaleString("ar-EG")}
                      </div>
                    </div>
                    <div className="mb-2 text-xs text-[#a07080]">
                      {log.actorEmail || "بدون بريد"}{" "}
                      {log.actorRole ? `· ${log.actorRole}` : ""}
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
