import { z } from "zod";

export const siteCapabilitySchema = z.object({
  id: z.enum(["home", "goals", "memberships", "packages", "offers", "classes", "trial_classes", "trainers", "nutrition", "store", "product_categories", "account", "bookings", "support"]),
  title: z.string(), description: z.string(), route: z.enum(["/", "/store", "/account"]), sectionId: z.string().nullable(),
  actions: z.array(z.enum(["navigate", "highlight", "showCards", "filter", "openDetails"])), tools: z.array(z.string()), requiresAuthentication: z.boolean(), navigationMethod: z.enum(["route", "route_and_scroll", "client_event"]),
});
export type SiteCapability = z.infer<typeof siteCapabilitySchema>;

const registry = [
  ["home", "الرئيسية", "نظرة سريعة على خدمات FitZone", "/", null, ["navigate"], ["getSiteOverview"], false, "route"],
  ["goals", "الأهداف", "اختاري هدفك لإظهار الخدمات والباقات المناسبة", "/", "goals", ["navigate", "highlight", "showCards"], ["searchGoals"], false, "route_and_scroll"],
  ["memberships", "الاشتراكات", "الباقات والأسعار المتاحة", "/", "memberships", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchMemberships", "searchGoals"], false, "route_and_scroll"],
  ["packages", "الباقات", "الباقات الخاصة المتاحة", "/", "packages-section", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchPackages"], false, "route_and_scroll"],
  ["offers", "العروض", "العروض الفعالة الحالية", "/", "offers", ["navigate", "highlight", "showCards"], ["searchOffers"], false, "route_and_scroll"],
  ["classes", "الكلاسات", "الجدول والكلاسات المتاحة", "/", "classes", ["navigate", "highlight", "showCards", "filter"], ["searchClasses"], false, "route_and_scroll"],
  ["trial_classes", "الكلاسات التجريبية", "فرص التجربة المتاحة", "/", "classes", ["navigate", "highlight", "showCards"], ["searchTrialClasses"], false, "route_and_scroll"],
  ["trainers", "المدربات", "المدربات والتخصصات المنشورة", "/", "trainers-list", ["navigate", "highlight", "showCards", "filter"], ["searchTrainers"], false, "route_and_scroll"],
  ["nutrition", "دكتورة التغذية", "خدمات التغذية المتاحة", "/", "nutrition", ["navigate", "showCards"], ["getNutritionDoctor"], false, "route_and_scroll"],
  ["store", "المتجر", "المنتجات والأقسام الظاهرة", "/store", "shop-products", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchProducts", "searchProductCategories"], false, "client_event"],
  ["product_categories", "أقسام المتجر", "تصنيفات المنتجات المتاحة", "/store", "shop-products", ["navigate", "showCards", "filter"], ["searchProductCategories"], false, "client_event"],
  ["account", "حسابي", "بيانات حساب العميلة فقط", "/account", null, ["navigate"], ["getAccountSummary"], true, "route"],
  ["bookings", "الحجوزات", "حجوزات العميلة فقط", "/account", null, ["navigate"], ["getAccountSummary"], true, "route"],
  ["support", "الدعم", "التواصل مع الدعم", "/", null, ["navigate"], [], false, "route"],
] as const;

export const siteCapabilities: SiteCapability[] = registry.map(([id, title, description, route, sectionId, actions, tools, requiresAuthentication, navigationMethod]) => siteCapabilitySchema.parse({ id, title, description, route, sectionId, actions, tools, requiresAuthentication, navigationMethod }));
export const getSiteCapability = (id: SiteCapability["id"]) => siteCapabilities.find((item) => item.id === id) ?? null;
