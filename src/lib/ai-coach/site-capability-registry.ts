import { z } from "zod";
import { COACH_PAGES, pageBaseRoute } from "@/lib/ai-coach/page-registry";

export const siteCapabilitySchema = z.object({
  id: z.enum(["home", "goals", "memberships", "packages", "offers", "classes", "trial_classes", "trainers", "nutrition", "store", "product_categories", "account", "bookings", "support"]),
  title: z.string(), description: z.string(), route: z.enum(["/", "/?page=shop", "/account"]), sectionId: z.string().nullable(),
  actions: z.array(z.enum(["navigate", "highlight", "showCards", "filter", "openDetails"])), tools: z.array(z.string()), requiresAuthentication: z.boolean(), navigationMethod: z.enum(["route", "route_and_scroll", "client_event"]),
});
export type SiteCapability = z.infer<typeof siteCapabilitySchema>;

type CapabilityId = SiteCapability["id"];
const capabilityPageIds: Record<CapabilityId, (typeof COACH_PAGES)[number]["id"]> = {
  home: "home", goals: "goals", memberships: "memberships", packages: "packages", offers: "offers", classes: "classes", trial_classes: "trial_classes", trainers: "trainers", nutrition: "nutritionist", store: "store", product_categories: "product_categories", account: "account", bookings: "bookings", support: "support",
};

const registry = [
  ["home", "Home", "FitZone overview", ["navigate"], ["getSiteOverview"], false, "route"],
  ["goals", "Goals", "Fitness goals", ["navigate", "highlight", "showCards"], ["searchGoals"], false, "route_and_scroll"],
  ["memberships", "Memberships", "Available memberships", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchMemberships", "searchGoals"], false, "route_and_scroll"],
  ["packages", "Packages", "Available packages", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchPackages"], false, "route_and_scroll"],
  ["offers", "Offers", "Active offers", ["navigate", "highlight", "showCards"], ["searchOffers"], false, "route_and_scroll"],
  ["classes", "Classes", "Classes and schedule", ["navigate", "highlight", "showCards", "filter"], ["searchClasses"], false, "route_and_scroll"],
  ["trial_classes", "Trial classes", "Trial classes", ["navigate", "highlight", "showCards"], ["searchTrialClasses"], false, "route_and_scroll"],
  ["trainers", "Trainers", "Published trainers", ["navigate", "highlight", "showCards", "filter"], ["searchTrainers"], false, "route_and_scroll"],
  ["nutrition", "Nutrition", "Nutrition services", ["navigate", "showCards"], ["getNutritionDoctor"], false, "route_and_scroll"],
  ["store", "Store", "Products", ["navigate", "highlight", "showCards", "filter", "openDetails"], ["searchProducts", "searchProductCategories"], false, "client_event"],
  ["product_categories", "Store categories", "Product categories", ["navigate", "showCards", "filter"], ["searchProductCategories"], false, "client_event"],
  ["account", "Account", "Customer account", ["navigate"], ["getAccountSummary"], true, "route"],
  ["bookings", "Bookings", "Customer bookings", ["navigate"], ["getAccountSummary"], true, "route"],
  ["support", "Support", "Customer support", ["navigate"], [], false, "route"],
] as const;

export const siteCapabilities: SiteCapability[] = registry.map(([id, title, description, actions, tools, requiresAuthentication, navigationMethod]) => {
  const page = COACH_PAGES.find((item) => item.id === capabilityPageIds[id]);
  if (!page) throw new Error(`Missing page registry entry for capability: ${id}`);
  return siteCapabilitySchema.parse({ id, title, description, route: pageBaseRoute(page), sectionId: page.sectionId ?? null, actions, tools, requiresAuthentication, navigationMethod });
});
export const getSiteCapability = (id: SiteCapability["id"]) => siteCapabilities.find((item) => item.id === id) ?? null;
export { capabilityPageIds };
