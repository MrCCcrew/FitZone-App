import { z } from "zod";
import { db } from "@/lib/db";
import { getSiteCapability } from "@/lib/ai-coach/site-capability-registry";
import { requestedOfferSubtype } from "@/lib/ai-coach/site-taxonomy";
import { searchMemberships, searchPackages, type MembershipCatalogFilters } from "@/lib/ai-coach/catalog-tools";
import { extractCatalogSearchQuery } from "@/lib/catalog-query";
import { visibleTrainerWhere } from "@/lib/public-catalog";
import { scheduleReadState, traceCoachCatalogRead, trainerReadState } from "@/lib/ai-coach/catalog-read-status";

const card = z.object({ id: z.string(), title: z.string(), subtitle: z.string().nullable(), image: z.string().nullable() });
export const interactiveToolResultSchema = z.object({
  status: z.enum(["success", "empty", "unavailable"]), sourceType: z.string().optional(), resultType: z.string().optional(), data: z.array(z.unknown()), resultCount: z.number().int().nonnegative(), spokenSummary: z.string(), cards: z.array(card), navigationTarget: z.object({ page: z.enum(["/", "/?page=shop", "/account"]), sectionId: z.string().nullable() }).nullable(), uiAction: z.unknown().nullable().optional(), warnings: z.array(z.string()),
});
export type InteractiveToolResult = z.infer<typeof interactiveToolResultSchema>;
const nav = (id: Parameters<typeof getSiteCapability>[0]) => { const item = getSiteCapability(id); return item ? { page: item.route, sectionId: item.sectionId } : null; };
const parse = (value: string | null) => { try { return value ? JSON.parse(value) : {}; } catch { return {}; } };

type CatalogQuery = MembershipCatalogFilters & { listAll?: boolean };
const durationFromQuery = (query: string): MembershipCatalogFilters["duration"] => /سنوي|annual/i.test(query) ? "annual" : /نصف.?سنوي|semi.?annual/i.test(query) ? "semiannual" : /ربع.?سنوي|quarterly/i.test(query) ? "quarterly" : /شهري|monthly/i.test(query) ? "monthly" : undefined;
function membershipCards(rows: Awaited<ReturnType<typeof searchMemberships>>) {
  return rows.slice(0, 3).map((row) => ({ id: row.id, title: row.name, subtitle: row.duration ? `${row.duration} يوم` : null, image: null }));
}
function membershipResult(rows: Awaited<ReturnType<typeof searchMemberships>>, kind: "membership" | "package") {
  const isPackage = kind === "package";
  return interactiveToolResultSchema.parse({
    status: rows.length ? "success" : "empty",
    sourceType: `Membership(kind=${isPackage ? "package" : "subscription"})`,
    resultType: kind,
    data: rows,
    resultCount: rows.length,
    spokenSummary: rows.length ? (isPackage ? "لقيتلك باقات مطابقة، وأهمها ظاهر قدامك." : "لقيتلك اشتراكات مطابقة، وأهمها ظاهر قدامك.") : (isPackage ? "لا توجد باقات مطابقة." : "لا توجد اشتراكات مطابقة."),
    cards: membershipCards(rows),
    navigationTarget: nav(isPackage ? "packages" : "memberships"),
    warnings: [],
  });
}

/** Interactive public subscriptions only; custom and package rows are deliberately excluded. */
export async function searchMembershipsInteractive(query = "", filters: CatalogQuery = {}): Promise<InteractiveToolResult> {
  const extracted = extractCatalogSearchQuery("membership", query);
  return membershipResult(await searchMemberships(extracted.searchTerm, { ...filters, searchTerm: filters.searchTerm ?? extracted.searchTerm, duration: filters.duration ?? durationFromQuery(query), listAll: filters.listAll ?? extracted.isListAll }), "membership");
}

/** Interactive public packages only; subscription and custom rows are deliberately excluded. */
export async function searchPackagesInteractive(query = "", filters: CatalogQuery = {}): Promise<InteractiveToolResult> {
  const extracted = extractCatalogSearchQuery("membership", query);
  return membershipResult(await searchPackages(extracted.searchTerm, { ...filters, searchTerm: filters.searchTerm ?? extracted.searchTerm, listAll: filters.listAll ?? extracted.isListAll }), "package");
}

export async function searchOffersInteractive(query = ""): Promise<InteractiveToolResult> {
  const now = new Date();
  const [standardRows, customizationRows] = await Promise.all([
    db.offer.findMany({ include: { membership: { select: { name: true, price: true } } }, orderBy: { expiresAt: "asc" } }),
    db.membership.findMany({ where: { kind: "custom" }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }] }),
  ]);
  const normalized = query.trim().toLowerCase();
  const subtype = requestedOfferSubtype(normalized);
  const generic = !normalized || /(?:العروض|عروض|عرض|خصومات|خصم).*(?:المتاحة|الحالية|لسه شغالة)?/.test(normalized);
  const standard = standardRows.map((offer) => ({
    id: offer.id, offerType: "standard" as const, title: offer.title, description: offer.description, price: offer.specialPrice ?? offer.membership?.price ?? null, originalPrice: offer.priceBefore ?? offer.membership?.price ?? null, discount: offer.discount, startAt: null, endAt: offer.expiresAt.toISOString(), isActive: offer.isActive, isVisible: offer.showOnHome,
    status: !offer.isActive || (offer.maxSubscribers !== null && offer.currentSubscribers >= offer.maxSubscribers) ? "disabled" : offer.expiresAt <= now ? "expired" : "active", source: "Offer", image: offer.image,
  }));
  const customization = customizationRows.map((membership) => ({
    id: membership.id, offerType: "customization" as const, title: membership.name, description: membership.subtitle ?? null, price: membership.priceAfter ?? membership.price, originalPrice: membership.priceBefore ?? membership.price, discount: membership.discountPct ?? null, startAt: null, endAt: null, isActive: membership.isActive, isVisible: membership.isActive,
    status: membership.isActive ? "available_without_expiry" : "disabled", source: "Membership(kind=custom)", image: membership.image, minMonths: membership.minMonths, maxMonths: membership.maxMonths, features: parse(membership.features),
  }));
  const typed = subtype ? [...standard, ...customization].filter((item) => item.offerType === subtype) : [...standard, ...customization];
  const matched = generic || subtype ? typed : typed.filter((item) => `${item.title} ${item.description ?? ""}`.toLowerCase().includes(normalized));
  const available = matched.filter((item) => item.status === "active" || item.status === "available_without_expiry");
  const asksExpired = /انتهت|منتهي|منتهية|expired/.test(normalized);
  const result = asksExpired ? matched.filter((item) => item.status === "expired") : available.length ? available : matched.filter((item) => item.status === "expired");
  const warnings = standard.filter((item) => item.status === "expired" && item.isVisible).map(() => "HOMEPAGE_EXPIRED_OFFER_VISIBLE");
  const customizationAvailable = available.some((item) => item.offerType === "customization");
  return interactiveToolResultSchema.parse({ status: result.length ? "success" : "empty", sourceType: "Offer + Membership(kind=custom)", resultType: subtype ?? "mixed_offer", data: result, resultCount: result.length, spokenSummary: result.length ? customizationAvailable ? "عروض التخصيص متاحة حاليًا، والتفاصيل ظاهرة قدامك." : "فيه عروض متاحة حاليًا والتفاصيل ظاهرة قدامك." : "مفيش عروض متاحة حاليًا.", cards: result.slice(0, 3).map((item) => ({ id: item.id, title: item.title, subtitle: item.offerType === "customization" ? "عرض تخصيص متاح" : item.status === "expired" ? "العرض منتهي" : item.endAt ? `ينتهي ${new Date(item.endAt).toLocaleDateString("ar-EG")}` : "متاح", image: item.image })), navigationTarget: nav("offers"), warnings });
}

export async function searchTrainersInteractive(query = ""): Promise<InteractiveToolResult> {
  try {
    const q = query.trim().toLowerCase();
    const [total, visible, rows] = await Promise.all([
      db.trainer.count(),
      db.trainer.count({ where: visibleTrainerWhere() }),
      db.trainer.findMany({ where: visibleTrainerWhere(), include: { classes: { where: { isActive: true }, select: { name: true, type: true } } }, orderBy: [{ showOnHome: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
    ]);
    const matched = q ? rows.filter((row) => `${row.name} ${row.specialty} ${row.bio ?? ""} ${row.classes.map((c) => `${c.name} ${c.type}`).join(" ")}`.toLowerCase().includes(q)) : rows;
    const readState = trainerReadState(total, visible, matched.length);
    traceCoachCatalogRead({ trainerTotalCount: total, trainerVisibleCount: visible, trainerMatchedCount: matched.length, sourceStatus: readState });
    const summary = readState === "no_data" ? "مفيش بيانات مدربات متاحة في النسخة الحالية."
      : readState === "hidden_only" ? "المدربات غير متاحات للعرض حاليًا."
      : readState === "filtered_empty" ? "مفيش مدربة مطابقة للتخصص ده حاليًا، لكن أقدر أوريكي باقي المدربات."
      : `عندنا ${Math.min(matched.length, 3)} مدربات ظاهرات دلوقتي.`;
    return interactiveToolResultSchema.parse({ status: readState === "ok" ? "success" : "empty", sourceType: "Trainer", resultType: "trainer", data: matched.map((row) => ({ id: row.id, name: row.name, specialty: row.specialty, bio: row.bio, image: row.image, classes: row.classes })), resultCount: matched.length, spokenSummary: summary, cards: matched.slice(0, 3).map((row) => ({ id: row.id, title: row.name, subtitle: row.specialty, image: row.image })), navigationTarget: readState === "no_data" || readState === "hidden_only" ? null : nav("trainers"), warnings: readState === "ok" ? [] : [readState] });
  } catch {
    traceCoachCatalogRead({ sourceStatus: "source_error" });
    return interactiveToolResultSchema.parse({ status: "unavailable", sourceType: "Trainer", resultType: "trainer", data: [], resultCount: 0, spokenSummary: "مقدرتش أحمّل بيانات المدربات دلوقتي.", cards: [], navigationTarget: null, warnings: ["source_error"] });
  }
}

/** Separates class catalogue availability from bookable schedule availability. */
export async function searchSchedulesInteractive(query = ""): Promise<InteractiveToolResult> {
  try {
    const now = new Date();
    const q = extractCatalogSearchQuery("class", query).searchTerm.toLowerCase();
    const [classTotal, scheduleTotal, futureTotal, bookableTotal, rows] = await Promise.all([
      db.class.count({ where: { isActive: true } }),
      db.schedule.count({ where: { class: { isActive: true } } }),
      db.schedule.count({ where: { isActive: true, date: { gte: now }, class: { isActive: true } } }),
      db.schedule.count({ where: { isActive: true, date: { gte: now }, availableSpots: { gt: 0 }, class: { isActive: true } } }),
      db.schedule.findMany({ where: { isActive: true, date: { gte: now }, availableSpots: { gt: 0 }, class: { isActive: true } }, include: { class: { include: { trainer: { select: { name: true } } } } }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 12 }),
    ]);
    const matched = q ? rows.filter((row) => `${row.class.name} ${row.class.type}`.toLowerCase().includes(q)) : rows;
    const state = scheduleReadState(classTotal, scheduleTotal, futureTotal, bookableTotal);
    traceCoachCatalogRead({ classTotalCount: classTotal, scheduleTotalCount: scheduleTotal, futureScheduleCount: futureTotal, sourceStatus: state });
    const summary = state === "no_classes" ? "مفيش كلاسات مضافة في النسخة الحالية."
      : state === "no_schedules" ? "الكلاسات موجودة، لكن مفيش مواعيد مضافة في النسخة الحالية."
      : state === "no_future_schedules" ? "فيه مواعيد قديمة، لكن مفيش مواعيد قادمة ظاهرة حاليًا."
      : state === "no_bookable_schedules" ? "فيه مواعيد قادمة، لكنها غير متاحة للحجز حاليًا."
      : matched.length ? `لقيت ${Math.min(matched.length, 3)} مواعيد مطابقة.` : "لا توجد مواعيد مطابقة.";
    const { formatTime12Hour } = await import("@/lib/time-format");
    return interactiveToolResultSchema.parse({ status: state === "ok" && matched.length ? "success" : "empty", sourceType: "Class + Schedule", resultType: "schedule", data: matched.map((row) => ({ id: row.id, classId: row.classId, name: row.class.name, trainer: row.class.trainer.name, date: row.date.toISOString(), time: row.time, availableSpots: row.availableSpots })), resultCount: matched.length, spokenSummary: summary, cards: matched.slice(0, 3).map((row) => ({ id: row.id, title: row.class.name, subtitle: `${formatTime12Hour(row.time)}`, image: row.class.image })), navigationTarget: nav("classes"), warnings: state === "ok" ? [] : [state] });
  } catch {
    traceCoachCatalogRead({ sourceStatus: "source_error" });
    return interactiveToolResultSchema.parse({ status: "unavailable", sourceType: "Class + Schedule", resultType: "schedule", data: [], resultCount: 0, spokenSummary: "مقدرتش أحمّل مواعيد الكلاسات دلوقتي.", cards: [], navigationTarget: null, warnings: ["source_error"] });
  }
}

export async function searchGoalsInteractive(query = ""): Promise<InteractiveToolResult> {
  const q = query.trim().toLowerCase(); const rows = await db.clubGoal.findMany({ where: { isActive: true }, include: { membershipGoals: { include: { membership: { select: { id: true, name: true, price: true, isActive: true } } } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const matched = q ? rows.filter((row) => `${row.name} ${row.nameEn ?? ""} ${row.description ?? ""}`.toLowerCase().includes(q)) : rows;
  return interactiveToolResultSchema.parse({ status: matched.length ? "success" : "empty", sourceType: "ClubGoal + MembershipGoal", resultType: "goal", data: matched.map((row) => ({ id: row.id, name: row.name, description: row.description, image: row.image, memberships: row.membershipGoals.filter((link) => link.membership.isActive).map((link) => link.membership) })), resultCount: matched.length, spokenSummary: matched.length ? "اختاري هدفك وهظهرلك الباقات المرتبطة بيه." : "مفيش أهداف ظاهرة حاليًا.", cards: matched.slice(0, 3).map((row) => ({ id: row.id, title: row.name, subtitle: row.description, image: row.image })), navigationTarget: nav("goals"), warnings: [] });
}

export async function searchTrialClassesInteractive(query = ""): Promise<InteractiveToolResult> {
  const config = await db.siteContent.findFirst({ where: { section: "trial_classes_config" }, select: { content: true } }); const rules = parse(config?.content ?? null) as Record<string, { trialEnabled?: boolean; trialPrice?: number }>;
  const now = new Date(); const rows = await db.schedule.findMany({ where: { isActive: true, date: { gte: now }, availableSpots: { gt: 0 }, class: { isActive: true } }, include: { class: { include: { trainer: { select: { name: true } } } } }, orderBy: { date: "asc" } });
  const q = query.trim().toLowerCase(); const matched = rows.filter((row) => rules[row.classId]?.trialEnabled !== false && (!q || `${row.class.name} ${row.class.type}`.toLowerCase().includes(q)));
  const { formatTime12Hour } = await import("@/lib/time-format");
  return interactiveToolResultSchema.parse({ status: matched.length ? "success" : "empty", sourceType: "Schedule + SiteContent(trial_classes_config)", resultType: "trial_class", data: matched.map((row) => ({ id: row.id, classId: row.classId, name: row.class.name, trainer: row.class.trainer.name, date: row.date.toISOString(), time: row.time, availableSpots: row.availableSpots, price: rules[row.classId]?.trialPrice ?? row.class.price })), resultCount: matched.length, spokenSummary: matched.length ? `أقرب كلاس تجريبي هو ${matched[0].class.name}.` : "مفيش كلاسات تجريبية متاحة في الجدول الحالي.", cards: matched.slice(0, 3).map((row) => ({ id: row.id, title: row.class.name, subtitle: `${row.class.trainer.name} — ${formatTime12Hour(row.time)}`, image: row.class.image })), navigationTarget: nav("trial_classes"), warnings: [] });
}

export async function getNutritionDoctorInteractive(): Promise<InteractiveToolResult> {
  const row = await db.nutritionistProfile.findFirst({ where: { isActive: true, showOnHome: true } });
  return interactiveToolResultSchema.parse(row ? { status: "success", sourceType: "NutritionistProfile", resultType: "nutrition_doctor", data: [{ id: row.id, name: row.name, bio: row.bio, image: row.image, consultationFee: row.consultationFee, followupFee: row.followupFee }], resultCount: 1, spokenSummary: `دكتورة ${row.name} متاحة لخدمات التغذية المتخصصة.`, cards: [{ id: row.id, title: row.name, subtitle: row.bio, image: row.image }], navigationTarget: nav("nutrition"), warnings: [] } : { status: "unavailable", sourceType: "NutritionistProfile", resultType: "nutrition_doctor", data: [], resultCount: 0, spokenSummary: "خدمة دكتورة التغذية مش ظاهرة كمتاحة حاليًا.", cards: [], navigationTarget: null, warnings: ["NUTRITION_DOCTOR_UNAVAILABLE"] });
}

export async function getSiteOverviewInteractive(): Promise<InteractiveToolResult> {
  const [offers, trainers, goals, nutrition, categories, classes] = await Promise.all([searchOffersInteractive(), searchTrainersInteractive(), searchGoalsInteractive(), getNutritionDoctorInteractive(), db.productCategory.count({ where: { isActive: true } }), db.class.count({ where: { isActive: true } })]);
  const available = [offers.resultCount > 0 && "العروض", goals.resultCount > 0 && "الأهداف والاشتراكات", classes > 0 && "الكلاسات", trainers.resultCount > 0 && "المدربات", nutrition.status === "success" && "دكتورة التغذية", categories > 0 && "المتجر"].filter(Boolean) as string[];
  return interactiveToolResultSchema.parse({ status: available.length ? "success" : "unavailable", sourceType: "Site Capability Registry + live public records", resultType: "site_overview", data: available, resultCount: available.length, spokenSummary: available.length ? `في FitZone تقدري تتابعي ${available.slice(0, 3).join("، ")}.` : "المحتوى العام مش متاح حاليًا.", cards: [], navigationTarget: nav("home"), warnings: offers.warnings });
}
