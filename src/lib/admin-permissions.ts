import type { Section } from "@/app/admin/types";

export type AdminRole =
  | "admin"
  | "staff"
  | "trainer"
  | "accountant"
  | "partner"
  | "contracts_manager"
  | "agent"
  | "head_coach"
  | "nutritionist";

export type AdminFeature =
  | "settings"
  | "overview"
  | "approvals"
  | "accounting"
  | "site-content"
  | "knowledge"
  | "memberships"
  | "offers"
  | "classes"
  | "trainers"
  | "employees"
  | "customers"
  | "products"
  | "inventory"
  | "reviews"
  | "bookings"
  | "orders"
  | "balance"
  | "chat"
  | "complaints"
  | "discounts"
  | "rewards"
  | "db-maintenance"
  | "push"
  | "partners"
  | "contracts"
  | "referrals"
  | "nutrition"
  | "suppliers"
  | "delivery-companies"
  | "store-campaigns"
  | "store-free-gifts"
  | "blog"
  | "analytics_view";

export const BOOKING_PERMISSIONS = [
  "bookings_view",
  "bookings_create",
  "bookings_reschedule",
  "class_exchanges_review",
  "class_exchanges_execute",
  "bookings_cancel",
  "bookings_delete",
  "bookings_bulk_delete",
  "manual_attendance",
  "qr_attendance",
] as const;

export type BookingPermission = (typeof BOOKING_PERMISSIONS)[number];

export const ADMIN_FEATURES: AdminFeature[] = [
  "settings",
  "overview",
  "approvals",
  "accounting",
  "site-content",
  "knowledge",
  "memberships",
  "offers",
  "classes",
  "trainers",
  "employees",
  "customers",
  "products",
  "inventory",
  "reviews",
  "bookings",
  "orders",
  "balance",
  "chat",
  "complaints",
  "discounts",
  "rewards",
  "db-maintenance",
  "push",
  "partners",
  "contracts",
  "referrals",
  "nutrition",
  "suppliers",
  "delivery-companies",
  "store-campaigns",
  "store-free-gifts",
  "blog",
  "analytics_view",
];

export const MARKETING_PERMISSIONS = [
  "marketing_conversions_manage",
  "customer_followup_assigned_only",
] as const;

export type MarketingPermission = (typeof MARKETING_PERMISSIONS)[number];

export const EMPLOYEE_PERMISSIONS = [
  "employees_view",
  "employees_manage",
  "departments_manage",
  "positions_manage",
  "employee_attendance_view",
  "employee_attendance_manage",
  "employee_attendance_lock",
  "employee_attendance_override",
  "coach_class_attendance_view",
  "coach_class_attendance_manage",
  "employee_compensation_view",
  "employee_compensation_manage",
  "payroll_eligibility_view",
  "payroll_eligibility_manage",
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
  "payroll_run_view",
  "payroll_run_calculate",
  "payroll_run_finalize",
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

export const ADMIN_PERMISSION_KEYS = [
  ...ADMIN_FEATURES,
  ...BOOKING_PERMISSIONS,
  ...MARKETING_PERMISSIONS,
  ...EMPLOYEE_PERMISSIONS,
] as const;

const STAFF_FEATURES: AdminFeature[] = [
  "approvals",
  "site-content",
  "knowledge",
  "memberships",
  "offers",
  "classes",
  "trainers",
  "bookings",
  "customers",
  "reviews",
  "chat",
  "complaints",
  "referrals",
];

const TRAINER_FEATURES: AdminFeature[] = [
  "approvals",
  "classes",
  "trainers",
  "bookings",
  "customers",
];
const ACCOUNTANT_FEATURES: AdminFeature[] = [
  "approvals",
  "overview",
  "accounting",
  "orders",
  "balance",
  "customers",
  "suppliers",
  "delivery-companies",
];
const PARTNER_FEATURES: AdminFeature[] = ["approvals", "partners"];
const CONTRACTS_MANAGER_FEATURES: AdminFeature[] = ["approvals", "contracts"];
const AGENT_FEATURES: AdminFeature[] = ["approvals", "contracts"];
const HEAD_COACH_FEATURES: AdminFeature[] = [
  "approvals",
  "trainers",
  "classes",
  "bookings",
  "customers",
  "accounting",
  "discounts",
];
const NUTRITIONIST_FEATURES: AdminFeature[] = ["approvals", "nutrition"];

export const ROLE_FEATURE_TEMPLATES: Record<AdminRole, AdminFeature[]> = {
  admin: ADMIN_FEATURES,
  staff: STAFF_FEATURES,
  trainer: TRAINER_FEATURES,
  accountant: ACCOUNTANT_FEATURES,
  partner: PARTNER_FEATURES,
  contracts_manager: CONTRACTS_MANAGER_FEATURES,
  agent: AGENT_FEATURES,
  head_coach: HEAD_COACH_FEATURES,
  nutritionist: NUTRITIONIST_FEATURES,
};

export const SECTION_FEATURE_MAP: Record<Section, AdminFeature> = {
  overview: "overview",
  approvals: "approvals",
  analytics: "analytics_view",
  accounting: "accounting",
  settings: "settings",
  pages: "site-content",
  "blog-pending": "site-content",
  knowledge: "knowledge",
  subscriptions: "memberships",
  "friend-matching": "memberships",
  packages: "memberships",
  goals: "memberships",
  delivery: "orders",
  health: "memberships",
  payments: "orders",
  classes: "classes",
  trainers: "trainers",
  employees: "employees",
  products: "products",
  inventory: "inventory",
  reviews: "reviews",
  balance: "balance",
  bookings: "bookings",
  customers: "customers",
  chat: "chat",
  complaints: "complaints",
  discounts: "discounts",
  rewards: "rewards",
  database: "db-maintenance",
  push: "push",
  partners: "partners",
  contracts: "contracts",
  referrals: "referrals",
  nutrition: "nutrition",
  suppliers: "suppliers",
  orders: "orders",
  "delivery-companies": "delivery-companies",
  "store-campaigns": "store-campaigns",
  "store-free-gifts": "store-free-gifts",
};

export function isAdminRole(role?: string): role is AdminRole {
  return (
    role === "admin" ||
    role === "staff" ||
    role === "trainer" ||
    role === "accountant" ||
    role === "partner" ||
    role === "contracts_manager" ||
    role === "agent" ||
    role === "head_coach" ||
    role === "nutritionist"
  );
}

// Features that trainers can never hold, even if manually assigned
const TRAINER_BLOCKED_FEATURES: AdminFeature[] = [
  "discounts",
  "settings",
  "accounting",
];

export function normalizeAdminPermissions(
  role: string | undefined,
  permissions?: string[] | null,
) {
  if (role === "admin") return [...ADMIN_FEATURES];
  if (Array.isArray(permissions) && permissions.length > 0) {
    let allowed = permissions.filter((p): p is AdminFeature =>
      ADMIN_FEATURES.includes(p as AdminFeature),
    );

    // Every authenticated admin-side role can see the Action Center.
    // The API filters the actual requests according to that user's
    // existing section permissions.
    if (role && isAdminRole(role) && !allowed.includes("approvals")) {
      allowed.push("approvals");
    }

    if (role === "trainer") {
      allowed = allowed.filter((p) => !TRAINER_BLOCKED_FEATURES.includes(p));
    }
    return allowed;
  }
  if (role && isAdminRole(role)) {
    return [...ROLE_FEATURE_TEMPLATES[role]];
  }
  return [];
}

export function canAccessAdminFeature(
  role: string | undefined,
  permissions: string[] | undefined,
  feature: AdminFeature,
) {
  return normalizeAdminPermissions(role, permissions).includes(feature);
}

/**
 * Changing the global ClassType taxonomy is stronger than editing classes.
 * Keep this policy centralized so API/UI do not infer it from "classes".
 */
export function canManageClassTypes(role: string | undefined) {
  return role === "admin";
}

export function canAccessAdminSection(
  role: string | undefined,
  permissions: string[] | undefined,
  section: Section,
) {
  if (section === "settings") {
    return (
      canAccessAdminFeature(role, permissions, "settings") ||
      (role === "staff" &&
        canAccessAdminFeature(role, permissions, "referrals"))
    );
  }
  if (section === "pages") {
    return (
      canAccessAdminFeature(role, permissions, "site-content") ||
      canAccessAdminFeature(role, permissions, "blog")
    );
  }
  if (section === "employees") {
    const hasExplicitEmployeePermission =
      Boolean(role && isAdminRole(role)) &&
      permissions?.some((permission) =>
        EMPLOYEE_PERMISSIONS.includes(permission as EmployeePermission),
      ) === true;

    return (
      canAccessAdminFeature(role, permissions, "employees") ||
      hasExplicitEmployeePermission
    );
  }

  return canAccessAdminFeature(role, permissions, SECTION_FEATURE_MAP[section]);
}

export function getDefaultAdminSection(
  role: string | undefined,
  permissions?: string[] | undefined,
): Section {
  const allowed = Object.keys(SECTION_FEATURE_MAP).filter((section) =>
    canAccessAdminSection(role, permissions, section as Section),
  ) as Section[];
  if (allowed.includes("overview")) return "overview";
  // Role-specific defaults
  if (role === "contracts_manager" || role === "agent") return "contracts";
  if (
    role === "staff" &&
    (allowed.includes("settings") || allowed.includes("referrals"))
  )
    return "settings";
  if (role === "head_coach") return "trainers";
  return allowed[0] ?? "overview";
}
