import { db } from "@/lib/db";

const MAX = 8;
const norm = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
const json = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const STOP_WORDS = new Set(["هل", "يوجد", "عندكم", "ايه", "العروض", "عرض", "خاصه", "خصومات", "اللي", "في", "عن", "كلمني", "على", "الجيم", "باقه", "الباقات"]);
function searchTerms(query: string) { return norm(query).split(/\s+/).filter((term) => term.length > 2 && !STOP_WORDS.has(term)); }
function looselyMatches(text: string, query: string) {
  const terms = searchTerms(query); if (!terms.length) return true;
  const haystack = norm(text);
  return terms.some((term) => haystack.includes(term) || (term.length >= 4 && [...haystack].some((_, index) => haystack.slice(index, index + term.length - 1) === term.slice(0, -1))));
}

/** Read-only, bounded catalog tools. They accept search terms only, never SQL/Prisma input. */
export async function searchAvailableMemberships(query = "") {
  const rows = await db.membership.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }], take: MAX, select: { id: true, name: true, nameEn: true, kind: true, duration: true, sessionsCount: true, price: true, priceBefore: true, priceAfter: true, features: true, classSessions: true, goals: { select: { goal: { select: { name: true, nameEn: true } } } } } });
  return rows.filter((row) => looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.features}`, query)).map((row) => ({ ...row, allowedClasses: json<Array<{ classId: string; classType?: string }>>(row.classSessions, []), features: json<string[]>(row.features, []), goals: row.goals.map((g) => g.goal.name) }));
}

export async function searchActiveOffers(query = "") {
  const rows = await db.offer.findMany({ where: { isActive: true, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" }, take: MAX, include: { membership: { select: { name: true, price: true, duration: true, sessionsCount: true, goals: { select: { goal: { select: { name: true } } } } } }, allowedClassTypes: { select: { classType: true } } } });
  return rows.filter((row) => looselyMatches(`${row.title} ${row.titleEn ?? ""} ${row.description ?? ""}`, query)).map((row) => {
    const originalPrice = row.priceBefore ?? row.membership?.price ?? null;
    const finalPrice = row.specialPrice ?? row.membership?.price ?? null;
    return { id: row.id, title: row.title, titleEn: row.titleEn, type: row.type, originalPrice, discount: row.discount, finalPrice, expiresAt: row.expiresAt, durationDays: row.durationDays ?? row.membership?.duration ?? null, sessionsCount: row.sessionsCount ?? row.membership?.sessionsCount ?? null, allowedClassTypes: row.allowedClassTypes.map((item) => item.classType), features: json<string[]>(row.features, []), goals: row.membership?.goals.map((g) => g.goal.name) ?? [] };
  });
}

/** Customer-visible, active products only; inventory is enforced when tracked. */
export async function searchAvailableProducts(query = "", filters?: { discountedOnly?: boolean }) {
  const rows = await db.product.findMany({
    where: { isActive: true, deletedAt: null, OR: [{ trackInventory: false }, { stock: { gt: 0 } }] },
    orderBy: [{ displayPriority: "desc" }, { isBestSeller: "desc" }], take: MAX,
    select: { id: true, name: true, nameEn: true, category: true, description: true, price: true, oldPrice: true, stock: true, trackInventory: true, images: true },
  });
  return rows.filter((row) => (!filters?.discountedOnly || (row.oldPrice ?? 0) > row.price) && looselyMatches(`${row.name} ${row.nameEn ?? ""} ${row.category} ${row.description ?? ""}`, query)).map((row) => ({ ...row, image: json<string[]>(row.images, [])[0] ?? null, discountPercent: row.oldPrice && row.oldPrice > row.price ? Math.round((1 - row.price / row.oldPrice) * 100) : null }));
}

export async function getOfferDetails(idOrName: string) { return (await searchActiveOffers(idOrName)).find((row) => row.id === idOrName || norm(row.title) === norm(idOrName)) ?? null; }
export async function getMembershipDetails(idOrName: string) { return (await searchAvailableMemberships(idOrName)).find((row) => row.id === idOrName || norm(row.name) === norm(idOrName)) ?? null; }

export async function searchClassSchedule(query = "") {
  const rows = await db.class.findMany({ where: { isActive: true }, take: MAX, include: { trainer: { select: { name: true } }, schedules: { where: { isActive: true, date: { gte: new Date() } }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 5 } } });
  return rows.filter((row) => looselyMatches(`${row.name} ${row.type} ${row.category ?? ""} ${row.subType ?? ""}`, query)).map((row) => ({ name: row.name, type: row.type, category: row.category, trainer: row.trainer.name, schedules: row.schedules.map((s) => ({ date: s.date, time: s.time, availableSpots: s.availableSpots })) }));
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
