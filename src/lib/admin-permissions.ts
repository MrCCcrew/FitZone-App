import type { Section } from "@/app/admin/types";

export type AdminRole = "admin" | "staff" | "trainer" | "accountant";

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
  | "push";

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
];

const TRAINER_FEATURES: AdminFeature[] = ["classes", "trainers", "bookings", "customers"];
const ACCOUNTANT_FEATURES: AdminFeature[] = ["overview", "accounting", "orders", "balance", "customers"];

export const ROLE_FEATURE_TEMPLATES: Record<AdminRole, AdminFeature[]> = {
  admin: ADMIN_FEATURES,
  staff: STAFF_FEATURES,
  trainer: TRAINER_FEATURES,
  accountant: ACCOUNTANT_FEATURES,
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
  push:     "push",
};

export function isAdminRole(role?: string): role is AdminRole {
  return role === "admin" || role === "staff" || role === "trainer" || role === "accountant";
}

export function normalizeAdminPermissions(role: string | undefined, permissions?: string[] | null) {
  if (role === "admin") return [...ADMIN_FEATURES];
  if (Array.isArray(permissions) && permissions.length > 0) {
    return permissions.filter((permission): permission is AdminFeature => ADMIN_FEATURES.includes(permission as AdminFeature));
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
  return canAccessAdminFeature(role, permissions, SECTION_FEATURE_MAP[section]);
}

export function getDefaultAdminSection(role: string | undefined, permissions?: string[] | undefined): Section {
  const allowed = Object.keys(SECTION_FEATURE_MAP).filter((section) =>
    canAccessAdminSection(role, permissions, section as Section),
  ) as Section[];
  if (allowed.includes("overview")) return "overview";
  return allowed[0] ?? "overview";
}
