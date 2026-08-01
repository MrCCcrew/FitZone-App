import { getCoachAccountSummary, getCoachKnowledgeEntries } from "@/lib/ai-coach/site-data";
import { getAuthenticatedCustomerMembership, searchActiveOffers, searchAvailableMemberships, searchAvailableProducts, searchClassSchedule, searchPackages } from "@/lib/ai-coach/catalog-tools";
import { classifyCatalogDomain } from "@/lib/ai-coach/site-taxonomy";
import { isCoachToolsEnabled } from "@/lib/ai-coach/config";
import { extractCatalogSearchQuery } from "@/lib/catalog-query";
import type { CoachIntent, CoachLang, CoachSiteSnapshot } from "@/lib/ai-coach/types";

export type CoachToolName = "getKnowledge" | "searchMemberships" | "searchPackages" | "searchOffers" | "searchProducts" | "searchClassSchedule" | "getCurrentMembership" | "getAccountSummary";
export type CoachToolStatus = "success_with_results" | "success_empty" | "unauthenticated" | "forbidden" | "tool_error" | "tools_disabled";

const MAX_TOOLS_PER_MESSAGE = 2;
function requestedDuration(message: string): "monthly" | "quarterly" | "semiannual" | "annual" | undefined {
  const value = message.toLowerCase();
  if (/سنوي|annual/.test(value)) return "annual";
  if (/نصف.?سنوي|semi.?annual/.test(value)) return "semiannual";
  if (/ربع.?سنوي|quarterly/.test(value)) return "quarterly";
  if (/شهري|monthly/.test(value)) return "monthly";
  return undefined;
}

function emptySnapshot(authenticated: boolean): CoachSiteSnapshot {
  return { memberships: [], offers: [], classes: [], trainers: [], products: [], knowledge: [], account: { authenticated }, coachProfile: null, recentCheckIns: [], supportOnline: false };
}

export function selectCoachTools(intent: CoachIntent, message: string, authenticated: boolean, catalogType?: "membership" | "package"): CoachToolName[] {
  const text = message.toLowerCase();
  const ownMembership = /اشتراكي|عضويتي|ينتهي امتى|my membership|remaining sessions/i.test(text);
  const account = /محفظتي|رصيدي|نقاطي|حجوزاتي|account|wallet|rewards|bookings/i.test(text);
  if (ownMembership) return authenticated ? ["getCurrentMembership"] : [];
  if (account || intent === "account_summary") return authenticated ? ["getAccountSummary"] : [];
  if (intent === "offer_lookup") return ["searchOffers"];
  if (catalogType === "package" || classifyCatalogDomain(message) === "packages") return ["searchPackages"];
  if (intent === "pricing" || intent === "membership_recommendation") return ["searchMemberships"];
  if (intent === "schedule_lookup" || intent === "class_recommendation") return ["searchClassSchedule"];
  if (intent === "product_help" || intent === "product_recommendation" || intent === "product_discount") return ["searchProducts"];
  return [];
}

/** Read-only orchestration boundary. It accepts no client userId and never exposes raw Prisma access to the model. */
export async function getCoachToolContext(args: { intent: CoachIntent; message: string; lang: CoachLang; userId: string | null; sort?: "price_asc" | null; temporalFilter?: { date?: "tomorrow" }; catalogType?: "membership" | "package"; duration?: "monthly" | "quarterly" | "semiannual" | "annual" }) {
  const snapshot = emptySnapshot(Boolean(args.userId));
  const usedTools: CoachToolName[] = ["getKnowledge"];
  const toolStatuses: Partial<Record<CoachToolName, CoachToolStatus>> = {};
  const resultCounts: Partial<Record<CoachToolName, number>> = {};
  let toolFailed = false;
  snapshot.knowledge = await getCoachKnowledgeEntries().catch(() => { toolFailed = true; toolStatuses.getKnowledge = "tool_error"; return []; });
  if (!toolStatuses.getKnowledge) { toolStatuses.getKnowledge = snapshot.knowledge.length ? "success_with_results" : "success_empty"; resultCounts.getKnowledge = snapshot.knowledge.length; }

  if (!isCoachToolsEnabled()) return { snapshot, usedTools, toolStatuses, resultCounts, toolFailed, toolsEnabled: false };
  if (!args.userId && (args.intent === "account_summary" || /اشتراكي|عضويتي|رصيدي|نقاطي|حجوزاتي|my membership|wallet|rewards|bookings/i.test(args.message.toLowerCase()))) {
    toolStatuses.getAccountSummary = "unauthenticated";
    resultCounts.getAccountSummary = 0;
    return { snapshot, usedTools, toolStatuses, resultCounts, toolFailed, toolsEnabled: true };
  }
  const selected = selectCoachTools(args.intent, args.message, Boolean(args.userId), args.catalogType).slice(0, MAX_TOOLS_PER_MESSAGE);
  for (const tool of selected) {
    try {
      if (tool === "searchMemberships") {
        const rows = await searchAvailableMemberships(extractCatalogSearchQuery("membership", args.message).searchTerm, { sort: args.sort ?? undefined, duration: args.duration ?? requestedDuration(args.message) });
        snapshot.memberships = rows.map((row) => ({ id: row.id, name: args.lang === "en" ? row.nameEn ?? row.name : row.name, price: row.priceAfter ?? row.price, features: row.features, maxClasses: row.sessionsCount ?? 0 }));
        resultCounts[tool] = rows.length;
      }
      if (tool === "searchPackages") {
        const rows = await searchPackages(extractCatalogSearchQuery("membership", args.message).searchTerm, { sort: args.sort ?? undefined });
        snapshot.memberships = rows.map((row) => ({ id: row.id, name: args.lang === "en" ? row.nameEn ?? row.name : row.name, price: row.priceAfter ?? row.price, features: row.features, maxClasses: row.sessionsCount ?? 0 }));
        resultCounts[tool] = rows.length;
      }
      if (tool === "searchOffers") {
        const rows = await searchActiveOffers(args.message);
        snapshot.offers = rows.map((row) => ({ id: row.id, title: args.lang === "en" ? row.titleEn ?? row.title : row.title, description: row.offerType === "customization" ? "عرض تخصيص متاح" : "", expiresAt: row.expiresAt?.toISOString() ?? null }));
        resultCounts[tool] = rows.length;
      }
      if (tool === "searchProducts") {
        const rows = await searchAvailableProducts(extractCatalogSearchQuery("product", args.message).searchTerm, args.intent === "product_discount" || args.sort ? { discountedOnly: args.intent === "product_discount", sort: args.sort ?? undefined } : undefined);
        snapshot.products = rows.map((row) => ({ id: row.id, name: args.lang === "en" ? row.nameEn ?? row.name : row.name, price: row.price, categoryLabel: row.category, description: row.description ?? "", stock: row.stock }));
        resultCounts[tool] = rows.length;
      }
      if (tool === "searchClassSchedule") {
        const rows = args.temporalFilter ? await searchClassSchedule(extractCatalogSearchQuery("class", args.message).searchTerm, args.temporalFilter) : await searchClassSchedule(extractCatalogSearchQuery("class", args.message).searchTerm);
        snapshot.classes = rows.map((row, index) => ({ id: `${row.name}-${index}`, name: row.name, description: "", trainer: row.trainer, trainerSpecialty: "", category: row.category, type: row.type, subType: null, duration: "", schedules: row.schedules.map((schedule, scheduleIndex) => ({ id: `${index}-${scheduleIndex}`, date: schedule.date.toISOString(), time: schedule.time, availableSpots: schedule.availableSpots })) }));
        resultCounts[tool] = rows.length;
      }
      if (tool === "getCurrentMembership") {
        const membership = await getAuthenticatedCustomerMembership(args.userId);
        snapshot.account.membership = membership ? { name: membership.name, endDate: membership.endDate.toISOString() } : null;
        resultCounts[tool] = membership ? 1 : 0;
      }
      if (tool === "getAccountSummary") { snapshot.account = await getCoachAccountSummary(args.userId); resultCounts[tool] = snapshot.account.authenticated ? 1 : 0; }
      usedTools.push(tool);
      toolStatuses[tool] = resultCounts[tool] ? "success_with_results" : "success_empty";
    } catch { toolFailed = true; toolStatuses[tool] = "tool_error"; }
  }
  return { snapshot, usedTools, toolStatuses, resultCounts, toolFailed, toolsEnabled: true };
}
