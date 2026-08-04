import { db } from "@/lib/db";
import { activePublicOfferWhere } from "@/lib/offers";
import { cairoDayWindow, visibleClassScheduleWhere, visibleMembershipWhere, visibleProductWhere, visibleScheduleWhere, visibleTrainerWhere } from "@/lib/public-catalog";
import { requestedOfferSubtype } from "@/lib/ai-coach/site-taxonomy";
import { scheduleReadState } from "@/lib/ai-coach/catalog-read-status";

const MAX = 8;
const MEMBERSHIP_MAX = 50;
const norm = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
const json = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const STOP_WORDS = new Set(["هل", "يوجد", "عندكم", "ايه", "العروض", "عرض", "خاصه", "خصومات", "اللي", "في", "عن", "كلمني", "على", "الجيم", "باقه", "الباقات"]);
function searchTerms(query: string) { return norm(query).split(/\s+/).filter((term) => term.length > 2 && !STOP_WORDS.has(term)); }
const GENERIC_OFFER_TERMS = /^(?:(?:\u0647\u0644|\u064a\u0648\u062c\u062f|\u0639\u0646\u062f\u0643\u0645|\u0625\u064a\u0647|\u0627\u064a\u0647|\u0627\u0644\u0639\u0631\u0648\u0636|\u0639\u0631\u0636|\u0627\u0644\u0639\u0631\u0636|\u062e\u0635\u0648\u0645\u0627\u062a|\u0627\u0644\u0645\u062a\u0627\u062d\u0629|\u0627\u0644\u062d\u0627\u0644\u064a\u0629|\u062d\u0627\u0644\u064a\u0627|\u062f\u0644\u0648\u0642\u062a\u064a|\u0641\u064a|\u0639\u0646|\u0639\u0644\u0649)\s*)+[?!؟.،]*$/u;
function isGenericOfferQuery(query: string) { return GENERIC_OFFER_TERMS.test(query.replace(/[\u064B-\u065F\u0670]/g, "").trim()); }
function looselyMatches(text: string, query: string) {
  if (isGenericOfferQuery(query)) return true;
  const terms = searchTerms(query); if (!terms.length) return true;
  const haystack = norm(text);
  return terms.some((term) => haystack.includes(term) || (term.length >= 4 && [...haystack].some((_, index) => haystack.slice(index, index + term.length - 1) === term.slice(0, -1))));
}

/** Read-only, bounded catalog tools. They accept search terms only, never SQL/Prisma input. */
export async function searchAvailableMemberships(query = "", filters: MembershipCatalogFilters = {}) {
  return searchMembershipKind("subscription", query, filters);
}

export type MembershipCatalogFilters = {
  listAll?: boolean;
  searchTerm?: string;
  goalId?: string;
  classId?: string;
  sort?: "price_asc";
  priceMin?: number;
  priceMax?: number;
  duration?: "monthly" | "quarterly" | "semiannual" | "annual";
};

const durationMatches = (duration: number | null, filter?: MembershipCatalogFilters["duration"]) => {
  if (!filter || duration == null) return true;
  if (filter === "monthly") return duration >= 25 && duration <= 35;
  if (filter === "quarterly") return duration >= 80 && duration <= 100;
  if (filter === "semiannual") return duration >= 170 && duration <= 195;
  return duration >= 350;
};

async function searchMembershipKind(kind: "subscription" | "package", query = "", filters: MembershipCatalogFilters = {}) {
  const searchTerm = filters.searchTerm ?? query;
  const rows = await db.membership.findMany({ where: { ...visibleMembershipWhere(), kind }, orderBy: filters.sort === "price_asc" ? [{ price: "asc" }] : [{ sortOrder: "asc" }, { price: "asc" }], take: MEMBERSHIP_MAX, select: { id: true, name: true, nameEn: true, kind: true, duration: true, sessionsCount: true, price: true, priceBefore: true, priceAfter: true, features: true, classSessions: true, goals: { select: { goalId: true, goal: { select: { name: true, nameEn: true } } } } } });
  return rows.filter((row) => {
    const allowedClasses = json<Array<{ classId: string; classType?: string }>>(row.classSessions, []);
    const finalPrice = row.priceAfter ?? row.price;
    return looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.features} ${row.goals.map((g) => `${g.goal.name} ${g.goal.nameEn ?? ""}`).join(" ")} ${allowedClasses.map((item) => item.classType ?? "").join(" ")}`, searchTerm)
      && (!filters.goalId || row.goals.some((g) => g.goalId === filters.goalId))
      && (!filters.classId || allowedClasses.some((item) => item.classId === filters.classId))
      && (filters.priceMin == null || finalPrice >= filters.priceMin)
      && (filters.priceMax == null || finalPrice <= filters.priceMax)
      && durationMatches(row.duration, filters.duration);
  }).map((row) => ({ ...row, allowedClasses: json<Array<{ classId: string; classType?: string }>>(row.classSessions, []), features: json<string[]>(row.features, []), goals: row.goals.map((g) => g.goal.name) }));
}

/** Public memberships only — never packages or customization offers. */
export async function searchMemberships(query = "", filters: MembershipCatalogFilters = {}) {
  return searchMembershipKind("subscription", query, filters);
}

/** Public packages only — never subscriptions or customization offers. */
export async function searchPackages(query = "", filters: MembershipCatalogFilters = {}) {
  return searchMembershipKind("package", query, filters);
}

export async function searchActiveOffers(query = "") {
  const requestedSubtype = requestedOfferSubtype(query);
  const [rows, customPlans] = await Promise.all([
    db.offer.findMany({ where: activePublicOfferWhere(), orderBy: { expiresAt: "asc" }, take: MAX, include: { membership: { select: { name: true, price: true, duration: true, sessionsCount: true, goals: { select: { goal: { select: { name: true } } } } } }, allowedClassTypes: { select: { classType: true } } } }),
    db.membership.findMany({ where: { ...visibleMembershipWhere(), kind: "custom" }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }], take: MAX }),
  ]);
  const standard = rows.filter((row) => requestedSubtype !== "customization" && looselyMatches(`${row.title} ${row.titleEn ?? ""} ${row.description ?? ""}`, query)).map((row) => {
    const originalPrice = row.priceBefore ?? row.membership?.price ?? null;
    const finalPrice = row.specialPrice ?? row.membership?.price ?? null;
    return { id: row.id, title: row.title, titleEn: row.titleEn, offerType: "standard" as const, type: row.type, originalPrice, discount: row.discount, finalPrice, expiresAt: row.expiresAt, durationDays: row.durationDays ?? row.membership?.duration ?? null, sessionsCount: row.sessionsCount ?? row.membership?.sessionsCount ?? null, allowedClassTypes: row.allowedClassTypes.map((item) => item.classType), features: json<string[]>(row.features, []), goals: row.membership?.goals.map((g) => g.goal.name) ?? [] };
  });
  const custom = customPlans.filter((row) => requestedSubtype === "customization" || (requestedSubtype !== "standard" && (looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.subtitle ?? ""} ${row.features}`, query) || isGenericOfferQuery(query)))).map((row) => ({ id: row.id, title: row.name, titleEn: row.nameEn, offerType: "customization" as const, type: "customization", originalPrice: row.priceBefore ?? row.price, discount: row.discountPct ?? 0, finalPrice: row.priceAfter ?? row.price, expiresAt: null, durationDays: row.duration, sessionsCount: row.sessionsCount, allowedClassTypes: [], features: json<string[]>(row.features, []), goals: [], minMonths: row.minMonths, maxMonths: row.maxMonths }));
  return [...standard, ...custom];
}

/** Customer-visible, active products only; inventory is enforced when tracked. */
export async function searchAvailableProducts(query = "", filters?: { discountedOnly?: boolean; sort?: "price_asc" }) {
  const rows = await db.product.findMany({
    where: visibleProductWhere(),
    orderBy: filters?.sort === "price_asc" ? [{ price: "asc" }] : [{ displayPriority: "desc" }, { isBestSeller: "desc" }], take: MAX,
    select: { id: true, name: true, nameEn: true, category: true, description: true, price: true, oldPrice: true, stock: true, trackInventory: true, images: true },
  });
  return rows.filter((row) => (!filters?.discountedOnly || (row.oldPrice ?? 0) > row.price) && looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.category} ${row.description ?? ""}`, query)).map((row) => ({ ...row, image: json<string[]>(row.images, [])[0] ?? null, discountPercent: row.oldPrice && row.oldPrice > row.price ? Math.round((1 - row.price / row.oldPrice) * 100) : null }));
}

/** Same visibility rule and ordering as GET /api/public trainers. */
export async function searchVisibleTrainers(query = "") {
  const filters = ["isActive"]; // Must stay in lockstep with GET /api/public.
  try {
    const rows = await db.trainer.findMany({
      where: visibleTrainerWhere(),
      include: { _count: { select: { classes: true } } },
      orderBy: [{ showOnHome: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    const result = rows.filter((row) => looselyMatches(`${row.name} ${row.specialty ?? ""} ${row.bio ?? ""}`, query)).map((row) => ({
      id: row.id, name: row.name, specialty: row.specialty ?? "", bio: row.bio ?? "", rating: row.rating ?? 0, classesCount: row._count.classes,
    }));
    console.info("[AI_COACH_SEARCH_TRAINERS]", { tool: "searchTrainers", queryStatus: query.trim() ? "filtered" : "list", returnedCount: result.length, appliedFilters: filters });
    return result;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "unknown") : "unknown";
    console.error("[AI_COACH_SEARCH_TRAINERS]", { tool: "searchTrainers", queryStatus: query.trim() ? "filtered" : "list", returnedCount: 0, appliedFilters: filters, errorCode: code });
    throw error;
  }
}

export async function searchVisiblePartners() {
  const rows = await db.partner.findMany({ where: { isActive: true, showOnPublicPage: true }, orderBy: { createdAt: "asc" } });
  // Use category value directly - no hardcoded labels. Admin can edit categories freely.
  // Format: convert snake_case to readable Arabic if needed, or use as-is
  const formatCategory = (cat: string) => {
    // Simple formatting: replace _ with space and capitalize
    return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ? formatCategory(row.category) : "خدمة",
    benefit: row.memberBenefitRate == null ? null : `${row.memberBenefitRate}%`,
    code: row.memberBenefitCode ?? null
  }));
}

export async function searchVisibleGoals(query = "") {
  const rows = await db.clubGoal.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.filter((row) => !query.trim() || looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.slug} ${row.description ?? ""}`, query)).map((row) => ({ id: row.id, name: row.name, description: row.description ?? null }));
}

export async function getVisibleNutritionist() {
  const row = await db.nutritionistProfile.findFirst({ where: { isActive: true, showOnHome: true }, orderBy: { createdAt: "asc" } });
  if (!row) return null;
  return { id: row.id, name: row.name, bio: row.bio ?? null, slots: json<Array<{ label: string; day?: string; time?: string }>>(row.slotsJson, []), consultationFee: row.consultationFee, followupFee: row.followupFee };
}

export async function getOfferDetails(idOrName: string) { return (await searchActiveOffers(idOrName)).find((row) => row.id === idOrName || norm(row.title) === norm(idOrName)) ?? null; }
export async function getMembershipDetails(idOrName: string) { return (await searchAvailableMemberships(idOrName)).find((row) => row.id === idOrName || norm(row.name) === norm(idOrName)) ?? null; }

export async function searchClassSchedule(query = "", filters?: { date?: "today" | "tomorrow" }) {
  const now = new Date();
  const rows = await db.class.findMany({ where: visibleClassScheduleWhere(now), take: MAX, include: { trainer: { select: { name: true } }, schedules: { where: visibleScheduleWhere(now), orderBy: [{ date: "asc" }, { time: "asc" }], take: 5 } } });
  const dayWindow = filters?.date ? cairoDayWindow(now, filters.date === "tomorrow" ? 1 : 0) : null;
  return rows.filter((row) => looselyMatches(`${row.name} ${row.type} ${row.category ?? ""} ${row.subType ?? ""}`, query)).map((row) => ({ name: row.name, type: row.type, category: row.category, trainer: row.trainer.name, schedules: row.schedules.filter((s) => !dayWindow || (s.date >= dayWindow.from && s.date < dayWindow.to)).map((s) => ({ date: s.date, time: s.time, availableSpots: s.availableSpots })) })).filter((row) => row.schedules.length > 0 || !filters?.date);
}

/** Read-only diagnostic used only to phrase an empty public schedule accurately. */
export async function getPublicScheduleReadState() {
  const now = new Date();
  const [classTotal, scheduleTotal, futureTotal, bookableTotal] = await Promise.all([
    db.class.count({ where: { isActive: true } }),
    db.schedule.count({ where: { class: { isActive: true } } }),
    db.schedule.count({ where: { isActive: true, date: { gte: now }, class: { isActive: true } } }),
    db.schedule.count({ where: { isActive: true, date: { gte: now }, availableSpots: { gt: 0 }, class: { isActive: true } } }),
  ]);
  return scheduleReadState(classTotal, scheduleTotal, futureTotal, bookableTotal);
}

export async function getAuthenticatedCustomerMembership(userId: string | null) {
  if (!userId) return null;
  const row = await db.userMembership.findFirst({ where: { userId, status: "active" }, orderBy: { startDate: "desc" }, include: { membership: { select: { name: true, features: true, classSessions: true } } } });
  if (!row) return null;
  const snapshot = json<Record<string, unknown> | null>(row.offerSnapshot, null);
  const allowed = json<string[] | null>(row.allowedClassTypesSnapshot, null);
  const used = await db.booking.count({ where: { userMembershipId: row.id, status: { in: ["confirmed", "attended"] } } });
  return { name: row.membership.name, status: row.status, startDate: row.startDate, endDate: row.endDate, remainingSessions: row.totalSessions == null ? null : Math.max(0, row.totalSessions - used), allowedClassTypes: allowed, offerTitle: row.offerTitle, paidPrice: row.snapshotFinalPrice ?? row.paymentAmount, features: (snapshot?.features as string[] | undefined) ?? json<string[]>(row.membership.features, []), snapshot };
}

export async function getCustomerBookingEligibility(userId: string | null, classType: string) {
  const membership = await getAuthenticatedCustomerMembership(userId);
  if (!membership) return { authenticated: Boolean(userId), eligible: false, reason: "no_active_membership" };
  return { authenticated: true, eligible: !membership.allowedClassTypes || membership.allowedClassTypes.length === 0 || membership.allowedClassTypes.map(norm).includes(norm(classType)), reason: "snapshot" };
}

export async function comparePlans(names: string[]) { return Promise.all(names.slice(0, 2).map(async (name) => (await getOfferDetails(name)) ?? (await getMembershipDetails(name)))); }
