import { db } from "@/lib/db";
import { loadCoachProfile } from "@/lib/ai-coach/profile";
import { getRecentCheckInsByProfile } from "@/lib/ai-coach/checkin";
import { isCoachAdvancedFeaturesEnabled } from "@/lib/ai-coach/config";
import type {
  CoachAccountSummary,
  CoachAttendanceStats,
  CoachKnowledgeEntry,
  CoachLang,
  CoachPublicClass,
  CoachPublicMembership,
  CoachPublicOffer,
  CoachPublicProduct,
  CoachPublicTrainer,
  CoachSiteSnapshot,
} from "@/lib/ai-coach/types";

function parseJsonArray(value: string | null | undefined) {
  try {
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function computeAttendanceStats(
  bookings: Array<{ status: string; schedule: { date: Date } }>,
): CoachAttendanceStats {
  const now = Date.now();
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;

  const attendedInPeriod = bookings.filter(
    (b) => b.status === "attended" && now - b.schedule.date.getTime() <= ms30d,
  );
  const confirmedUpcoming = bookings.filter(
    (b) =>
      b.status === "confirmed" &&
      b.schedule.date.getTime() >= now &&
      b.schedule.date.getTime() - now <= ms7d,
  );

  const lastAttended = bookings
    .filter((b) => b.status === "attended")
    .sort((a, b) => b.schedule.date.getTime() - a.schedule.date.getTime())[0];

  const daysSinceLastAttended = lastAttended
    ? Math.floor((now - lastAttended.schedule.date.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    attendedCount30d: attendedInPeriod.length,
    confirmedCount7d: confirmedUpcoming.length,
    daysSinceLastAttended,
  };
}

export async function getCoachKnowledgeEntries(): Promise<CoachKnowledgeEntry[]> {
  const entries = await db.chatKnowledgeEntry.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  });

  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    answer: entry.answer,
    priority: entry.priority,
    keywords: parseJsonArray(entry.keywords),
  }));
}

export async function getCoachAccountSummary(userId: string | null): Promise<CoachAccountSummary> {
  if (!userId) return { authenticated: false };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      wallet: true,
      rewardPoints: true,
      referral: true,
      memberships: {
        where: { status: "active" },
        include: { membership: true },
        orderBy: { startDate: "desc" },
        take: 1,
      },
      bookings: {
        where: {
          status: { in: ["confirmed", "attended"] },
          schedule: { date: { gte: thirtyDaysAgo } },
        },
        include: { schedule: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!user) return { authenticated: false };

  const attendanceStats = computeAttendanceStats(user.bookings);
  const upcomingBooking = user.bookings
    .filter((b) => b.status === "confirmed" && b.schedule.date.getTime() > Date.now())
    .sort((a, b) => a.schedule.date.getTime() - b.schedule.date.getTime())[0];

  return {
    authenticated: true,
    userName: user.name ?? "",
    walletBalance: user.wallet?.balance ?? 0,
    rewardPoints: user.rewardPoints?.points ?? 0,
    rewardTier: user.rewardPoints?.tier ?? "bronze",
    referralCode: user.referral?.code ?? null,
    membership: user.memberships[0]
      ? {
          name: user.memberships[0].membership.name,
          endDate: user.memberships[0].endDate.toISOString(),
        }
      : null,
    upcomingBookingDate: upcomingBooking?.schedule.date.toISOString() ?? null,
    recentBookingDates: user.bookings.slice(0, 10).map((b) => b.schedule.date.toISOString()),
    attendanceStats,
  };
}

export async function getCoachSiteSnapshot(
  lang: CoachLang,
  userId: string | null,
  guestSessionId?: string | null,
): Promise<CoachSiteSnapshot> {
  const advancedEnabled = isCoachAdvancedFeaturesEnabled();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const onlineThreshold = new Date(Date.now() - 2 * 60 * 1000);

  const [memberships, offers, classes, trainers, products, knowledge, account, supportOnlineCount, coachProfile] =
    await Promise.all([
      db.membership.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      }),
      db.offer.findMany({
        where: { isActive: true, expiresAt: { gte: new Date() } },
        orderBy: { expiresAt: "asc" },
        take: 6,
      }),
      db.class.findMany({
        where: { isActive: true },
        include: {
          trainer: true,
          schedules: {
            where: { isActive: true, date: { gte: todayStart, lte: weekEnd } },
            orderBy: [{ date: "asc" }, { time: "asc" }],
            take: 8,
          },
        },
        orderBy: { name: "asc" },
        take: 20,
      }),
      db.trainer.findMany({
        where: { isActive: true },
        include: { _count: { select: { classes: true } } },
        orderBy: [{ showOnHome: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        take: 12,
      }),
      db.product.findMany({
        where: { isActive: true },
        orderBy: [{ stock: "desc" }, { price: "asc" }],
        take: 12,
      }),
      getCoachKnowledgeEntries(),
      getCoachAccountSummary(userId),
      db.supportPresence.count({
        where: { isOnline: true, lastSeenAt: { gte: onlineThreshold } },
      }),
      advancedEnabled ? loadCoachProfile(userId, guestSessionId) : Promise.resolve(null),
    ]);

  const recentCheckIns =
    advancedEnabled && coachProfile?.id
      ? await getRecentCheckInsByProfile(coachProfile.id, 5)
      : [];

  const localizedMemberships: CoachPublicMembership[] = memberships.map((membership) => ({
    id: membership.id,
    name: lang === "en" ? membership.nameEn ?? membership.name : membership.name,
    price: membership.price,
    features: lang === "en" ? parseJsonArray(membership.featuresEn) : parseJsonArray(membership.features),
    maxClasses: membership.maxClasses,
  }));

  const localizedOffers: CoachPublicOffer[] = offers.map((offer) => ({
    id: offer.id,
    title: lang === "en" ? offer.titleEn ?? offer.title : offer.title,
    description: lang === "en" ? offer.descriptionEn ?? offer.description ?? "" : offer.description ?? "",
    expiresAt: offer.expiresAt.toISOString(),
  }));

  const localizedClasses: CoachPublicClass[] = classes.map((gymClass) => ({
    id: gymClass.id,
    name: lang === "en" ? gymClass.nameEn ?? gymClass.name : gymClass.name,
    description: lang === "en" ? gymClass.descriptionEn ?? gymClass.description ?? "" : gymClass.description ?? "",
    trainer: lang === "en" ? gymClass.trainer.nameEn ?? gymClass.trainer.name : gymClass.trainer.name,
    trainerSpecialty:
      lang === "en"
        ? gymClass.trainer.specialtyEn ?? gymClass.trainer.specialty ?? ""
        : gymClass.trainer.specialty ?? "",
    category: lang === "en" ? gymClass.categoryEn ?? gymClass.category : gymClass.category,
    type: lang === "en" ? gymClass.typeEn ?? gymClass.type : gymClass.type,
    subType: lang === "en" ? gymClass.subTypeEn ?? gymClass.subType : gymClass.subType,
    duration: lang === "en" ? `${gymClass.duration} min` : `${gymClass.duration} دقيقة`,
    schedules: gymClass.schedules.map((schedule) => ({
      id: schedule.id,
      date: schedule.date.toISOString(),
      time: schedule.time,
      availableSpots: schedule.availableSpots,
    })),
  }));

  const localizedTrainers: CoachPublicTrainer[] = trainers.map((trainer) => ({
    id: trainer.id,
    name: lang === "en" ? trainer.nameEn ?? trainer.name : trainer.name,
    specialty: lang === "en" ? trainer.specialtyEn ?? trainer.specialty : trainer.specialty,
    bio: lang === "en" ? trainer.bioEn ?? trainer.bio ?? "" : trainer.bio ?? "",
    rating: trainer.rating,
    classesCount: trainer._count.classes,
  }));

  const localizedProducts: CoachPublicProduct[] = products.map((product) => ({
    id: product.id,
    name: lang === "en" ? product.nameEn ?? product.name : product.name,
    price: product.price,
    categoryLabel: product.category,
    description: lang === "en" ? product.descriptionEn ?? product.description ?? "" : product.description ?? "",
    stock: product.stock,
  }));

  return {
    memberships: localizedMemberships,
    offers: localizedOffers,
    classes: localizedClasses,
    trainers: localizedTrainers,
    products: localizedProducts,
    knowledge,
    account,
    coachProfile,
    recentCheckIns,
    supportOnline: supportOnlineCount > 0,
  };
}
