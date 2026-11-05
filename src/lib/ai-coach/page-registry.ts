import type { CoachAction } from "@/lib/ai-coach/types";

export type CoachPage = {
  id: "home" | "goals" | "memberships" | "packages" | "offers" | "classes" | "trial_classes" | "trainers" | "store" | "product_categories" | "account" | "bookings" | "blog" | "nutritionist" | "partners" | "support" | "privacy" | "refund";
  route: CoachAction["url"];
  aliases: string[];
  description: string;
  labelAr: string;
  requiredAuth: boolean;
  relatedEntities: string[];
  spaPage?: "home" | "memberships" | "offers" | "classes" | "trainers" | "shop" | "blog" | "partners";
  sectionId?: string;
};

const PAGE_LABELS_AR: Record<CoachPage["id"], string> = {
  home: "الصفحة الرئيسية", goals: "عرض الأهداف", memberships: "عرض الاشتراكات", packages: "عرض الباقات", offers: "عرض العروض", classes: "عرض الكلاسات والمواعيد", trial_classes: "عرض الكلاسات التجريبية", trainers: "عرض المدربات", store: "فتح المتجر", product_categories: "أقسام المتجر", account: "الحساب", bookings: "حجوزاتي", blog: "المدونة", nutritionist: "حجز أو عرض التغذية", partners: "عرض الشركاء", support: "الدعم", privacy: "سياسة الخصوصية", refund: "سياسة الاسترجاع",
};

export const COACH_PAGES: readonly CoachPage[] = [
  // CRITICAL: home page must NOT have sectionId to prevent inheriting stale sections like #classes
  { id: "home", route: "/", aliases: ["home"], description: "FitZone home", requiredAuth: false, relatedEntities: [], spaPage: "home", sectionId: undefined },
  { id: "goals", route: "/#goals", aliases: ["goals", "الأهداف"], description: "Fitness goals", requiredAuth: false, relatedEntities: ["goal"], spaPage: "memberships", sectionId: "goals" },
  { id: "memberships", route: "/#memberships", aliases: ["memberships", "الاشتراكات", "الباقات"], description: "Memberships", requiredAuth: false, relatedEntities: ["membership", "price"], spaPage: "memberships", sectionId: "memberships" },
  { id: "packages", route: "/#packages-section", aliases: ["packages", "الباقات"], description: "Packages", requiredAuth: false, relatedEntities: ["package"], spaPage: "offers", sectionId: "packages-section" },
  { id: "offers", route: "/#offers", aliases: ["offers", "العروض"], description: "Offers", requiredAuth: false, relatedEntities: ["offer"], spaPage: "offers", sectionId: "offers" },
  { id: "classes", route: "/#classes", aliases: ["classes", "الكلاسات", "الجدول", "schedule"], description: "Classes and schedule", requiredAuth: false, relatedEntities: ["class", "schedule"], spaPage: "home", sectionId: "classes" },
  { id: "trial_classes", route: "/#classes", aliases: ["trial classes", "الكلاسات التجريبية"], description: "Trial classes", requiredAuth: false, relatedEntities: ["class"], spaPage: "home", sectionId: "classes" },
  { id: "trainers", route: "/#trainers-list", aliases: ["trainers", "المدربات", "coaches"], description: "Published trainers", requiredAuth: false, relatedEntities: ["trainer"], spaPage: "trainers", sectionId: "trainers-list" },
  { id: "store", route: "/?page=shop", aliases: ["store", "المتجر", "products"], description: "Store", requiredAuth: false, relatedEntities: ["product"], spaPage: "shop", sectionId: "shop-products" },
  { id: "product_categories", route: "/?page=shop", aliases: ["product categories", "أقسام المتجر"], description: "Store categories", requiredAuth: false, relatedEntities: ["product_category"], spaPage: "shop", sectionId: "shop-products" },
  { id: "account", route: "/account", aliases: ["account", "حسابي"], description: "Account", requiredAuth: true, relatedEntities: ["account"] },
  { id: "bookings", route: "/account", aliases: ["bookings", "حجوزاتي"], description: "Bookings", requiredAuth: true, relatedEntities: ["booking"] },
  { id: "blog", route: "/?page=blog", aliases: ["blog", "المدونة"], description: "FitZone blog", requiredAuth: false, relatedEntities: ["blog"], spaPage: "blog" },
  { id: "nutritionist", route: "/#nutrition", aliases: ["nutritionist", "التغذية"], description: "Nutritionist", requiredAuth: false, relatedEntities: ["nutrition"], spaPage: "home", sectionId: "nutrition" },
  { id: "partners", route: "/?page=partners", aliases: ["partners", "الشركاء"], description: "Partners", requiredAuth: false, relatedEntities: ["partner"], spaPage: "partners" },
  { id: "support", route: "/", aliases: ["support", "الدعم"], description: "Support", requiredAuth: false, relatedEntities: [], spaPage: "home" },
  { id: "privacy", route: "/privacy", aliases: ["privacy", "الخصوصية"], description: "Privacy policy", requiredAuth: false, relatedEntities: ["policy"] },
  { id: "refund", route: "/refund", aliases: ["refund", "الاسترجاع"], description: "Refund policy", requiredAuth: false, relatedEntities: ["policy"] },
].map((page) => ({ ...page, labelAr: PAGE_LABELS_AR[page.id as CoachPage["id"]] })) as CoachPage[];

export function findCoachPage(message: string) {
  const text = message.toLowerCase();
  return COACH_PAGES.find((page) => page.aliases.some((alias) => text.includes(alias))) ?? null;
}
export function findCoachPageByRoute(route: CoachAction["url"]) {
  return COACH_PAGES.find((page) => page.route === route) ?? null;
}
export function findCoachPageById(id: CoachPage["id"]) {
  return COACH_PAGES.find((page) => page.id === id) ?? null;
}
export function pageBaseRoute(page: CoachPage): "/" | "/?page=shop" | "/account" {
  if (page.route === "/?page=shop") return "/?page=shop";
  if (page.route === "/account") return "/account";
  return "/";
}
export function pageAction(page: CoachPage, lang: "ar" | "en"): CoachAction {
  if (lang === "ar") return { type: "open_page", label: page.labelAr, url: page.route, pageId: page.id };
  const label = lang === "en" ? `Open ${page.id}` : `افتحي ${page.description}`;
  return { type: "open_page", label, url: page.route, pageId: page.id };
}
