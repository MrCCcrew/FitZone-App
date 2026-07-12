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
  | "accounting"
  | "site-content"
  | "knowledge"
  | "memberships"
  | "offers"
  | "classes"
  | "trainers"
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
  | "store-free-gifts";


export const ADMIN_FEATURES: AdminFeature[] = [
  "settings",
  "overview",
  "accounting",
  "site-content",
  "knowledge",
  "memberships",
  "offers",
  "classes",
  "trainers",
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
];

const STAFF_FEATURES: AdminFeature[] = [
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

const TRAINER_FEATURES: AdminFeature[] = ["classes", "trainers", "bookings", "customers"];
const ACCOUNTANT_FEATURES: AdminFeature[] = ["overview", "accounting", "orders", "balance", "customers", "suppliers", "delivery-companies"];
const PARTNER_FEATURES: AdminFeature[] = ["partners"];
const CONTRACTS_MANAGER_FEATURES: AdminFeature[] = ["contracts"];
const AGENT_FEATURES: AdminFeature[] = ["contracts"];
const HEAD_COACH_FEATURES: AdminFeature[] = ["trainers", "classes", "bookings", "customers", "accounting", "discounts"];
const NUTRITIONIST_FEATURES: AdminFeature[] = ["nutrition"];

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
  accounting: "accounting",
  settings: "settings",
  pages: "site-content",
  knowledge: "knowledge",
  subscriptions: "memberships",
  packages: "memberships",
  goals: "memberships",
  delivery: "orders",
  health: "memberships",
  payments: "orders",
  classes: "classes",
  trainers: "trainers",
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
const TRAINER_BLOCKED_FEATURES: AdminFeature[] = ["discounts", "settings", "accounting"];

export function normalizeAdminPermissions(role: string | undefined, permissions?: string[] | null) {
  if (role === "admin") return [...ADMIN_FEATURES];
  if (Array.isArray(permissions) && permissions.length > 0) {
    let allowed = permissions.filter((p): p is AdminFeature => ADMIN_FEATURES.includes(p as AdminFeature));
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

export function canAccessAdminSection(role: string | undefined, permissions: string[] | undefined, section: Section) {
  if (section === "settings") {
    return canAccessAdminFeature(role, permissions, "settings") || (role === "staff" && canAccessAdminFeature(role, permissions, "referrals"));
  }
  return canAccessAdminFeature(role, permissions, SECTION_FEATURE_MAP[section]);
}

export function getDefaultAdminSection(role: string | undefined, permissions?: string[] | undefined): Section {
  const allowed = Object.keys(SECTION_FEATURE_MAP).filter((section) =>
    canAccessAdminSection(role, permissions, section as Section),
  ) as Section[];
  if (allowed.includes("overview")) return "overview";
  // Role-specific defaults
  if (role === "contracts_manager" || role === "agent") return "contracts";
  if (role === "staff" && (allowed.includes("settings") || allowed.includes("referrals"))) return "settings";
  if (role === "head_coach") return "trainers";
  return allowed[0] ?? "overview";
}
