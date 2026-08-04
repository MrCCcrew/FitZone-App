import type { CoachAction } from "@/lib/ai-coach/types";

export type CoachPage = {
  id: "home" | "goals" | "memberships" | "packages" | "offers" | "classes" | "trial_classes" | "trainers" | "store" | "product_categories" | "account" | "bookings" | "blog" | "nutritionist" | "partners" | "support" | "privacy" | "refund";
  route: CoachAction["url"];
  aliases: string[];
  description: string;
  requiredAuth: boolean;
  relatedEntities: string[];
  spaPage?: "home" | "memberships" | "offers" | "classes" | "trainers" | "blog" | "partners";
  sectionId?: string;
};

export const COACH_PAGES: readonly CoachPage[] = [
  { id: "home", route: "/", aliases: ["home"], description: "FitZone home", requiredAuth: false, relatedEntities: [], spaPage: "home" },
  { id: "goals", route: "/#goals", aliases: ["goals", "الأهداف"], description: "Fitness goals", requiredAuth: false, relatedEntities: ["goal"], spaPage: "memberships", sectionId: "goals" },
  { id: "memberships", route: "/#memberships", aliases: ["memberships", "الاشتراكات", "الباقات"], description: "Memberships", requiredAuth: false, relatedEntities: ["membership", "price"], spaPage: "memberships", sectionId: "memberships" },
  { id: "packages", route: "/#packages-section", aliases: ["packages", "الباقات"], description: "Packages", requiredAuth: false, relatedEntities: ["package"], spaPage: "offers", sectionId: "packages-section" },
  { id: "offers", route: "/#offers", aliases: ["offers", "العروض"], description: "Offers", requiredAuth: false, relatedEntities: ["offer"], spaPage: "offers", sectionId: "offers" },
  { id: "classes", route: "/#classes", aliases: ["classes", "الكلاسات", "الجدول", "schedule"], description: "Classes and schedule", requiredAuth: false, relatedEntities: ["class", "schedule"], spaPage: "home", sectionId: "classes" },
  { id: "trial_classes", route: "/#classes", aliases: ["trial classes", "الكلاسات التجريبية"], description: "Trial classes", requiredAuth: false, relatedEntities: ["class"], spaPage: "home", sectionId: "classes" },
  { id: "trainers", route: "/#trainers-list", aliases: ["trainers", "المدربات", "coaches"], description: "Published trainers", requiredAuth: false, relatedEntities: ["trainer"], spaPage: "trainers", sectionId: "trainers-list" },
  { id: "store", route: "/store", aliases: ["store", "المتجر", "products"], description: "Store", requiredAuth: false, relatedEntities: ["product"], sectionId: "shop-products" },
  { id: "product_categories", route: "/store", aliases: ["product categories", "أقسام المتجر"], description: "Store categories", requiredAuth: false, relatedEntities: ["product_category"], sectionId: "shop-products" },
  { id: "account", route: "/account", aliases: ["account", "حسابي"], description: "Account", requiredAuth: true, relatedEntities: ["account"] },
  { id: "bookings", route: "/account", aliases: ["bookings", "حجوزاتي"], description: "Bookings", requiredAuth: true, relatedEntities: ["booking"] },
  { id: "blog", route: "/?page=blog", aliases: ["blog", "المدونة"], description: "FitZone blog", requiredAuth: false, relatedEntities: ["blog"], spaPage: "blog" },
  { id: "nutritionist", route: "/#nutrition", aliases: ["nutritionist", "التغذية"], description: "Nutritionist", requiredAuth: false, relatedEntities: ["nutrition"], spaPage: "home", sectionId: "nutrition" },
  { id: "partners", route: "/?page=partners", aliases: ["partners", "الشركاء"], description: "Partners", requiredAuth: false, relatedEntities: ["partner"], spaPage: "partners" },
  { id: "support", route: "/", aliases: ["support", "الدعم"], description: "Support", requiredAuth: false, relatedEntities: [], spaPage: "home" },
  { id: "privacy", route: "/privacy", aliases: ["privacy", "الخصوصية"], description: "Privacy policy", requiredAuth: false, relatedEntities: ["policy"] },
  { id: "refund", route: "/refund", aliases: ["refund", "الاسترجاع"], description: "Refund policy", requiredAuth: false, relatedEntities: ["policy"] },
];

export function findCoachPage(message: string) {
  const text = message.toLowerCase();
  return COACH_PAGES.find((page) => page.aliases.some((alias) => text.includes(alias))) ?? null;
}
export function findCoachPageByRoute(route: CoachAction["url"]) {
  return COACH_PAGES.find((page) => page.route === route) ?? null;
}
export function pageBaseRoute(page: CoachPage): "/" | "/store" | "/account" {
  if (page.route === "/store") return "/store";
  if (page.route === "/account") return "/account";
  return "/";
}
export function pageAction(page: CoachPage, lang: "ar" | "en"): CoachAction {
  const label = lang === "en" ? `Open ${page.id}` : `افتحي ${page.description}`;
  return { type: "open_page", label, url: page.route };
}
