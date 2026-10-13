import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";
import { logAudit } from "@/lib/audit-context";
import { deleteOfferAndLinkedClientData } from "@/lib/admin-linked-cleanup";

async function checkAdmin() {
  const guard = await requireAdminFeature("offers");
  return "error" in guard ? guard.error : null;
}

function toDateString(value: Date) {
  return value.toISOString().slice(0, 16);
}

function normalizeOfferType(value: string | null | undefined): "percentage" | "fixed" | "special" {
  return value === "fixed" || value === "special" ? value : "percentage";
}

function normalizeAllowedClassTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}
type OfferAgeRule = {
  requiresBirthDate: boolean;
  minAgeYears: number | null;
  maxAgeYears: number | null;
};

const DEFAULT_OFFER_AGE_RULE: OfferAgeRule = {
  requiresBirthDate: false,
  minAgeYears: null,
  maxAgeYears: null,
};

class OfferAgeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfferAgeRuleError";
  }
}

function normalizeAgeValue(
  value: unknown,
  fieldLabel: string,
): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);

  if (
    !Number.isInteger(numeric) ||
    numeric < 0 ||
    numeric > 120
  ) {
    throw new OfferAgeRuleError(
      `${fieldLabel} must be an integer from 0 to 120.`,
    );
  }

  return numeric;
}

function resolveOfferAgeRule(
  body: Record<string, unknown>,
  current: OfferAgeRule = DEFAULT_OFFER_AGE_RULE,
): OfferAgeRule {
  const requiresBirthDate =
    body.requiresBirthDate !== undefined
      ? body.requiresBirthDate === true
      : current.requiresBirthDate;

  if (!requiresBirthDate) {
    return {
      requiresBirthDate: false,
      minAgeYears: null,
      maxAgeYears: null,
    };
  }

  const minAgeYears =
    body.minAgeYears !== undefined
      ? normalizeAgeValue(
          body.minAgeYears,
          "Minimum age",
        )
      : current.minAgeYears;

  const maxAgeYears =
    body.maxAgeYears !== undefined
      ? normalizeAgeValue(
          body.maxAgeYears,
          "Maximum age",
        )
      : current.maxAgeYears;

  if (
    minAgeYears != null &&
    maxAgeYears != null &&
    minAgeYears > maxAgeYears
  ) {
    throw new OfferAgeRuleError(
      "Minimum age cannot be greater than maximum age.",
    );
  }

  return {
    requiresBirthDate: true,
    minAgeYears,
    maxAgeYears,
  };
}

function normalizeOfferAgeRow(
  row:
    | {
        requiresBirthDate: boolean | number;
        minAgeYears: number | null;
        maxAgeYears: number | null;
      }
    | undefined,
): OfferAgeRule {
  if (!row) return DEFAULT_OFFER_AGE_RULE;

  return {
    requiresBirthDate:
      row.requiresBirthDate === true ||
      Number(row.requiresBirthDate) === 1,
    minAgeYears: row.minAgeYears ?? null,
    maxAgeYears: row.maxAgeYears ?? null,
  };
}


function mapOffer(
  offer: {
    id: string;
    title: string;
    titleEn: string | null;
    discount: number;
    type: string;
    appliesTo: string | null;
    appliesToEn: string | null;
    membershipId: string | null;
    expiresAt: Date;
    isActive: boolean;
    description: string | null;
    descriptionEn: string | null;
    specialPrice: number | null;
    maxSubscribers: number | null;
    currentSubscribers: number;
    offerBoxEnabled?: boolean | number;
    offerBoxApplyDiscount?: boolean | number;
    image: string | null;
    showOnHome: boolean;
    showMaxSubscribers: boolean;
    showCurrentSubscribers: boolean;
    sessionsCount?: number | null;
    durationDays?: number | null;
    priceBefore?: number | null;
    features?: string | null;
    featuresEn?: string | null;
    allowedClassTypes?: Array<{ classType: string; classTypeId: string | null }>;
    allowedClasses?: Array<{ classId: string }>;
    membership?: { name: string } | null;
    friendOfferConfig?: {
      requiredMembers: number;
      inviteExpiryHours: number;
      isActive: boolean;
    } | null;
  },
  ageRule: OfferAgeRule = DEFAULT_OFFER_AGE_RULE,
) {
  const parseFeatures = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  };
  return {
    id: offer.id,
    title: offer.title,
    titleEn: offer.titleEn ?? "",
    discount: offer.discount,
    type: normalizeOfferType(offer.type),
    appliesTo: offer.appliesTo ?? offer.membership?.name ?? "جميع الاشتراكات",
    appliesToEn: offer.appliesToEn ?? "",
    membershipId: offer.membershipId,
    validUntil: toDateString(offer.expiresAt),
    active: offer.isActive,
    usedCount: offer.currentSubscribers,
    description: offer.description ?? "",
    descriptionEn: offer.descriptionEn ?? "",
    specialPrice: offer.specialPrice,
    maxSubscribers: offer.maxSubscribers,
    currentSubscribers: offer.currentSubscribers,
    offerBoxEnabled:
      offer.offerBoxEnabled === true ||
      Number(offer.offerBoxEnabled) === 1,
    offerBoxApplyDiscount:
      offer.offerBoxApplyDiscount === true ||
      Number(offer.offerBoxApplyDiscount) === 1,
    image: offer.image,
    showOnHome: offer.showOnHome,
    showMaxSubscribers: offer.showMaxSubscribers,
    showCurrentSubscribers: offer.showCurrentSubscribers,
    sessionsCount: offer.sessionsCount ?? null,
    durationDays: offer.durationDays ?? null,
    priceBefore: offer.priceBefore ?? null,
    features: parseFeatures(offer.features),
    featuresEn: parseFeatures(offer.featuresEn),
    allowedClassTypes: offer.allowedClassTypes?.map((item) => item.classType) ?? [],
    allowedClassTypeIds: offer.allowedClassTypes
      ?.map((item) => item.classTypeId)
      .filter((id): id is string => Boolean(id)) ?? [],
    allowedClassIds: offer.allowedClasses?.map((item) => item.classId) ?? [],
    friendOfferEnabled: offer.friendOfferConfig?.isActive === true,
    friendRequiredMembers: offer.friendOfferConfig?.requiredMembers ?? 2,
    friendInviteExpiryHours: offer.friendOfferConfig?.inviteExpiryHours ?? 24,
    requiresBirthDate: ageRule.requiresBirthDate,
    minAgeYears: ageRule.minAgeYears,
    maxAgeYears: ageRule.maxAgeYears,
  };
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  const offers = await db.offer.findMany({
    include: {
      membership: { select: { name: true } },
      allowedClassTypes: { select: { classType: true, classTypeId: true } },
      allowedClasses: { select: { classId: true } }, // NEW
      friendOfferConfig: {
        select: {
          requiredMembers: true,
          inviteExpiryHours: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ showOnHome: "desc" }, { expiresAt: "asc" }],
  });

  const ageRows =
    await db.$queryRaw<
      Array<{
        id: string;
        requiresBirthDate: boolean | number;
        minAgeYears: number | null;
        maxAgeYears: number | null;
      }>
    >`
      SELECT
        id,
        requiresBirthDate,
        minAgeYears,
        maxAgeYears
      FROM Offer
    `;

  const ageByOfferId =
    new Map<string, OfferAgeRule>(
      ageRows.map((row) => [
        row.id,
        normalizeOfferAgeRow(row),
      ]),
    );

  return NextResponse.json(
    offers.map((offer) =>
      mapOffer(
        offer,
        ageByOfferId.get(offer.id) ??
          DEFAULT_OFFER_AGE_RULE,
      ),
    ),
  );
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const body = await req.json();
    const type = normalizeOfferType(typeof body.type === "string" ? body.type : "percentage");
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const validUntil = typeof body.validUntil === "string" ? body.validUntil : "";

    if (!title || !validUntil) {
      return NextResponse.json({ error: "يرجى إدخال عنوان العرض ووقت انتهائه." }, { status: 400 });
    }

    const friendOfferEnabled = body.friendOfferEnabled === true;
    const friendRequiredMembers = Number(body.friendRequiredMembers ?? 2);
    const friendInviteExpiryHours = Number(body.friendInviteExpiryHours ?? 24);
    const offerBoxEnabled = body.offerBoxEnabled === true;
    const offerBoxApplyDiscount = body.offerBoxApplyDiscount === true;
    const offerDiscount = Number(body.discount ?? 0);
    if (offerBoxApplyDiscount && (
      !offerBoxEnabled ||
      type === "special" ||
      !body.membershipId ||
      !Number.isFinite(offerDiscount) ||
      offerDiscount <= 0 ||
      (type === "percentage" && offerDiscount >= 100)
    )) {
      return NextResponse.json({ error: "لتفعيل الخصم الإضافي اختاري عرض نسبة أو مبلغ صالحًا مرتبطًا باشتراك داخل Offer Box." }, { status: 400 });
    }

    if (friendOfferEnabled && type !== "special") {
      return NextResponse.json(
        { error: "عرض الصحاب يجب أن يكون من نوع عرض خاص." },
        { status: 400 },
      );
    }

    if (
      friendOfferEnabled &&
      (!Number.isInteger(friendRequiredMembers) || friendRequiredMembers < 2)
    ) {
      return NextResponse.json(
        { error: "عدد مشتركات عرض الصحاب يجب أن يكون 2 على الأقل." },
        { status: 400 },
      );
    }

    if (
      friendOfferEnabled &&
      (!Number.isInteger(friendInviteExpiryHours) ||
        friendInviteExpiryHours < 1)
    ) {
      return NextResponse.json(
        { error: "صلاحية رابط الدعوة يجب أن تكون ساعة واحدة على الأقل." },
        { status: 400 },
      );
    }

    if (type === "special" && (body.specialPrice == null || Number(body.specialPrice) <= 0)) {
      return NextResponse.json({ error: "أدخلي قيمة الاشتراك الخاصة بالعرض." }, { status: 400 });
    }

    const ageRule = resolveOfferAgeRule(body);

    const allowedClassIds = normalizeAllowedClassTypes(body.allowedClassIds);
    if (allowedClassIds.length > 0) {
      const found = await db.class.findMany({
        where: { id: { in: allowedClassIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((row) => row.id));
      const missing = allowedClassIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { error: "يوجد كلاس محدد غير موجود." },
          { status: 400 },
        );
      }
    }

    const created = await db.$transaction(async (tx) => {
      const created = await tx.offer.create({
      data: {
        title,
        titleEn: typeof body.titleEn === "string" ? body.titleEn.trim() : "",
        type,
        discount: Number(body.discount ?? 0),
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        descriptionEn: typeof body.descriptionEn === "string" ? body.descriptionEn.trim() || null : null,
        appliesTo: typeof body.appliesTo === "string" ? body.appliesTo.trim() || null : null,
        appliesToEn: typeof body.appliesToEn === "string" ? body.appliesToEn.trim() || null : null,
        expiresAt: new Date(validUntil),
        isActive: body.active !== false,
        membershipId: body.membershipId || null,
        specialPrice: type === "special" && body.specialPrice != null && body.specialPrice !== "" ? Number(body.specialPrice) : null,
        maxSubscribers: body.maxSubscribers != null && body.maxSubscribers !== "" ? Number(body.maxSubscribers) : null,
        currentSubscribers: Number(body.currentSubscribers ?? 0),
        offerBoxEnabled,
        offerBoxApplyDiscount,
        image: typeof body.image === "string" && body.image.trim() ? body.image.trim() : null,
        showOnHome: Boolean(body.showOnHome),
        showMaxSubscribers: body.showMaxSubscribers !== false,
        showCurrentSubscribers: body.showCurrentSubscribers !== false,
        sessionsCount: body.sessionsCount != null && body.sessionsCount !== "" ? Number(body.sessionsCount) : null,
        durationDays: body.durationDays != null && body.durationDays !== "" ? Number(body.durationDays) : null,
        priceBefore: body.priceBefore != null && body.priceBefore !== "" ? Number(body.priceBefore) : null,
        features: Array.isArray(body.features) && body.features.length > 0 ? JSON.stringify(body.features) : null,
        featuresEn: Array.isArray(body.featuresEn) && body.featuresEn.length > 0 ? JSON.stringify(body.featuresEn) : null,
        // Exact classes are authoritative for every offer type.
        allowedClasses: allowedClassIds.length > 0
          ? { create: allowedClassIds.map((classId) => ({ classId })) }
          : undefined,
        friendOfferConfig: friendOfferEnabled
          ? {
              create: {
                requiredMembers: friendRequiredMembers,
                inviteExpiryHours: friendInviteExpiryHours,
                isActive: true,
              },
            }
          : undefined,
      },
      include: {
        membership: { select: { name: true } },
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
      });

      await tx.$executeRaw`
        UPDATE Offer
        SET
          requiresBirthDate = ${ageRule.requiresBirthDate},
          minAgeYears = ${ageRule.minAgeYears},
          maxAgeYears = ${ageRule.maxAgeYears}
        WHERE id = ${created.id}
      `;

      return created;
    });


    void logAudit({ action: "create", targetType: "offer", targetId: created.id, details: { title: created.title } });
    clearPublicApiCache();
    return NextResponse.json(mapOffer(created, ageRule));
  } catch (error) {
    if (error instanceof OfferAgeRuleError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    console.error("[ADMIN_OFFERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ العرض حالياً." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "معرف العرض مطلوب." }, { status: 400 });
    }

    // Get current offer type
    const current = await db.offer.findUnique({
      where: { id },
      select: { type: true, discount: true, membershipId: true, offerBoxEnabled: true, offerBoxApplyDiscount: true },
    });
    if (!current) {
      return NextResponse.json({ error: "العرض غير موجود." }, { status: 404 });
    }

    const currentAgeRows =
      await db.$queryRaw<
        Array<{
          requiresBirthDate: boolean | number;
          minAgeYears: number | null;
          maxAgeYears: number | null;
        }>
      >`
        SELECT
          requiresBirthDate,
          minAgeYears,
          maxAgeYears
        FROM Offer
        WHERE id = ${id}
        LIMIT 1
      `;

    const currentAgeRule =
      normalizeOfferAgeRow(currentAgeRows[0]);

    const agePatchRequested =
      body.requiresBirthDate !== undefined ||
      body.minAgeYears !== undefined ||
      body.maxAgeYears !== undefined;

    const ageRule =
      agePatchRequested
        ? resolveOfferAgeRule(
            body,
            currentAgeRule,
          )
        : currentAgeRule;

    const currentType = normalizeOfferType(current.type);
    const newType = body.type !== undefined ? normalizeOfferType(String(body.type)) : currentType;
    const effectiveDiscount = body.discount !== undefined ? Number(body.discount) : current.discount;
    const effectiveMembershipId = body.membershipId !== undefined ? body.membershipId : current.membershipId;
    const effectiveBoxEnabled = body.offerBoxEnabled !== undefined ? body.offerBoxEnabled === true : current.offerBoxEnabled;
    // A type switch to "special" clears the previous opt-in.
    const effectiveApplyDiscount = newType === "special" || !effectiveBoxEnabled ? false
      : body.offerBoxApplyDiscount !== undefined ? body.offerBoxApplyDiscount === true : current.offerBoxApplyDiscount;
    if (effectiveApplyDiscount && (
      !effectiveBoxEnabled ||
      !effectiveMembershipId ||
      !Number.isFinite(effectiveDiscount) ||
      effectiveDiscount <= 0 ||
      (newType === "percentage" && effectiveDiscount >= 100)
    )) {
      return NextResponse.json({ error: "إعدادات الخصم الإضافي لـOffer Box غير صالحة." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (body.friendOfferEnabled !== undefined) {
      const friendOfferEnabled = body.friendOfferEnabled === true;
      const friendRequiredMembers = Number(body.friendRequiredMembers ?? 2);
      const friendInviteExpiryHours = Number(
        body.friendInviteExpiryHours ?? 24,
      );

      if (friendOfferEnabled && newType !== "special") {
        return NextResponse.json(
          { error: "عرض الصحاب يجب أن يكون من نوع عرض خاص." },
          { status: 400 },
        );
      }

      if (
        friendOfferEnabled &&
        (!Number.isInteger(friendRequiredMembers) || friendRequiredMembers < 2)
      ) {
        return NextResponse.json(
          { error: "عدد مشتركات عرض الصحاب يجب أن يكون 2 على الأقل." },
          { status: 400 },
        );
      }

      if (
        friendOfferEnabled &&
        (!Number.isInteger(friendInviteExpiryHours) ||
          friendInviteExpiryHours < 1)
      ) {
        return NextResponse.json(
          { error: "صلاحية رابط الدعوة يجب أن تكون ساعة واحدة على الأقل." },
          { status: 400 },
        );
      }

      data.friendOfferConfig = {
        upsert: {
          create: {
            requiredMembers: friendRequiredMembers,
            inviteExpiryHours: friendInviteExpiryHours,
            isActive: friendOfferEnabled,
          },
          update: {
            requiredMembers: friendRequiredMembers,
            inviteExpiryHours: friendInviteExpiryHours,
            isActive: friendOfferEnabled,
          },
        },
      };
    }

    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.titleEn !== undefined) data.titleEn = String(body.titleEn).trim() || null;
    if (body.type !== undefined) data.type = newType;
    if (body.offerBoxApplyDiscount !== undefined ||
        (body.type !== undefined && newType === "special") ||
        (body.offerBoxEnabled !== undefined && !effectiveBoxEnabled)) {
      data.offerBoxApplyDiscount = effectiveApplyDiscount;
    }
    if (body.discount !== undefined) data.discount = Number(body.discount ?? 0);
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn ? String(body.descriptionEn).trim() : null;
    if (body.appliesTo !== undefined) data.appliesTo = body.appliesTo ? String(body.appliesTo).trim() : null;
    if (body.appliesToEn !== undefined) data.appliesToEn = body.appliesToEn ? String(body.appliesToEn).trim() : null;
    if (body.validUntil !== undefined) data.expiresAt = new Date(String(body.validUntil));
    if (body.active !== undefined) data.isActive = Boolean(body.active);
    if (body.membershipId !== undefined) data.membershipId = body.membershipId || null;
    if (body.specialPrice !== undefined) {
      data.specialPrice = newType === "special" && body.specialPrice != null && body.specialPrice !== "" ? Number(body.specialPrice) : null;
    } else if (body.type !== undefined && newType !== "special") {
      data.specialPrice = null;
    }
    if (body.maxSubscribers !== undefined) {
      data.maxSubscribers = body.maxSubscribers != null && body.maxSubscribers !== "" ? Number(body.maxSubscribers) : null;
    }
    if (body.currentSubscribers !== undefined) data.currentSubscribers = Number(body.currentSubscribers ?? 0);
    if (body.offerBoxEnabled !== undefined) data.offerBoxEnabled = body.offerBoxEnabled === true;
    if (body.image !== undefined) data.image = body.image ? String(body.image).trim() : null;
    if (body.showOnHome !== undefined) data.showOnHome = Boolean(body.showOnHome);
    if (body.showMaxSubscribers !== undefined) data.showMaxSubscribers = Boolean(body.showMaxSubscribers);
    if (body.showCurrentSubscribers !== undefined) data.showCurrentSubscribers = Boolean(body.showCurrentSubscribers);
    if (body.sessionsCount !== undefined) {
      data.sessionsCount = body.sessionsCount != null && body.sessionsCount !== "" ? Number(body.sessionsCount) : null;
    }
    if (body.durationDays !== undefined) {
      data.durationDays = body.durationDays != null && body.durationDays !== "" ? Number(body.durationDays) : null;
    }
    if (body.priceBefore !== undefined) {
      data.priceBefore = body.priceBefore != null && body.priceBefore !== "" ? Number(body.priceBefore) : null;
    }
    if (body.features !== undefined) {
      data.features = Array.isArray(body.features) && body.features.length > 0 ? JSON.stringify(body.features) : null;
    }
    if (body.featuresEn !== undefined) {
      data.featuresEn = Array.isArray(body.featuresEn) && body.featuresEn.length > 0 ? JSON.stringify(body.featuresEn) : null;
    }

    // Exact Class IDs are the authoritative configuration for all offers.
    if (body.allowedClassIds !== undefined) {
      const allowedClassIds = normalizeAllowedClassTypes(body.allowedClassIds);
      if (allowedClassIds.length > 0) {
        const found = await db.class.findMany({
          where: { id: { in: allowedClassIds } },
          select: { id: true },
        });
        const foundIds = new Set(found.map((row) => row.id));
        const missing = allowedClassIds.filter((classId) => !foundIds.has(classId));
        if (missing.length > 0) {
          return NextResponse.json(
            { error: "يوجد كلاس محدد غير موجود." },
            { status: 400 },
          );
        }
      }

      data.allowedClasses = {
        deleteMany: {},
        create: allowedClassIds.map((classId) => ({ classId })),
      };
    }

    const updated = await db.$transaction(async (tx) => {
      const updated = await tx.offer.update({
      where: { id },
      data,
      include: {
        membership: { select: { name: true } },
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
      });

      if (agePatchRequested) {
        await tx.$executeRaw`
          UPDATE Offer
          SET
            requiresBirthDate = ${ageRule.requiresBirthDate},
            minAgeYears = ${ageRule.minAgeYears},
            maxAgeYears = ${ageRule.maxAgeYears}
          WHERE id = ${id}
        `;
      }

      return updated;
    });


    void logAudit({ action: "update", targetType: "offer", targetId: id, details: { title: updated.title, changes: Object.keys(data) } });
    clearPublicApiCache();
    return NextResponse.json(mapOffer(updated, ageRule));
  } catch (error) {
    if (error instanceof OfferAgeRuleError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    console.error("[ADMIN_OFFERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العرض حالياً." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "معرف العرض مطلوب." }, { status: 400 });
    }

    const existing = await db.offer.findUnique({
      where: { id },
      select: { title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "العرض غير موجود." }, { status: 404 });
    }

    const cleanup = await db.$transaction((tx) => deleteOfferAndLinkedClientData(tx, id));
    void logAudit({
      action: "delete",
      targetType: "offer",
      targetId: id,
      details: {
        title: existing.title,
        deletedMemberships: cleanup.deletedMemberships,
        deletedBookings: cleanup.deletedBookings,
      },
    });
    clearPublicApiCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_OFFERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف العرض حالياً." }, { status: 500 });
  }
}
