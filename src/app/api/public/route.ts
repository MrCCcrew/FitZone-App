import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureDefaultProductCategories } from "@/lib/product-categories";
import { getPublicApiCache, setPublicApiCache } from "@/lib/public-cache";
import { getPaymentSettings } from "@/lib/payments/settings";
import { parseStoredTrainerFileLinks } from "@/lib/trainer-profile";
import { activePublicOfferWhere } from "@/lib/offers";
import {
  visibleClassScheduleWhere,
  visibleMembershipWhere,
  visibleProductWhere,
  visibleScheduleWhere,
  visibleTrainerWhere,
} from "@/lib/public-catalog";
import { getEligibleClassesForSource } from "@/lib/get-eligible-classes";
import { cairoCalendarDateKey } from "@/lib/fitzone-time";

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
    whatsappChannel?: string;
    whatsappChannelEnabled?: boolean;
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
    isFeatured: boolean;
    coachMembershipEnabled: boolean;
    goalIds: string[];
    classSessions: Array<{
      classId?: string;
      classTypeId?: string;
      classType?: string;
      sessions: number;
    }>;
    /**
     * Canonical server-resolved eligibility.
     * Customer code must not reinterpret classSessions.
     */
    allowedClassIds: string[];
  }>;
  trialMembership: {
    id: string;
    name: string;
    price: number;
    sessionsCount: number;
    features: string[];
    durationDays: number;
    allowedClassIds: string[];
  } | null;
  trialClassesConfig: Record<
    string,
    { trialEnabled: boolean; trialPrice: number }
  >;
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
    showCurrentSubscribers: boolean;
    maxSubscribers: number | null;
    currentSubscribers: number;
    expiresAt: string;
    durationDays: number | null;
    sessionsCount: number | null;
    features: string[];
    priceBefore: number | null;
    allowedClassTypes: string[];
    allowedClassTypeIds?: string[];
    allowedClassIds: string[];
    friendOfferEnabled: boolean;
    friendRequiredMembers: number;
    friendInviteExpiryHours: number;
  }>;
  classes: Array<{
    id: string;
    classTypeId?: string | null;
    name: string;
    description: string;
    trainer: string;
    trainerImage: string | null;
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
    certificateFiles: Array<{ url: string; label: string }>;
    rating: number;
    sessionsCount: number;
    image: string | null;
    showOnHome: boolean;
    sortOrder: number;
    classesCount: number;

    /**
     * Server-authoritative eligibility for Coach Membership selection.
     * This is independent from trainer referral/discount attribution.
     */
    coachMembershipEligible: boolean;
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
    displayLabel: string;
    displayLabelAr: string;
    displayLabelEn: string;
    instapayAccounts: {
      id: string;
      label: string;
      url: string;
      isDefault?: boolean;
    }[];
    electronicMethods: string[];
    cashOnDeliveryEnabled?: boolean;
    cashOnDeliveryLabel?: string;
  };
  nutritionist: {
    id: string;
    name: string;
    bio: string | null;
    image: string | null;
    slots: { label: string; day: string; time: string }[];
    questions: {
      id: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }[];
    consultationFee: number;
    consultationFeeMember: number;
    followupFee: number;
    followupFeeMember: number;
  } | null;
  storeEnabled: boolean;
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
  trialClassesConfig: {},
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
    displayLabel: "Paymob",
    displayLabelAr: "الدفع الإلكتروني عبر Paymob",
    displayLabelEn: "Paymob online payment",
    instapayAccounts: [
      { id: "paymob", label: "Paymob", url: "", isDefault: true },
    ],
    electronicMethods: ["cards", "wallets"],
    cashOnDeliveryEnabled: true,
    cashOnDeliveryLabel: "الدفع عند الاستلام",
  },
  nutritionist: null,
  storeEnabled: true,
};

const RESPONSE_HEADERS = {
  "Cache-Control":
    "public, max-age=30, s-maxage=30, stale-while-revalidate=120",
} as const;

const cycleFromMembership = (cycle: string | null, days: number) =>
  cycle ??
  (days <= 31
    ? "monthly"
    : days <= 100
      ? "quarterly"
      : days <= 200
        ? "semi_annual"
        : "annual");

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

function normalizeOfferType(
  value: string | null | undefined,
): "percentage" | "fixed" | "special" {
  return value === "fixed" || value === "special" ? value : "percentage";
}

function parseSiteContentRecord<T>(
  records: Array<{ section: string; content: string }>,
  section: string,
  fallback: T,
): T {
  const record = records.find((item) => item.section === section);
  if (!record) return fallback;

  try {
    const parsed = JSON.parse(record.content);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      return {
        ...(fallback as Record<string, unknown>),
        ...(parsed as Record<string, unknown>),
      } as T;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
    const offerId = url.searchParams.get("offerId") || null;

    const cacheKey = offerId ? `${lang}:offer:${offerId}` : lang;
    const now = Date.now();
    const cached = getPublicApiCache(cacheKey);

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.payload, { headers: RESPONSE_HEADERS });
    }

    await ensureDefaultProductCategories();

    const scheduleNow = new Date();

    // Coach Membership eligibility is calendar-date based in Cairo,
    // matching the authoritative checkout attribution service.
    const coachMembershipDateKey = cairoCalendarDateKey(scheduleNow);

    const coachMembershipDateAnchor = new Date(
      `${coachMembershipDateKey}T00:00:00.000Z`,
    );

    const [
      categories,
      goals,
      memberships,
      offers,
      classes,
      trainers,
      siteContent,
      products,
      testimonials,
      healthQuestions,
      deliveryOptions,
      paymobSettings,
      nutritionistRow,
    ] = await Promise.all([
      db.productCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.clubGoal.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
      db.membership.findMany({
        where: visibleMembershipWhere(),
        include: { goals: { select: { goalId: true } } },
        orderBy: [{ sortOrder: "asc" }, { price: "asc" }],
      }),
      db.offer.findMany({
        where: activePublicOfferWhere(),
        orderBy: { expiresAt: "asc" },
        include: {
          allowedClassTypes: { select: { classType: true, classTypeId: true } },
          allowedClasses: { select: { classId: true } },
          friendOfferConfig: {
            select: {
              requiredMembers: true,
              inviteExpiryHours: true,
              isActive: true,
            },
          },
        },
      }),
      db.class.findMany({
        where: visibleClassScheduleWhere(scheduleNow),
        include: {
          trainer: true,
          schedules: {
            where: visibleScheduleWhere(scheduleNow),
            orderBy: [{ date: "asc" }, { time: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      }),
      db.trainer.findMany({
        where: visibleTrainerWhere(),
        include: {
          employee: {
            select: {
              id: true,
              employmentStatus: true,
              payrollEnabled: true,
              coachCompensationTerms: {
                where: {
                  effectiveFrom: {
                    lte: coachMembershipDateAnchor,
                  },
                  OR: [
                    {
                      effectiveTo: null,
                    },
                    {
                      effectiveTo: {
                        gte: coachMembershipDateAnchor,
                      },
                    },
                  ],
                },
                orderBy: {
                  effectiveFrom: "desc",
                },
                take: 1,
                select: {
                  id: true,
                },
              },
            },
          },
          _count: {
            select: {
              classes: true,
            },
          },
        },
        orderBy: [
          { showOnHome: "desc" },
          { sortOrder: "asc" },
          { name: "asc" },
        ],
      }),
      db.siteContent.findMany({
        where: {
          section: {
            in: [
              "trainersPage",
              "contact",
              "blog",
              "paymentSettings",
              "trial_class_settings",
              "store_settings",
              "trial_classes_config",
              "gift_only_products",
            ],
          },
        },
      }),
      db.product.findMany({
        where: visibleProductWhere(),
        include: {
          reviews: {
            select: {
              rating: true,
            },
          },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              size: true,
              color: true,
              sku: true,
              price: true,
              image: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ displayPriority: "desc" }, { createdAt: "desc" }],
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
      getPaymentSettings(),
      db.nutritionistProfile.findFirst({
        where: { isActive: true, showOnHome: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // Server-side filtering for special offers ONLY
    let filteredClasses = classes;
    if (offerId) {
      // Find the offer and validate it's a special offer
      const offer = offers.find((o) => o.id === offerId);

      if (!offer) {
        // Invalid or inactive offerId
        return NextResponse.json(
          { error: "Offer not found or inactive" },
          { status: 400, headers: RESPONSE_HEADERS },
        );
      }

      if (offer.type !== "special") {
        // Regular offers don't support schedule filtering via offerId
        return NextResponse.json(
          { error: "Schedule filtering is only supported for special offers" },
          { status: 400, headers: RESPONSE_HEADERS },
        );
      }

      // Filter for special offers
      const eligibleClasses = await getEligibleClassesForSource({
        type: "offer",
        id: offerId,
      });

      if (eligibleClasses.length === 0) {
        filteredClasses = [];
      } else {
        const eligibleIds = new Set(eligibleClasses.map((c) => c.id));
        filteredClasses = classes.filter((c) => eligibleIds.has(c.id));
      }
    }

    /*
     * CANONICAL CUSTOMER ELIGIBILITY CONTRACT
     *
     * Admin configuration may be stored historically in several forms
     * (exact Class IDs, stable ClassType IDs, legacy textual types).
     *
     * Only the authoritative resolver is allowed to interpret those forms.
     * The browser receives final Class IDs and never recreates business rules.
     */
    const membershipEligibilityEntries = await Promise.all(
      memberships.map(async (membership) => {
        const source =
          membership.kind === "trial"
            ? { type: "trial" as const, id: membership.id }
            : membership.kind === "package"
              ? { type: "package" as const, id: membership.id }
              : { type: "membership" as const, id: membership.id };

        const eligible = await getEligibleClassesForSource(source);

        return [
          membership.id,
          eligible.map((gymClass) => gymClass.id),
        ] as const;
      }),
    );

    const canonicalMembershipClassIds = new Map<string, string[]>(
      membershipEligibilityEntries,
    );

    const offerEligibilityEntries = await Promise.all(
      offers.map(async (offer) => {
        const eligible = await getEligibleClassesForSource({
          type: "offer",
          id: offer.id,
        });

        return [offer.id, eligible.map((gymClass) => gymClass.id)] as const;
      }),
    );

    const canonicalOfferClassIds = new Map<string, string[]>(
      offerEligibilityEntries,
    );

    const categoryMeta = new Map(
      categories.map((category) => [
        category.key,
        {
          label: category.label,
          labelEn: category.labelEn,
          sizeType: category.sizeType,
        },
      ]),
    );

    const contactRecord = parseSiteContentRecord(
      siteContent,
      "contact",
      EMPTY_PAYLOAD.contact,
    ) as PublicPayload["contact"] & {
      addressEn?: string;
      hoursEn?: string;
    };

    const storeSettings = parseSiteContentRecord(
      siteContent,
      "store_settings",
      { enabled: true },
    ) as { enabled?: boolean };
    const storeEnabled = storeSettings.enabled !== false;

    const giftOnlyRecord = parseSiteContentRecord(
      siteContent,
      "gift_only_products",
      { ids: [] },
    ) as { ids?: string[] };
    const giftOnlyIds = new Set(
      Array.isArray(giftOnlyRecord.ids) ? giftOnlyRecord.ids : [],
    );

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
        label:
          lang === "en" ? category.labelEn || category.label : category.label,
        labelEn: category.labelEn,
        sizeType: normalizeSizeType(category.sizeType),
        icon: category.icon ?? null,
      })),
      goals: goals.map((goal) => ({
        id: goal.id,
        name: lang === "en" ? goal.nameEn || goal.name : goal.name,
        slug: goal.slug,
        description:
          lang === "en"
            ? goal.descriptionEn || goal.description
            : goal.description,
        image: goal.image,
        kind: goal.kind,
        parentId: goal.parentId,
        sortOrder: goal.sortOrder,
      })),
      memberships: memberships
        .filter((membership) => membership.kind !== "trial")
        .map((membership) => ({
          id: membership.id,
          name:
            lang === "en"
              ? membership.nameEn || membership.name
              : membership.name,
          price: membership.price,
          priceBefore: membership.priceBefore ?? null,
          priceAfter: membership.priceAfter ?? null,
          image: membership.image ?? null,
          sortOrder: membership.sortOrder ?? 0,
          durationDays: membership.duration,
          cycle: cycleFromMembership(membership.cycle, membership.duration),
          sessionsCount: membership.sessionsCount ?? null,
          features:
            lang === "en"
              ? parseJsonArray(membership.featuresEn)
              : parseJsonArray(membership.features),
          walletBonus: membership.walletBonus,
          gift:
            lang === "en"
              ? membership.giftEn || membership.gift
              : membership.gift,
          subtitle: membership.subtitle ?? null,
          kind: membership.kind,
          isFeatured: membership.isFeatured ?? false,
          coachMembershipEnabled: membership.coachMembershipEnabled === true,
          goalIds: membership.goals.map((goal) => goal.goalId),
          minMonths: (membership as any).minMonths ?? null,
          maxMonths: (membership as any).maxMonths ?? null,
          discountPct: (membership as any).discountPct ?? null,
          // Kept temporarily for backwards-compatible payload consumers.
          // Customer purchase decisions use allowedClassIds only.
          classSessions: parseJsonArray(membership.classSessions),
          allowedClassIds: canonicalMembershipClassIds.get(membership.id) ?? [],
        })),
      trialMembership: (() => {
        const trial = memberships.find((m) => m.kind === "trial");
        if (!trial) return null;
        const trialSettings = parseSiteContentRecord(
          siteContent,
          "trial_class_settings",
          { enabled: true },
        );
        if ((trialSettings as { enabled?: boolean }).enabled === false)
          return null;
        return {
          id: trial.id,
          name: lang === "en" ? trial.nameEn || trial.name : trial.name,
          price: trial.price,
          sessionsCount: trial.sessionsCount ?? 1,
          features:
            lang === "en"
              ? parseJsonArray(trial.featuresEn)
              : parseJsonArray(trial.features),
          durationDays: trial.duration,
          allowedClassIds: canonicalMembershipClassIds.get(trial.id) ?? [],
        };
      })(),
      trialClassesConfig: (() => {
        const record = siteContent.find(
          (r) => r.section === "trial_classes_config",
        );
        if (!record) return {};
        try {
          return JSON.parse(record.content) as Record<
            string,
            { trialEnabled: boolean; trialPrice: number }
          >;
        } catch {
          return {};
        }
      })(),
      offers: offers.map((offer) => ({
        id: offer.id,
        title: lang === "en" ? offer.titleEn || offer.title : offer.title,
        type: normalizeOfferType(offer.type),
        discount: offer.discount,
        specialPrice: offer.specialPrice,
        description:
          lang === "en"
            ? offer.descriptionEn || offer.description || ""
            : offer.description || "",
        appliesTo:
          lang === "en"
            ? offer.appliesToEn || offer.appliesTo || ""
            : offer.appliesTo || "",
        membershipId: offer.membershipId,
        image: offer.image,
        showOnHome: offer.showOnHome,
        showMaxSubscribers: offer.showMaxSubscribers,
        showCurrentSubscribers: offer.showCurrentSubscribers,
        maxSubscribers: offer.maxSubscribers,
        currentSubscribers: offer.currentSubscribers,
        expiresAt: offer.expiresAt.toISOString(),
        durationDays: offer.durationDays ?? null,
        sessionsCount: offer.sessionsCount ?? null,
        priceBefore: offer.priceBefore ?? null,
        features:
          lang === "en"
            ? parseJsonArray(offer.featuresEn)
            : parseJsonArray(offer.features),
        allowedClassTypes: offer.allowedClassTypes.map(
          (item) => item.classType,
        ),
        allowedClassTypeIds: offer.allowedClassTypes
          .map((item) => item.classTypeId)
          .filter((id): id is string => Boolean(id)),
        allowedClassIds: canonicalOfferClassIds.get(offer.id) ?? [],
        friendOfferEnabled: offer.friendOfferConfig?.isActive === true,
        friendRequiredMembers: offer.friendOfferConfig?.requiredMembers ?? 2,
        friendInviteExpiryHours:
          offer.friendOfferConfig?.inviteExpiryHours ?? 24,
      })),
      classes: filteredClasses.map((gymClass) => ({
        id: gymClass.id,
        classTypeId: gymClass.classTypeId ?? null,
        name: lang === "en" ? gymClass.nameEn || gymClass.name : gymClass.name,
        description:
          lang === "en"
            ? gymClass.descriptionEn || gymClass.description || ""
            : gymClass.description || "",
        trainer:
          gymClass.showTrainerName === false || !gymClass.trainer
            ? ""
            : lang === "en"
              ? gymClass.trainer.nameEn || gymClass.trainer.name
              : gymClass.trainer.name,
        trainerImage: !gymClass.trainer
          ? null
          : (gymClass.trainer.image ?? null),
        trainerSpecialty:
          gymClass.showTrainerName === false || !gymClass.trainer
            ? ""
            : lang === "en"
              ? gymClass.trainer.specialtyEn || gymClass.trainer.specialty || ""
              : gymClass.trainer.specialty || "",
        duration:
          lang === "en"
            ? `${gymClass.duration} min`
            : `${gymClass.duration} دقيقة`,
        intensity: gymClass.intensity,
        category:
          lang === "en"
            ? gymClass.categoryEn || gymClass.category || null
            : gymClass.category || null,
        type: lang === "en" ? gymClass.typeEn || gymClass.type : gymClass.type,
        subType:
          lang === "en"
            ? gymClass.subTypeEn || gymClass.subType || null
            : gymClass.subType || null,
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
        name: lang === "en" ? trainer.nameEn || trainer.name : trainer.name,
        specialty:
          lang === "en"
            ? trainer.specialtyEn || trainer.specialty
            : trainer.specialty,
        bio: (() => {
          const b = lang === "en" ? trainer.bioEn || trainer.bio : trainer.bio;
          return b && b !== "null" ? b : "";
        })(),
        certifications:
          lang === "en"
            ? parseJsonArray(trainer.certificationsEn)
            : parseJsonArray(trainer.certifications),
        certificateFiles: parseStoredTrainerFileLinks(trainer.certificateFiles),
        rating: trainer.rating,
        sessionsCount: trainer.sessionsCount,
        image: trainer.image,
        showOnHome: trainer.showOnHome,
        sortOrder: trainer.sortOrder,
        classesCount: trainer._count.classes,

        // Keep the public trainer directory intact, but explicitly mark who
        // can participate in Coach Membership checkout.
        coachMembershipEligible:
          trainer.isActive === true &&
          trainer.employeeId != null &&
          trainer.employee != null &&
          trainer.employee.employmentStatus === "active" &&
          trainer.employee.payrollEnabled === true &&
          trainer.employee.coachCompensationTerms.length > 0,
      })),
      trainersPage: (() => {
        const content = parseSiteContentRecord<PublicPayload["trainersPage"]>(
          siteContent,
          "trainersPage",
          null,
        );
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
        const content = parseSiteContentRecord(
          siteContent,
          "blog",
          EMPTY_PAYLOAD.blog,
        );
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
              return {
                ...post,
                title: localizedPost.titleEn ?? post.title,
                category: localizedPost.categoryEn ?? post.category,
                author: localizedPost.authorEn ?? post.author,
                date: localizedPost.dateEn ?? post.date,
                readTime: localizedPost.readTimeEn ?? post.readTime,
                summary: localizedPost.summaryEn ?? post.summary,
                content: localizedPost.contentEn ?? post.content,
              };
            })
          : content.posts;
        return {
          categories: Array.isArray(typed.categoriesEn)
            ? typed.categoriesEn
            : content.categories,
          posts: Array.isArray(typed.postsEn) ? typed.postsEn : localizedPosts,
        };
      })(),
      products: storeEnabled
        ? await (async () => {
            const {
              getSaleableStockByProductIds,
              getSaleableStockForItems,
              getSaleableItemKey,
            } = await import("@/lib/saleable-stock-service");

            const visibleProducts = products.filter(
              (product) => !giftOnlyIds.has(product.id),
            );

            const saleable = await getSaleableStockByProductIds(
              visibleProducts.map((product) => product.id),
            );

            const variantSaleable = await getSaleableStockForItems(
              visibleProducts.flatMap((product) =>
                product.variants.map((variant) => ({
                  productId: product.id,
                  variantId: variant.id,
                })),
              ),
            );

            return visibleProducts.map((product) => {
              const category = categoryMeta.get(product.category);
              const reviewCount = product.reviews.length;
              const rating =
                reviewCount > 0
                  ? product.reviews.reduce(
                      (sum, review) => sum + review.rating,
                      0,
                    ) / reviewCount
                  : 0;

              return {
                id: product.id,
                name:
                  lang === "en" ? product.nameEn || product.name : product.name,
                price: product.price,
                oldPrice: product.oldPrice,
                vatEnabled: product.vatEnabled,
                category: product.category,
                categoryLabel:
                  lang === "en"
                    ? category?.labelEn || category?.label || product.category
                    : category?.label || product.category,
                sizeType: normalizeSizeType(category?.sizeType),
                description:
                  lang === "en"
                    ? product.descriptionEn || product.description || ""
                    : product.description || "",
                images: parseJsonArray(product.images),
                sizes: parseJsonArray(product.sizes),
                colors: parseJsonArray(product.colors),
                variants: product.variants.map((variant) => ({
                  id: variant.id,
                  size: variant.size,
                  color: variant.color,
                  sku: variant.sku,
                  price: variant.price,
                  image: variant.image,
                  stock:
                    variantSaleable.get(
                      getSaleableItemKey(product.id, variant.id),
                    )?.trackInventory === false
                      ? 1
                      : (variantSaleable.get(
                          getSaleableItemKey(product.id, variant.id),
                        )?.totalAvailable ?? 0),
                })),
                faqs: parseJsonArray(product.faqs),
                whoShouldBuy: parseJsonArray(product.whoShouldBuy),
                importantInfo: product.importantInfo ?? null,
                disclaimer: product.disclaimer ?? null,
                editorialReview: product.editorialReview ?? null,
                unitLabel: product.unitLabel ?? null,
                rating,
                reviewCount,
                stock:
                  saleable.get(product.id)?.trackInventory === false
                    ? 1
                    : (saleable.get(product.id)?.totalAvailable ?? 0),
              };
            });
          })()
        : [],
      testimonials: testimonials.map((testimonial) => {
        const name =
          testimonial.displayName ||
          testimonial.user.name ||
          (lang === "en" ? "Fit Zone client" : "عميلة فيت زون");

        return {
          id: testimonial.id,
          displayName: lang === "en" ? testimonial.displayNameEn || name : name,
          displayNameEn: testimonial.displayNameEn,
          content:
            lang === "en"
              ? testimonial.contentEn || testimonial.content
              : testimonial.content,
          contentEn: testimonial.contentEn,
          rating: testimonial.rating,
          createdAt: testimonial.createdAt.toISOString(),
          user: {
            name: lang === "en" ? testimonial.displayNameEn || name : name,
          },
        };
      }),
      healthQuestions: healthQuestions.map((question) => ({
        id: question.id,
        title:
          lang === "en" ? question.titleEn || question.title : question.title,
        prompt:
          lang === "en"
            ? question.promptEn || question.prompt
            : question.prompt,
        sortOrder: question.sortOrder,
        allowReason: question.allowReason,
        restrictedClassTypes: question.restrictions.map(
          (item) => item.classType,
        ),
      })),
      deliveryOptions: deliveryOptions.map((option) => ({
        id: option.id,
        name: lang === "en" ? option.nameEn || option.name : option.name,
        type: option.type,
        description:
          lang === "en"
            ? option.descriptionEn || option.description || ""
            : option.description || "",
        fee: option.fee,
        estimatedDaysMin: option.estimatedDaysMin,
        estimatedDaysMax: option.estimatedDaysMax,
        showCashOnDelivery: option.showCashOnDelivery,
        sortOrder: option.sortOrder,
      })),
      paymentSettings: {
        displayLabel:
          lang === "en"
            ? paymobSettings.displayLabelEn
            : paymobSettings.displayLabelAr,
        displayLabelAr: paymobSettings.displayLabelAr,
        displayLabelEn: paymobSettings.displayLabelEn,
        instapayAccounts: [
          {
            id: "paymob",
            label:
              lang === "en"
                ? paymobSettings.displayLabelEn
                : paymobSettings.displayLabelAr,
            url: "",
            isDefault: true,
          },
        ],
        electronicMethods: [
          ...(paymobSettings.enableCards ? ["cards"] : []),
          ...(paymobSettings.enableWallets ? ["wallets"] : []),
          ...(paymobSettings.enableValu ? ["valu"] : []),
          ...(paymobSettings.enableSympl ? ["sympl"] : []),
          ...(paymobSettings.enableSouhoola ? ["souhoola"] : []),
        ],
        cashOnDeliveryEnabled:
          paymobSettings.enableCod && paymobSettings.cashOnDeliveryEnabled,
        cashOnDeliveryLabel:
          lang === "en"
            ? paymobSettings.cashOnDeliveryLabelEn
            : paymobSettings.cashOnDeliveryLabelAr,
      },
      nutritionist: nutritionistRow
        ? {
            id: nutritionistRow.id,
            name: nutritionistRow.name,
            bio: nutritionistRow.bio,
            image: nutritionistRow.image,
            slots: nutritionistRow.slotsJson
              ? (JSON.parse(nutritionistRow.slotsJson) as {
                  label: string;
                  day: string;
                  time: string;
                }[])
              : [],
            questions: (nutritionistRow as any).questionsJson
              ? JSON.parse((nutritionistRow as any).questionsJson)
              : [],
            consultationFee: nutritionistRow.consultationFee,
            consultationFeeMember: nutritionistRow.consultationFeeMember,
            followupFee: nutritionistRow.followupFee,
            followupFeeMember: nutritionistRow.followupFeeMember,
          }
        : null,
      storeEnabled,
    };

    setPublicApiCache(cacheKey, {
      expiresAt: now + 30_000,
      payload,
    });

    return NextResponse.json(payload, { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[PUBLIC_API]", error);
    return NextResponse.json(EMPTY_PAYLOAD, { headers: RESPONSE_HEADERS });
  }
}
