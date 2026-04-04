import type { Section } from "@/app/admin/types";

export type AdminRole = "admin" | "staff";

export type AdminFeature =
  | "overview"
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
  | "orders"
  | "balance"
  | "chat"
  | "complaints";

const STAFF_SECTIONS: Section[] = ["pages", "knowledge", "subscriptions", "packages", "classes", "trainers", "customers", "chat", "reviews"];
const ADMIN_SECTIONS: Section[] = [
  "overview",
  "pages",
  "knowledge",
  "subscriptions",
  "packages",
  "goals",
  "delivery",
  "health",
  "payments",
  "classes",
  "trainers",
  "products",
  "inventory",
  "reviews",
  "balance",
  "customers",
  "chat",
  "complaints",
];

const STAFF_FEATURES: AdminFeature[] = ["site-content", "knowledge", "memberships", "offers", "classes", "trainers", "customers", "chat", "reviews"];
const ADMIN_FEATURES: AdminFeature[] = [
  "overview",
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
  "orders",
  "balance",
  "chat",
  "complaints",
];

export function isAdminRole(role?: string): role is AdminRole {
  return role === "admin" || role === "staff";
}

export function canAccessAdminSection(role: string | undefined, section: Section) {
  if (role === "admin") return ADMIN_SECTIONS.includes(section);
  if (role === "staff") return STAFF_SECTIONS.includes(section);
  return false;
}

export function canAccessAdminFeature(role: string | undefined, feature: AdminFeature) {
  if (role === "admin") return ADMIN_FEATURES.includes(feature);
  if (role === "staff") return STAFF_FEATURES.includes(feature);
  return false;
}

export function getDefaultAdminSection(role: string | undefined): Section {
  return role === "staff" ? "pages" : "overview";
}
