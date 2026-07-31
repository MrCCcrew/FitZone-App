import { db } from "@/lib/db";

const MAX = 8;
const norm = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
const json = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

/** Read-only, bounded catalog tools. They accept search terms only, never SQL/Prisma input. */
export async function searchAvailableMemberships(query = "") {
  const rows = await db.membership.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { price: "asc" }], take: MAX, select: { id: true, name: true, nameEn: true, kind: true, duration: true, sessionsCount: true, price: true, priceBefore: true, priceAfter: true, features: true, classSessions: true, goals: { select: { goal: { select: { name: true, nameEn: true } } } } } });
  const q = norm(query);
  return rows.filter((row) => !q || norm(`${row.name} ${row.nameEn ?? ""} ${row.features}`).includes(q)).map((row) => ({ ...row, allowedClasses: json<Array<{ classId: string; classType?: string }>>(row.classSessions, []), features: json<string[]>(row.features, []), goals: row.goals.map((g) => g.goal.name) }));
}

export async function searchActiveOffers(query = "") {
  const rows = await db.offer.findMany({ where: { isActive: true, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" }, take: MAX, include: { membership: { select: { name: true, price: true, duration: true, sessionsCount: true, goals: { select: { goal: { select: { name: true } } } } } }, allowedClassTypes: { select: { classType: true } } } });
  const q = norm(query);
  return rows.filter((row) => !q || norm(`${row.title} ${row.titleEn ?? ""} ${row.description ?? ""}`).includes(q)).map((row) => ({ id: row.id, title: row.title, titleEn: row.titleEn, type: row.type, originalPrice: row.priceBefore ?? row.membership?.price ?? null, discount: row.discount, finalPrice: row.specialPrice ?? row.membership?.price ?? null, expiresAt: row.expiresAt, durationDays: row.durationDays ?? row.membership?.duration ?? null, sessionsCount: row.sessionsCount ?? row.membership?.sessionsCount ?? null, allowedClassTypes: row.allowedClassTypes.map((item) => item.classType), features: json<string[]>(row.features, []), goals: row.membership?.goals.map((g) => g.goal.name) ?? [] }));
}

export async function getOfferDetails(idOrName: string) { return (await searchActiveOffers(idOrName)).find((row) => row.id === idOrName || norm(row.title) === norm(idOrName)) ?? null; }
export async function getMembershipDetails(idOrName: string) { return (await searchAvailableMemberships(idOrName)).find((row) => row.id === idOrName || norm(row.name) === norm(idOrName)) ?? null; }

export async function searchClassSchedule(query = "") {
  const rows = await db.class.findMany({ where: { isActive: true }, take: MAX, include: { trainer: { select: { name: true } }, schedules: { where: { isActive: true, date: { gte: new Date() } }, orderBy: [{ date: "asc" }, { time: "asc" }], take: 5 } } });
  const q = norm(query);
  return rows.filter((row) => !q || norm(`${row.name} ${row.type} ${row.category ?? ""} ${row.subType ?? ""}`).includes(q)).map((row) => ({ name: row.name, type: row.type, category: row.category, trainer: row.trainer.name, schedules: row.schedules.map((s) => ({ date: s.date, time: s.time, availableSpots: s.availableSpots })) }));
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
