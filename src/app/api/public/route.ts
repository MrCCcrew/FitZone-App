import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDefaultProductCategories } from "@/lib/product-categories";
import { getPublicApiCache, setPublicApiCache } from "@/lib/public-cache";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type ProductSizeType = "none" | "clothing" | "shoes";

type PublicPayload = {
  contact: {
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    hours: string;
    facebook: string;
    instagram: string;
    mapEmbed: string;
  };
  categories: Array<{
    key: string;
    label: string;
    sizeType: ProductSizeType;
  }>;
  goals: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    kind: string;
    parentId: string | null;
    sortOrder: number;
  }>;
  memberships: Array<{
    id: string;
    name: string;
    price: number;
    durationDays: number;
    cycle: string | null;
    sessionsCount: number | null;
    features: string[];
    walletBonus: number;
    gift: string | null;
    kind: string;
    goalIds: string[];
  }>;
  offers: Array<{
    id: string;
    title: string;
    type: "percentage" | "fixed" | "special";
    discount: number;
    specialPrice: number | null;
    description: string;
    appliesTo: string;
    membershipId: string | null;
    image: string | null;
    showOnHome: boolean;
    maxSubscribers: number | null;
    currentSubscribers: number;
    expiresAt: string;
  }>;
  classes: Array<{
    id: string;
    name: string;
    description: string;
    trainer: string;
    trainerSpecialty: string;
    duration: string;
    intensity: string;
    type: string;
    price: number;
    maxSpots: number;
    schedules: Array<{
      id: string;
      date: string;
      time: string;
      availableSpots: number;
    }>;
  }>;
  trainers: Array<{
    id: string;
    name: string;
    specialty: string;
    bio: string;
    certifications: string[];
    rating: number;
    sessionsCount: number;
    image: string | null;
    showOnHome: boolean;
    sortOrder: number;
    classesCount: number;
  }>;
  trainersPage: {
    badge: string;
    title: string;
    subtitle: string;
    description: string;
    highlight: string;
    ctaLabel: string;
  } | null;
  products: Array<{
    id: string;
    name: string;
    price: number;
    oldPrice: number | null;
    category: string;
    categoryLabel: string;
    sizeType: ProductSizeType;
    description: string;
    images: string[];
    sizes: string[];
    colors: string[];
    rating: number;
    reviewCount: number;
  }>;
  testimonials: Array<{
    id: string;
    displayName: string;
    content: string;
    rating: number;
    createdAt: string;
    user: { name: string };
  }>;
  healthQuestions: Array<{
    id: string;
    title: string;
    prompt: string;
    sortOrder: number;
    restrictedClassTypes: string[];
  }>;
};

const EMPTY_PAYLOAD: PublicPayload = {
  contact: {
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    hours: "",
    facebook: "",
    instagram: "",
    mapEmbed: "",
  },
  goals: [],
  memberships: [],
  offers: [],
  classes: [],
  trainers: [],
  trainersPage: null,
  products: [],
  categories: [],
  testimonials: [],
  healthQuestions: [],
};

const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
} as const;

const cycleFromMembership = (cycle: string | null, days: number) =>
  cycle ?? (days <= 31 ? "monthly" : days <= 100 ? "quarterly" : days <= 200 ? "semi_annual" : "annual");

function parseJsonArray(value: string | null) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function normalizeSizeType(value: string | null | undefined): ProductSizeType {
  return value === "clothing" || value === "shoes" ? value : "none";
}

function normalizeOfferType(value: string | null | undefined): "percentage" | "fixed" | "special" {
  return value === "fixed" || value === "special" ? value : "percentage";
}

function parseSiteContentRecord<T>(records: Array<{ section: string; content: string }>, section: string, fallback: T): T {
  const record = records.find((item) => item.section === section);
  if (!record) return fallback;

  try {
    const parsed = JSON.parse(record.content);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      return { ...(fallback as Record<string, unknown>), ...(parsed as Record<string, unknown>) } as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    const now = Date.now();
    const cached = getPublicApiCache();

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, { headers: RESPONSE_HEADERS });
    }

    await ensureDefaultProductCategories();

    const [categories, goals, memberships, offers, classes, trainers, siteContent, products, testimonials, healthQuestions] =
      await Promise.all([
        db.productCategory.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
        db.clubGoal.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
        db.membership.findMany({
          where: { isActive: true },
          include: { goals: { select: { goalId: true } } },
          orderBy: { price: "asc" },
        }),
        db.offer.findMany({
          where: { isActive: true, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "asc" },
        }),
        db.class.findMany({
          where: { isActive: true },
          include: {
            trainer: true,
            schedules: {
              where: { isActive: true, date: { gte: new Date() } },
              orderBy: [{ date: "asc" }, { time: "asc" }],
              take: 6,
            },
          },
          orderBy: { name: "asc" },
        }),
        db.trainer.findMany({
          where: { isActive: true },
          include: {
            _count: {
              select: {
                classes: true,
              },
            },
          },
          orderBy: [{ showOnHome: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
        }),
        db.siteContent.findMany({
          where: { section: { in: ["trainersPage", "contact"] } },
        }),
        db.product.findMany({
          where: { isActive: true },
          include: {
            reviews: {
              select: {
                rating: true,
              },
            },
          },
          orderBy: { price: "asc" },
        }),
        db.testimonial.findMany({
          where: { status: "approved" },
          include: { user: { select: { name: true } } },
          orderBy: [{ createdAt: "desc" }],
          take: 12,
        }),
        db.healthQuestion.findMany({
          where: { isActive: true },
          include: { restrictions: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
      ]);

    const categoryMeta = new Map(
      categories.map((category) => [
        category.key,
        { label: category.label, sizeType: category.sizeType },
      ]),
    );

    const payload: PublicPayload = {
      contact: parseSiteContentRecord(siteContent, "contact", EMPTY_PAYLOAD.contact),
      categories: categories.map((category) => ({
        key: category.key,
        label: category.label,
        sizeType: normalizeSizeType(category.sizeType),
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        slug: goal.slug,
        description: goal.description,
        image: goal.image,
        kind: goal.kind,
        parentId: goal.parentId,
        sortOrder: goal.sortOrder,
      })),
      memberships: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        price: membership.price,
        durationDays: membership.duration,
        cycle: cycleFromMembership(membership.cycle, membership.duration),
        sessionsCount: membership.sessionsCount ?? null,
        features: parseJsonArray(membership.features),
        walletBonus: membership.walletBonus,
        gift: membership.gift,
        kind: membership.kind,
        goalIds: membership.goals.map((goal) => goal.goalId),
      })),
      offers: offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        type: normalizeOfferType(offer.type),
        discount: offer.discount,
        specialPrice: offer.specialPrice,
        description: offer.description ?? "",
        appliesTo: offer.appliesTo ?? "",
        membershipId: offer.membershipId,
        image: offer.image,
        showOnHome: offer.showOnHome,
        maxSubscribers: offer.maxSubscribers,
        currentSubscribers: offer.currentSubscribers,
        expiresAt: offer.expiresAt.toISOString(),
      })),
      classes: classes.map((gymClass) => ({
        id: gymClass.id,
        name: gymClass.name,
        description: gymClass.description ?? "",
        trainer: gymClass.trainer.name,
        trainerSpecialty: gymClass.trainer.specialty ?? "",
        duration: `${gymClass.duration} دقيقة`,
        intensity: gymClass.intensity,
        type: gymClass.type,
        price: gymClass.price,
        maxSpots: gymClass.maxSpots,
        schedules: gymClass.schedules.map((schedule) => ({
          id: schedule.id,
          date: schedule.date.toISOString(),
          time: schedule.time,
          availableSpots: schedule.availableSpots,
        })),
      })),
      trainers: trainers.map((trainer) => ({
        id: trainer.id,
        name: trainer.name,
        specialty: trainer.specialty,
        bio: trainer.bio ?? "",
        certifications: parseJsonArray(trainer.certifications),
        rating: trainer.rating,
        sessionsCount: trainer.sessionsCount,
        image: trainer.image,
        showOnHome: trainer.showOnHome,
        sortOrder: trainer.sortOrder,
        classesCount: trainer._count.classes,
      })),
      trainersPage: (() => {
        const content = parseSiteContentRecord<PublicPayload["trainersPage"]>(siteContent, "trainersPage", null);
        return content;
      })(),
      products: products.map((product) => {
        const category = categoryMeta.get(product.category);
        const reviewCount = product.reviews.length;
        const rating =
          reviewCount > 0
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / reviewCount
            : 0;

        return {
          id: product.id,
          name: product.name,
          price: product.price,
          oldPrice: product.oldPrice,
          category: product.category,
          categoryLabel: category?.label ?? product.category,
          sizeType: normalizeSizeType(category?.sizeType),
          description: product.description ?? "",
          images: parseJsonArray(product.images),
          sizes: parseJsonArray(product.sizes),
          colors: parseJsonArray(product.colors),
          rating,
          reviewCount,
        };
      }),
      testimonials: testimonials.map((testimonial) => {
        const name = testimonial.displayName || testimonial.user.name || "عميلة فيت زون";

        return {
          id: testimonial.id,
          displayName: name,
          content: testimonial.content,
          rating: testimonial.rating,
          createdAt: testimonial.createdAt.toISOString(),
          user: { name },
        };
      }),
      healthQuestions: healthQuestions.map((question) => ({
        id: question.id,
        title: question.title,
        prompt: question.prompt,
        sortOrder: question.sortOrder,
        restrictedClassTypes: question.restrictions.map((item) => item.classType),
      })),
    };

    setPublicApiCache({
      expiresAt: now + 30_000,
      payload,
    });

    return NextResponse.json(payload, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[PUBLIC_API]", error);
    return NextResponse.json(EMPTY_PAYLOAD, { headers: RESPONSE_HEADERS });
  }
}
