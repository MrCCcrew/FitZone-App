import { extractCatalogSearchQuery, normalizeCatalogText } from "@/lib/catalog-query";
import { findCoachPage } from "@/lib/ai-coach/page-registry";
import { detectCoachIntent } from "@/lib/ai-coach/intents";
import { classifyCoachIntent } from "@/lib/ai-coach/llm";
import { classifyCatalogDomain, requestedOfferSubtype } from "@/lib/ai-coach/site-taxonomy";
import type { CoachIntent, CoachLang } from "@/lib/ai-coach/types";

export type CanonicalIntent = "general_fitness" | "workout_recommendation" | "nutrition_general" | "exercise_explanation" | "offer_lookup" | "membership_lookup" | "membership_pricing" | "product_lookup" | "class_schedule" | "trainer_lookup" | "club_information" | "site_navigation" | "account_summary" | "account_membership" | "account_bookings" | "account_wallet" | "account_points" | "support_request" | "privacy_guard" | "forbidden_write_action" | "medical_safety" | "out_of_scope" | "clarification_required";

export type CoachDomain = "memberships" | "packages" | "products" | "classes" | "offers" | "account" | "site" | null;
export type CoachUnderstanding = { intent: CanonicalIntent; confidence: number; extractedEntities: Record<string, string | number | boolean>; normalizedQuery: string; requestedAction: "answer" | "navigate" | "read_account" | "forbidden"; requiresAuthentication: boolean; allowedTools: string[]; listAll: boolean; legacyIntent: CoachIntent; domain: CoachDomain; operation: "list" | "search" | "filter" | "sort" | "open" | "read" | "forbidden" | "clarify"; sort: "price_asc" | null; temporalFilter: Record<string, string>; contextReference: boolean; safetyFlags: string[]; };

const WRITE_REQUEST = /(?:احذف|امسح|عدل|غي[ّ]?ر|زود|اضف|فع[ّ]?ل|انشئ|ادفع|نفذ|delete|remove|edit|change|add|activate|pay)\s*(?:لي|رصيد|نقاط|اشتراك|عضوية|سعر|عرض|منتج|جدول|صلاح)/i;
const OTHER_USER = /(?:مستخدم|عميل|شخص)\s*(?:تاني|آخر|اخر)|(?:اعرض|وريني|اكشف|اعرف|معرفه|جلب)\s+بيانات\s+\S+|بيانات\s+(?:العميل\s+\S+|المستخدمين|العملاء)|(?:رصيد|اشتراك|حجوزات|حساب|نقاط)\s+(?:احمد|محمد|ساره|مني|خالد|صاحبي|المستخدم\s*رقم\s*\d+)|(?:another|other)\s+(?:user|customer)/i;
const INJECTION = /ignore\s+(?:previous|all)\s+instructions|system prompt|reveal.*(?:secret|key)|تجاهل.*(?:التعليمات|القواعد)|انس[َ]?\s*(?:كل\s*)?تعليمات|اكشف.*(?:سر|مفتاح)/i;
const SQL_ACCESS = /\bsql\b|select\s+.+\s+from|database|قاعدة البيانات|نفذ.*(?:استعلام|sql)/i;
const IMPERSONATE_ADMIN = /اعتبرني\s+(?:ادمن|أدمن)|i(?:'|\s)?m\s+admin|صلاحيات\s+(?:ادمن|أدمن)|admin access/i;
const URGENT = /chest pain|faint|shortness of breath|difficulty breathing|ألم صدر|اغماء|إغماء|ضيق تنفس/i;

function legacyFor(intent: CanonicalIntent): CoachIntent {
  const mapping: Record<CanonicalIntent, CoachIntent> = { general_fitness: "unknown", workout_recommendation: "class_recommendation", nutrition_general: "nutrition_guidance", exercise_explanation: "faq", offer_lookup: "offer_lookup", membership_lookup: "pricing", membership_pricing: "pricing", product_lookup: "product_help", class_schedule: "schedule_lookup", trainer_lookup: "trainer_info", club_information: "faq", site_navigation: "shop_browse", account_summary: "account_summary", account_membership: "account_summary", account_bookings: "account_summary", account_wallet: "account_summary", account_points: "account_summary", support_request: "human_handoff", privacy_guard: "privacy_guard", forbidden_write_action: "privacy_guard", medical_safety: "faq", out_of_scope: "unknown", clarification_required: "unknown" };
  return mapping[intent];
}

function result(intent: CanonicalIntent, confidence: number, normalizedQuery: string, entities: CoachUnderstanding["extractedEntities"] = {}, listAll = false, extras: Partial<CoachUnderstanding> = {}): CoachUnderstanding {
  const tools: Partial<Record<CanonicalIntent, string[]>> = { membership_lookup: [entities.catalogType === "package" ? "searchPackages" : "searchMemberships"], membership_pricing: [entities.catalogType === "package" ? "searchPackages" : "searchMemberships"], product_lookup: ["searchProducts"], class_schedule: ["searchClassSchedule"], offer_lookup: ["searchOffers"], account_summary: ["getAccountSummary"], account_membership: ["getCurrentMembership"], account_bookings: ["getAccountSummary"], account_wallet: ["getAccountSummary"], account_points: ["getAccountSummary"] };
  const account = intent.startsWith("account_");
  const domain: CoachDomain = entities.catalogType === "package" ? "packages" : intent.startsWith("membership") ? "memberships" : intent === "product_lookup" ? "products" : intent === "class_schedule" ? "classes" : intent === "offer_lookup" ? "offers" : account ? "account" : intent === "site_navigation" ? "site" : null;
  return { intent, confidence, extractedEntities: entities, normalizedQuery, requestedAction: intent === "site_navigation" ? "navigate" : intent === "forbidden_write_action" || intent === "privacy_guard" ? "forbidden" : account ? "read_account" : "answer", requiresAuthentication: account, allowedTools: tools[intent] ?? [], listAll, legacyIntent: legacyFor(intent), domain, operation: listAll ? "list" : entities.searchTerm || entities.className ? "search" : "read", sort: null, temporalFilter: {}, contextReference: false, safetyFlags: [], ...extras };
}

/** Deterministic safety first, then broad semantic families. The optional LLM classifier is deliberately not a source of authority. */
export async function understandCoachMessage(message: string, _lang: CoachLang, context?: { lastIntent?: CoachIntent; lastDomain?: CoachDomain; lastActionTarget?: string | null; lastEntities?: Record<string, string | number | boolean>; contextUpdatedAt?: string }): Promise<CoachUnderstanding> {
  const text = normalizeCatalogText(message);
  if (!text) return result("clarification_required", 1, text);
  const safetyFlags = [INJECTION.test(text) && "prompt_injection", OTHER_USER.test(text) && "other_user_data", SQL_ACCESS.test(text) && "sql_access", IMPERSONATE_ADMIN.test(text) && "permission_escalation", WRITE_REQUEST.test(text) && "forbidden_write"].filter((flag): flag is string => Boolean(flag));
  if (safetyFlags.length) return result(safetyFlags.includes("other_user_data") || safetyFlags.includes("prompt_injection") || safetyFlags.includes("sql_access") ? "privacy_guard" : "forbidden_write_action", 1, text, {}, false, { safetyFlags, operation: "forbidden" });
  if (URGENT.test(text)) return result("medical_safety", 1, text);
  if (/رصيدي|محفظتي|wallet/i.test(text)) return result("account_wallet", .99, text);
  if (/نقاطي|rewards?|points?/i.test(text)) return result("account_points", .99, text);
  if (/حجوزاتي|my bookings/i.test(text)) return result("account_bookings", .99, text);
  if (/اشتراكي|عضويتي|my membership/i.test(text)) return result("account_membership", .99, text);
  if (/موظف|دعم|اكلم.*موظف|human|live support/i.test(text)) return result("support_request", .98, text);
  if (/وزني\s+\d+|وزن\s+\d+/i.test(text)) return { ...result("general_fitness", .99, text), legacyIntent: "weight_context" };
  const isReference = /^(?:افتحه?|افتحهالي|وريني الباقي|دي بكام|ده متاح|طب الأرخص|طب بكره|والسنوي|والشهري|بكام|متاح|مواعيده)$/i.test(text);
  const contextFresh = Boolean(context?.lastDomain && context.contextUpdatedAt && Date.now() - Date.parse(context.contextUpdatedAt) < 20 * 60_000);
  if ((isReference || /ارخص|سنوي|شهري|بكره/.test(text)) && contextFresh) {
    const domain = context!.lastDomain!;
    const followup: Partial<CoachUnderstanding> = { domain, contextReference: true, legacyIntent: domain === "memberships" || domain === "packages" ? "pricing" : domain === "products" ? "product_help" : domain === "classes" ? "schedule_lookup" : domain === "offers" ? "offer_lookup" : "account_summary", allowedTools: domain === "memberships" ? ["searchMemberships"] : domain === "packages" ? ["searchPackages"] : domain === "products" ? ["searchProducts"] : domain === "classes" ? ["searchClassSchedule"] : domain === "offers" ? ["searchOffers"] : ["getAccountSummary"] };
    if (/افتح/.test(text)) return result("site_navigation", .99, text, { pageId: context?.lastActionTarget ?? domain }, false, { ...followup, requestedAction: "navigate", operation: "open" });
    if (/ارخص/.test(text)) return result(domain === "products" ? "product_lookup" : "membership_lookup", .99, text, domain === "packages" ? { catalogType: "package" } : {}, true, { ...followup, operation: "sort", sort: "price_asc" });
    if (/سنوي|شهري/.test(text) && domain === "memberships") return result("membership_lookup", .99, text, { searchTerm: /سنوي/.test(text) ? "سنوي" : "شهري", catalogType: "membership" }, false, { ...followup, operation: "filter" });
    if (/بكره/.test(text)) return result("class_schedule", .99, text, context?.lastEntities ?? {}, true, { ...followup, operation: "filter", temporalFilter: { date: "tomorrow" } });
  }
  if (isReference || /^(?:عايزه اعرف الموجود|عايزة اعرف الموجود|ايه الموجود|بكام|مواعيده|متاح|افتحه?|وريني|ايه الانواع)$/i.test(text)) return result("clarification_required", 1, text);
  // Explicit domain terms are authoritative and must beat a stale navigation
  // context or cached alias. In particular, memberships are never shop items.
  if (/الاشتراك|الاشتراكات|عضوية|الباقات|membership|plans?/i.test(text)) {
    if (/افتح|وديني|روح|navigate|open/i.test(text)) return result("site_navigation", .99, text, { pageId: "memberships" });
    const q = extractCatalogSearchQuery("membership", message);
    const catalogType = /الباقات|باقة|package/i.test(text) ? "package" : "membership";
    return result("membership_lookup", .99, text, { ...(q.searchTerm ? { searchTerm: q.searchTerm } : {}), catalogType }, q.isListAll);
  }
  if (/المتجر|المنتج|المنتجات|store|shop|products?/i.test(text) && /افتح|وديني|روح|navigate|open/i.test(text)) return result("site_navigation", .99, text, { pageId: "store" });
  if (/العروض|الخصومات|offers?|discounts?/i.test(text) && /افتح|وديني|روح|navigate|open/i.test(text)) return result("site_navigation", .99, text, { pageId: "offers" });
  if (/الجدول|مواعيد|الكلاسات|schedule|classes?/i.test(text) && /افتح|وديني|روح|navigate|open/i.test(text)) return result("site_navigation", .99, text, { pageId: "classes" });
  const page = findCoachPage(text);
  if (page && /افتح|وديني|روح|navigate|open/i.test(message)) return result("site_navigation", .98, text, { pageId: page.id });
  const taxonomyDomain = classifyCatalogDomain(message);
  if (taxonomyDomain === "offers") return result("offer_lookup", .95, text, requestedOfferSubtype(message) ? { offerType: requestedOfferSubtype(message)! } : {}, true);
  if (taxonomyDomain === "schedules" || taxonomyDomain === "classes") { const q = extractCatalogSearchQuery("class", message); return result("class_schedule", .94, text, q.searchTerm ? { className: q.searchTerm } : {}, q.isListAll); }
  if (taxonomyDomain === "packages") { const q = extractCatalogSearchQuery("membership", message); return result("membership_lookup", .94, text, { ...(q.searchTerm ? { searchTerm: q.searchTerm } : {}), catalogType: "package" }, q.isListAll); }
  if (taxonomyDomain === "memberships") { const q = extractCatalogSearchQuery("membership", message); return result(/سعر|تكلف|كام|price|pricing/i.test(text) ? "membership_pricing" : "membership_lookup", .94, text, { ...(q.searchTerm ? { searchTerm: q.searchTerm } : {}), catalogType: "membership" }, q.isListAll); }
  if (page && /افتح|وديني|روح|navigate|open/i.test(text)) return result("site_navigation", .98, text, { pageId: page.id });
  if (/عرض|عروض|offer|discount|promo/i.test(text)) return result("offer_lookup", .94, text);
  if (/مدرب|trainer|coach/i.test(text)) return result("trainer_lookup", .9, text);
  if (/مواعيد|ميعاد|امتى|بكره|بكرا|النهارده|today|tomorrow|schedule|kick.?box|يوجا|yoga|بيلاتس|pilates/i.test(text)) { const q = extractCatalogSearchQuery("class", message); return result("class_schedule", .92, text, q.searchTerm ? { className: q.searchTerm } : {}, q.isListAll); }
  if (/منتج|منتجات|متجر|شوب|store|shop|protein|بروتين|ملابس|تخسيس|دايت|ادوات رياضي/i.test(text)) { const q = extractCatalogSearchQuery("product", message); return result("product_lookup", .91, text, q.searchTerm ? { searchTerm: q.searchTerm } : {}, q.isListAll); }
  if (/اشتراك|اشتراكات|عضوي|عضويه|باقات|باقه|سعر الجيم|تكلفه الجيم|اسعار الجيم|membership|plans?|pricing|price/i.test(text) || context?.lastIntent === "pricing" && /شهري|سنوي|monthly|annual/i.test(text)) { const q = extractCatalogSearchQuery("membership", message); return result(/سعر|تكلف|كام|price|pricing/i.test(text) ? "membership_pricing" : "membership_lookup", .91, text, q.searchTerm ? { searchTerm: q.searchTerm } : {}, q.isListAll); }
  if (/اكل|غذا|سعرات|nutrition|diet/i.test(text)) return result("nutrition_general", .84, text);
  if (/تمرين|exercise|workout|عضلات|لياق/i.test(text)) return result("general_fitness", .8, text);
  const semantic = await classifyCoachIntent({ message, lastIntent: context?.lastIntent });
  if (semantic) return result(semantic.intent, semantic.confidence, text, semantic.entities, semantic.listAll);
  const legacy = detectCoachIntent(message);
  return legacy === "unknown" ? result("clarification_required", .35, text) : result("general_fitness", .6, text, { legacyIntent: legacy });
}
