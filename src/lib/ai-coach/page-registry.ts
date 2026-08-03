import type { CoachAction } from "@/lib/ai-coach/types";

export type CoachPage = {
  id: "home" | "memberships" | "offers" | "classes" | "trainers" | "store" | "account" | "blog" | "nutritionist" | "partners" | "privacy" | "refund";
  route: CoachAction["url"];
  aliases: string[];
  description: string;
  requiredAuth: boolean;
  relatedEntities: string[];
};

export const COACH_PAGES: readonly CoachPage[] = [
  { id: "home", route: "/", aliases: ["الرئيسية", "home", "الصفحة الرئيسية"], description: "الصفحة الرئيسية للنادي", requiredAuth: false, relatedEntities: [] },
  { id: "memberships", route: "/#memberships", aliases: ["الاشتراكات", "الباقات", "العضويات", "الاسعار", "plans", "memberships"], description: "باقات واشتراكات النادي", requiredAuth: false, relatedEntities: ["membership", "price"] },
  { id: "offers", route: "/#offers", aliases: ["العروض", "الخصومات", "offers", "discounts"], description: "العروض النشطة", requiredAuth: false, relatedEntities: ["offer"] },
  { id: "classes", route: "/#classes", aliases: ["الكلاسات", "الجدول", "الحصص", "classes", "schedule"], description: "الكلاسات ومواعيدها", requiredAuth: false, relatedEntities: ["class", "schedule"] },
  { id: "trainers", route: "/#classes", aliases: ["المدربات", "المدربين", "trainers", "coaches"], description: "المدربات وتخصصاتهن", requiredAuth: false, relatedEntities: ["trainer"] },
  { id: "store", route: "/store", aliases: ["المتجر", "المنتجات", "الشوب", "تسوقي", "shop", "store", "products"], description: "متجر المنتجات", requiredAuth: false, relatedEntities: ["product"] },
  { id: "account", route: "/account", aliases: ["حسابي", "المحفظة", "نقاطي", "حجوزاتي", "account", "wallet"], description: "الحساب والحجوزات", requiredAuth: true, relatedEntities: ["account"] },
  { id: "blog", route: "/#blog", aliases: ["المدونة", "مدونه", "المقالات", "المقال", "blog"], description: "مدونة FitZone", requiredAuth: false, relatedEntities: ["blog"] },
  { id: "nutritionist", route: "/#nutrition", aliases: ["الدكتورة", "دكتوره", "دكتورة التغذية", "دكتوره التغذيه", "التغذية", "اخصائية التغذية", "nutritionist"], description: "خدمة أخصائية التغذية", requiredAuth: false, relatedEntities: ["nutrition"] },
  { id: "partners", route: "/#partners", aliases: ["الشركاء", "شركاؤنا", "شركاونا", "الشريك", "partners"], description: "شركاء FitZone", requiredAuth: false, relatedEntities: ["partner"] },
  { id: "privacy", route: "/", aliases: ["الخصوصية", "privacy"], description: "سياسة الخصوصية", requiredAuth: false, relatedEntities: ["policy"] },
  { id: "refund", route: "/", aliases: ["الاسترجاع", "refund", "cancel"], description: "سياسة الاسترجاع والإلغاء", requiredAuth: false, relatedEntities: ["policy"] },
];

export function findCoachPage(message: string) {
  const text = message.toLowerCase();
  return COACH_PAGES.find((page) => page.aliases.some((alias) => text.includes(alias))) ?? null;
}

export function pageAction(page: CoachPage, lang: "ar" | "en"): CoachAction {
  const labels: Record<CoachPage["id"], [string, string]> = {
    home: ["افتحي الرئيسية", "Open home"], memberships: ["شوفي الاشتراكات", "View memberships"], offers: ["شوفي العروض", "View offers"], classes: ["شوفي الكلاسات", "View classes"], trainers: ["شوفي المدربات", "View trainers"], store: ["افتحي المتجر", "Open store"], account: ["افتحي حسابي", "Open account"], blog: ["افتحي المدونة", "Open blog"], nutritionist: ["افتحي أخصائية التغذية", "Open nutritionist"], partners: ["شوفي الشركاء", "View partners"], privacy: ["سياسة الخصوصية", "Privacy policy"], refund: ["سياسة الاسترجاع", "Refund policy"],
  };
  return { type: "open_page", label: labels[page.id][lang === "en" ? 1 : 0], url: page.route };
}
