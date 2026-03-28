import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDefaultProductCategories } from "@/lib/product-categories";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type ProductSizeType = "none" | "clothing" | "shoes";

type PublicPayload = {
  categories: Array<{
    key: string;
    label: string;
    sizeType: ProductSizeType;
  }>;
  memberships: Array<{
    id: string;
    name: string;
    price: number;
    duration: string;
    features: string[];
    walletBonus: number;
    gift: string | null;
  }>;
  offers: Array<{
    id: string;
    title: string;
    discount: string;
    desc: string;
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
};

const globalForPublicApi = globalThis as unknown as {
  fitzonePublicApiCache?: { expiresAt: number; payload: PublicPayload };
};

const EMPTY_PAYLOAD: PublicPayload = {
  memberships: [],
  offers: [],
  classes: [],
  products: [],
  categories: [],
  testimonials: [],
};

const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
} as const;

const daysToLabel = (days: number) =>
  days <= 31 ? "monthly" : days <= 100 ? "quarterly" : "annual";

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

export async function GET() {
  try {
    const now = Date.now();
    const cached = globalForPublicApi.fitzonePublicApiCache;

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, { headers: RESPONSE_HEADERS });
    }

    await ensureDefaultProductCategories();

    const [categories, memberships, offers, classes, products, testimonials] =
      await Promise.all([
        db.productCategory.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
        db.membership.findMany({
          where: { isActive: true },
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
      ]);

    const categoryMeta = new Map(
      categories.map((category) => [
        category.key,
        { label: category.label, sizeType: category.sizeType },
      ]),
    );

    const payload: PublicPayload = {
      categories: categories.map((category) => ({
        key: category.key,
        label: category.label,
        sizeType: normalizeSizeType(category.sizeType),
      })),
      memberships: memberships.map((membership) => ({
        id: membership.id,
        name: membership.name,
        price: membership.price,
        duration: daysToLabel(membership.duration),
        features: parseJsonArray(membership.features),
        walletBonus: membership.walletBonus,
        gift: membership.gift,
      })),
      offers: offers.map((offer) => ({
        id: offer.id,
        title: offer.title,
        discount: `${offer.discount}%`,
        desc: offer.description ?? "",
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
    };

    globalForPublicApi.fitzonePublicApiCache = {
      expiresAt: now + 30_000,
      payload,
    };

    return NextResponse.json(payload, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[PUBLIC_API]", error);
    return NextResponse.json(EMPTY_PAYLOAD, { headers: RESPONSE_HEADERS });
  }
}
