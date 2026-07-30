import { db } from "@/lib/db";

type InitialHomeData = {
  memberships: Array<{
    id: string;
    name: string;
    price: number;
    priceBefore: number | null;
    priceAfter: number | null;
    image: string | null;
    durationDays: number;
    cycle: string | null;
    sessionsCount: number | null;
    features: string[];
    walletBonus: number;
    gift: string | null;
    subtitle: string | null;
    kind: string;
    isFeatured: boolean;
    goalIds: string[];
    minMonths: number | null;
    maxMonths: number | null;
    discountPct: number | null;
  }>;
  offers: Array<{
    id: string;
    title: string;
    type: "percentage" | "fixed" | "special";
    discount: number;
    specialPrice: number | null;
    priceBefore: number | null;
    description: string;
    appliesTo: string;
    membershipId: string | null;
    image: string | null;
    showOnHome: boolean;
    showMaxSubscribers: boolean;
    showCurrentSubscribers: boolean;
    maxSubscribers: number | null;
    currentSubscribers: number;
    expiresAt: string;
    durationDays: number | null;
    sessionsCount: number | null;
    features: string[];
  }>;
};

const parseArray = (value: string | null) => {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

export async function getInitialHomeData(): Promise<InitialHomeData> {
  const [memberships, offers] = await Promise.all([
    db.membership.findMany({
      where: { isActive: true },
      include: { goals: { select: { goalId: true } } },
      orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
    }),
    db.offer.findMany({
      where: { isActive: true },
      orderBy: { expiresAt: "asc" },
    }),
  ]);

  return {
    memberships: memberships.filter((membership) => membership.kind !== "trial").map((membership) => ({
      id: membership.id,
      name: membership.name,
      price: membership.price,
      priceBefore: membership.priceBefore ?? null,
      priceAfter: membership.priceAfter ?? null,
      image: membership.image ?? null,
      durationDays: membership.duration,
      cycle: membership.cycle,
      sessionsCount: membership.sessionsCount ?? null,
      features: parseArray(membership.features),
      walletBonus: membership.walletBonus,
      gift: membership.gift ?? null,
      subtitle: membership.subtitle ?? null,
      kind: membership.kind,
      isFeatured: membership.isFeatured ?? false,
      goalIds: membership.goals.map((goal) => goal.goalId),
      minMonths: (membership as { minMonths?: number | null }).minMonths ?? null,
      maxMonths: (membership as { maxMonths?: number | null }).maxMonths ?? null,
      discountPct: (membership as { discountPct?: number | null }).discountPct ?? null,
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      title: offer.title,
      type: offer.type === "fixed" || offer.type === "special" ? offer.type : "percentage",
      discount: offer.discount,
      specialPrice: offer.specialPrice ?? null,
      priceBefore: offer.priceBefore ?? null,
      description: offer.description ?? "",
      appliesTo: offer.appliesTo ?? "",
      membershipId: offer.membershipId ?? null,
      image: offer.image ?? null,
      showOnHome: offer.showOnHome,
      showMaxSubscribers: offer.showMaxSubscribers,
      showCurrentSubscribers: offer.showCurrentSubscribers,
      maxSubscribers: offer.maxSubscribers ?? null,
      currentSubscribers: offer.currentSubscribers,
      expiresAt: offer.expiresAt.toISOString(),
      durationDays: offer.durationDays ?? null,
      sessionsCount: offer.sessionsCount ?? null,
      features: parseArray(offer.features),
    })),
  };
}
