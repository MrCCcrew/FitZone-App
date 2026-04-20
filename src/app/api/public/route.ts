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
    labelEn?: string | null;
    sizeType: ProductSizeType;
    icon?: string | null;
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
    priceBefore: number | null;
    priceAfter: number | null;
    durationDays: number;
    cycle: string | null;
    sessionsCount: number | null;
    features: string[];
    walletBonus: number;
    gift: string | null;
    kind: string;
    goalIds: string[];
  }>;
  trialMembership: {
    id: string;
    name: string;
    price: number;
    sessionsCount: number;
    features: string[];
    durationDays: number;
  } | null;
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
    showMaxSubscribers: boolean;
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
    category: string | null;
    type: string;
    subType: string | null;
    price: number;
    maxSpots: number;
    showTrainerName: boolean;
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
  blog: {
    categories: string[];
    posts: Array<{
      id: string;
      title: string;
      category: string;
      author: string;
      date: string;
      readTime: string;
      featured: boolean;
      summary: string;
      content: string;
      coverImage: string;
      videoUrl: string;
      active: boolean;
    }>;
  };
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
    stock: number;
  }>;
  testimonials: Array<{
    id: string;
    displayName: string;
    displayNameEn?: string | null;
    content: string;
    contentEn?: string | null;
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
  deliveryOptions: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    fee: number;
    estimatedDaysMin: number | null;
    estimatedDaysMax: number | null;
    showCashOnDelivery: boolean;
    sortOrder: number;
  }>;
  paymentSettings: {
    instapayUrl: string;
    instapayLabel: string;
    vodafoneCashUrl: string;
    vodafoneCashLabel: string;
    instapayAccounts: { id: string; label: string; url: string; isDefault?: boolean }[];
    vodafoneCashAccounts: { id: string; label: string; url: string; isDefault?: boolean }[];
  };
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
  trialMembership: null,
  offers: [],
  classes: [],
  trainers: [],
  trainersPage: null,
  blog: { categories: [], posts: [] },
  products: [],
  categories: [],
  testimonials: [],
  healthQuestions: [],
  deliveryOptions: [],
  paymentSettings: {
    instapayUrl: "",
    instapayLabel: "InstaPay",
    vodafoneCashUrl: "",
    vodafoneCashLabel: "Vodafone Cash",
    instapayAccounts: [],
    vodafoneCashAccounts: [],
  },
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

export async function GET(request: Request) {
  try {
    const lang = new URL(request.url).searchParams.get("lang") === "en" ? "en" : "ar";
    const now = Date.now();
    const cached = getPublicApiCache(lang);

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, { headers: RESPONSE_HEADERS });
    }

    await ensureDefaultProductCategories();

    const scheduleFrom = new Date();
    scheduleFrom.setHours(0, 0, 0, 0);
    const scheduleTo = new Date(scheduleFrom);
    scheduleTo.setDate(scheduleTo.getDate() + 6);
    scheduleTo.setHours(23, 59, 59, 999);

    const [categories, goals, memberships, offers, classes, trainers, siteContent, products, testimonials, healthQuestions, deliveryOptions] =
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
          orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
        }),
        db.offer.findMany({
          where: { isActive: true },
          orderBy: { expiresAt: "asc" },
        }),
        db.class.findMany({
          where: { isActive: true },
          include: {
            trainer: true,
            schedules: {
              where: { isActive: true, date: { gte: scheduleFrom, lte: scheduleTo } },
              orderBy: [{ date: "asc" }, { time: "asc" }],
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
          where: { section: { in: ["trainersPage", "contact", "blog", "paymentSettings", "trial_class_settings"] } },
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
        db.deliveryOption.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
      ]);

    const categoryMeta = new Map(
      categories.map((category) => [
        category.key,
        { label: category.label, labelEn: category.labelEn, sizeType: category.sizeType },
      ]),
    );

    const paymentSettingsRecord = parseSiteContentRecord(siteContent, "paymentSettings", {
      instapayUrl: "",
      instapayLabel: "InstaPay",
      vodafoneCashUrl: "",
      vodafoneCashLabel: "Vodafone Cash",
      instapayAccounts: [],
      vodafoneCashAccounts: [],
    });

    const contactRecord = parseSiteContentRecord(siteContent, "contact", EMPTY_PAYLOAD.contact) as PublicPayload["contact"] & {
      addressEn?: string;
      hoursEn?: string;
    };

    const payload: PublicPayload = {
      contact:
        lang === "en"
          ? {
              ...contactRecord,
              address: contactRecord.addressEn ?? contactRecord.address,
              hours: contactRecord.hoursEn ?? contactRecord.hours,
            }
          : contactRecord,
      categories: categories.map((category) => ({
        key: category.key,
        label: lang === "en" ? (category.labelEn || category.label) : category.label,
        labelEn: category.labelEn,
        sizeType: normalizeSizeType(category.sizeType),
        icon: category.icon ?? null,
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: lang === "en" ? (goal.nameEn || goal.name) : goal.name,
        slug: goal.slug,
        description: lang === "en" ? (goal.descriptionEn || goal.description) : goal.description,
        image: goal.image,
        kind: goal.kind,
        parentId: goal.parentId,
        sortOrder: goal.sortOrder,
      })),
      memberships: memberships
        .filter((membership) => membership.kind !== "trial")
        .map((membership) => ({
          id: membership.id,
          name: lang === "en" ? (membership.nameEn || membership.name) : membership.name,
          price: membership.price,
          priceBefore: membership.priceBefore ?? null,
          priceAfter: membership.priceAfter ?? null,
          image: membership.image ?? null,
          sortOrder: membership.sortOrder ?? 0,
          durationDays: membership.duration,
          cycle: cycleFromMembership(membership.cycle, membership.duration),
          sessionsCount: membership.sessionsCount ?? null,
          features: lang === "en" ? parseJsonArray(membership.featuresEn) : parseJsonArray(membership.features),
          walletBonus: membership.walletBonus,
          gift: lang === "en" ? (membership.giftEn || membership.gift) : membership.gift,
          kind: membership.kind,
          goalIds: membership.goals.map((goal) => goal.goalId),
        })),
      trialMembership: (() => {
        const trial = memberships.find((m) => m.kind === "trial");
        if (!trial) return null;
        const trialSettings = parseSiteContentRecord(siteContent, "trial_class_settings", { enabled: true });
        if ((trialSettings as { enabled?: boolean }).enabled === false) return null;
        return {
          id: trial.id,
          name: lang === "en" ? (trial.nameEn || trial.name) : trial.name,
          price: trial.price,
          sessionsCount: trial.sessionsCount ?? 1,
          features: lang === "en" ? parseJsonArray(trial.featuresEn) : parseJsonArray(trial.features),
          durationDays: trial.duration,
        };
      })(),
      offers: offers.map((offer) => ({
        id: offer.id,
        title: lang === "en" ? (offer.titleEn || offer.title) : offer.title,
        type: normalizeOfferType(offer.type),
        discount: offer.discount,
        specialPrice: offer.specialPrice,
        description: lang === "en" ? (offer.descriptionEn || offer.description || "") : (offer.description || ""),
        appliesTo: lang === "en" ? (offer.appliesToEn || offer.appliesTo || "") : (offer.appliesTo || ""),
        membershipId: offer.membershipId,
        image: offer.image,
        showOnHome: offer.showOnHome,
        showMaxSubscribers: offer.showMaxSubscribers,
        maxSubscribers: offer.maxSubscribers,
        currentSubscribers: offer.currentSubscribers,
        expiresAt: offer.expiresAt.toISOString(),
      })),
      classes: classes.map((gymClass) => ({
        id: gymClass.id,
        name: lang === "en" ? (gymClass.nameEn || gymClass.name) : gymClass.name,
        description: lang === "en" ? (gymClass.descriptionEn || gymClass.description || "") : (gymClass.description || ""),
        trainer:
          gymClass.showTrainerName === false || !gymClass.trainer
            ? ""
            : lang === "en"
              ? (gymClass.trainer.nameEn || gymClass.trainer.name)
              : gymClass.trainer.name,
        trainerSpecialty:
          gymClass.showTrainerName === false || !gymClass.trainer
            ? ""
            : lang === "en"
              ? (gymClass.trainer.specialtyEn || gymClass.trainer.specialty || "")
              : (gymClass.trainer.specialty || ""),
        duration: lang === "en" ? `${gymClass.duration} min` : `${gymClass.duration} دقيقة`,
        intensity: gymClass.intensity,
        category: lang === "en" ? (gymClass.categoryEn || gymClass.category || null) : (gymClass.category || null),
        type: lang === "en" ? (gymClass.typeEn || gymClass.type) : gymClass.type,
        subType: lang === "en" ? (gymClass.subTypeEn || gymClass.subType || null) : (gymClass.subType || null),
        price: gymClass.price,
        maxSpots: gymClass.maxSpots,
        showTrainerName: gymClass.showTrainerName ?? true,
        schedules: gymClass.schedules.map((schedule) => ({
          id: schedule.id,
          date: schedule.date.toISOString(),
          time: schedule.time,
          availableSpots: schedule.availableSpots,
        })),
      })),
      trainers: trainers.map((trainer) => ({
        id: trainer.id,
        name: lang === "en" ? (trainer.nameEn || trainer.name) : trainer.name,
        specialty: lang === "en" ? (trainer.specialtyEn || trainer.specialty) : trainer.specialty,
        bio: lang === "en" ? (trainer.bioEn || trainer.bio || "") : (trainer.bio || ""),
        certifications: lang === "en" ? parseJsonArray(trainer.certificationsEn) : parseJsonArray(trainer.certifications),
        rating: trainer.rating,
        sessionsCount: trainer.sessionsCount,
        image: trainer.image,
        showOnHome: trainer.showOnHome,
        sortOrder: trainer.sortOrder,
        classesCount: trainer._count.classes,
      })),
      trainersPage: (() => {
        const content = parseSiteContentRecord<PublicPayload["trainersPage"]>(siteContent, "trainersPage", null);
        if (!content) return content;
        if (lang === "en") {
          const typed = content as PublicPayload["trainersPage"] & {
            badgeEn?: string;
            titleEn?: string;
            subtitleEn?: string;
            descriptionEn?: string;
            highlightEn?: string;
            ctaLabelEn?: string;
          };
          return {
            ...content,
            badge: typed.badgeEn ?? content.badge,
            title: typed.titleEn ?? content.title,
            subtitle: typed.subtitleEn ?? content.subtitle,
            description: typed.descriptionEn ?? content.description,
            highlight: typed.highlightEn ?? content.highlight,
            ctaLabel: typed.ctaLabelEn ?? content.ctaLabel,
          };
        }
        return content;
      })(),
      blog: (() => {
        const content = parseSiteContentRecord(siteContent, "blog", EMPTY_PAYLOAD.blog);
        if (lang !== "en") return content;
        const typed = content as PublicPayload["blog"] & {
          categoriesEn?: string[];
          postsEn?: PublicPayload["blog"]["posts"];
          posts?: Array<
            PublicPayload["blog"]["posts"][number] & {
              titleEn?: string;
              categoryEn?: string;
              authorEn?: string;
              dateEn?: string;
              readTimeEn?: string;
              summaryEn?: string;
              contentEn?: string;
            }
          >;
        };
        const localizedPosts = Array.isArray(typed.posts)
          ? typed.posts.map((post) => {
              const localizedPost = post as typeof post & {
                titleEn?: string;
                categoryEn?: string;
                authorEn?: string;
                dateEn?: string;
                readTimeEn?: string;
                summaryEn?: string;
                contentEn?: string;
              };
              return ({
              ...post,
              title: localizedPost.titleEn ?? post.title,
              category: localizedPost.categoryEn ?? post.category,
              author: localizedPost.authorEn ?? post.author,
              date: localizedPost.dateEn ?? post.date,
              readTime: localizedPost.readTimeEn ?? post.readTime,
              summary: localizedPost.summaryEn ?? post.summary,
              content: localizedPost.contentEn ?? post.content,
            });
          })
          : content.posts;
        return {
          categories: Array.isArray(typed.categoriesEn) ? typed.categoriesEn : content.categories,
          posts: Array.isArray(typed.postsEn) ? typed.postsEn : localizedPosts,
        };
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
          name: lang === "en" ? (product.nameEn || product.name) : product.name,
          price: product.price,
          oldPrice: product.oldPrice,
          category: product.category,
          categoryLabel: lang === "en" ? (category?.labelEn || category?.label || product.category) : (category?.label || product.category),
          sizeType: normalizeSizeType(category?.sizeType),
          description: lang === "en" ? (product.descriptionEn || product.description || "") : (product.description || ""),
          images: parseJsonArray(product.images),
          sizes: parseJsonArray(product.sizes),
          colors: parseJsonArray(product.colors),
          faqs: parseJsonArray(product.faqs),
          whoShouldBuy: parseJsonArray(product.whoShouldBuy),
          importantInfo: product.importantInfo ?? null,
          disclaimer: product.disclaimer ?? null,
          editorialReview: product.editorialReview ?? null,
          rating,
          reviewCount,
          stock: product.stock,
        };
      }),
      testimonials: testimonials.map((testimonial) => {
        const name = testimonial.displayName || testimonial.user.name || (lang === "en" ? "Fit Zone client" : "عميلة فيت زون");

        return {
          id: testimonial.id,
          displayName: lang === "en" ? (testimonial.displayNameEn || name) : name,
          displayNameEn: testimonial.displayNameEn,
          content: lang === "en" ? (testimonial.contentEn || testimonial.content) : testimonial.content,
          contentEn: testimonial.contentEn,
          rating: testimonial.rating,
          createdAt: testimonial.createdAt.toISOString(),
          user: { name: lang === "en" ? (testimonial.displayNameEn || name) : name },
        };
      }),
      healthQuestions: healthQuestions.map((question) => ({
        id: question.id,
        title: lang === "en" ? (question.titleEn || question.title) : question.title,
        prompt: lang === "en" ? (question.promptEn || question.prompt) : question.prompt,
        sortOrder: question.sortOrder,
        restrictedClassTypes: question.restrictions.map((item) => item.classType),
      })),
      deliveryOptions: deliveryOptions.map((option) => ({
        id: option.id,
        name: lang === "en" ? (option.nameEn || option.name) : option.name,
        type: option.type,
        description: lang === "en" ? (option.descriptionEn || option.description || "") : (option.description || ""),
        fee: option.fee,
        estimatedDaysMin: option.estimatedDaysMin,
        estimatedDaysMax: option.estimatedDaysMax,
        showCashOnDelivery: option.showCashOnDelivery,
        sortOrder: option.sortOrder,
      })),
      paymentSettings: {
        instapayUrl: String((paymentSettingsRecord as Record<string, unknown>).instapayUrl ?? ""),
        instapayLabel: String((paymentSettingsRecord as Record<string, unknown>).instapayLabel ?? "InstaPay"),
        vodafoneCashUrl: String((paymentSettingsRecord as Record<string, unknown>).vodafoneCashUrl ?? ""),
        vodafoneCashLabel: String((paymentSettingsRecord as Record<string, unknown>).vodafoneCashLabel ?? "Vodafone Cash"),
        instapayAccounts: Array.isArray((paymentSettingsRecord as Record<string, unknown>).instapayAccounts)
          ? ((paymentSettingsRecord as Record<string, unknown>).instapayAccounts as { id: string; label: string; url: string; isDefault?: boolean }[])
          : [],
        vodafoneCashAccounts: Array.isArray((paymentSettingsRecord as Record<string, unknown>).vodafoneCashAccounts)
          ? ((paymentSettingsRecord as Record<string, unknown>).vodafoneCashAccounts as { id: string; label: string; url: string; isDefault?: boolean }[])
          : [],
      },
    };

    setPublicApiCache(lang, {
      expiresAt: now + 30_000,
      payload,
    });

    return NextResponse.json(payload, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[PUBLIC_API]", error);
    return NextResponse.json(EMPTY_PAYLOAD, { headers: RESPONSE_HEADERS });
  }
}
