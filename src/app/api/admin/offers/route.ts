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

  return NextResponse.json(offers.map(mapOffer));
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

    const created = await db.offer.create({
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
        specialPrice: body.specialPrice != null && body.specialPrice !== "" ? Number(body.specialPrice) : null,
        maxSubscribers: body.maxSubscribers != null && body.maxSubscribers !== "" ? Number(body.maxSubscribers) : null,
        currentSubscribers: Number(body.currentSubscribers ?? 0),
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

    void logAudit({ action: "create", targetType: "offer", targetId: created.id, details: { title: created.title } });
    clearPublicApiCache();
    return NextResponse.json(mapOffer(created));
  } catch (error) {
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
      select: { type: true },
    });
    if (!current) {
      return NextResponse.json({ error: "العرض غير موجود." }, { status: 404 });
    }

    const currentType = normalizeOfferType(current.type);
    const newType = body.type !== undefined ? normalizeOfferType(String(body.type)) : currentType;

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
    if (body.discount !== undefined) data.discount = Number(body.discount ?? 0);
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn ? String(body.descriptionEn).trim() : null;
    if (body.appliesTo !== undefined) data.appliesTo = body.appliesTo ? String(body.appliesTo).trim() : null;
    if (body.appliesToEn !== undefined) data.appliesToEn = body.appliesToEn ? String(body.appliesToEn).trim() : null;
    if (body.validUntil !== undefined) data.expiresAt = new Date(String(body.validUntil));
    if (body.active !== undefined) data.isActive = Boolean(body.active);
    if (body.membershipId !== undefined) data.membershipId = body.membershipId || null;
    if (body.specialPrice !== undefined) {
      data.specialPrice = body.specialPrice != null && body.specialPrice !== "" ? Number(body.specialPrice) : null;
    }
    if (body.maxSubscribers !== undefined) {
      data.maxSubscribers = body.maxSubscribers != null && body.maxSubscribers !== "" ? Number(body.maxSubscribers) : null;
    }
    if (body.currentSubscribers !== undefined) data.currentSubscribers = Number(body.currentSubscribers ?? 0);
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

    const updated = await db.offer.update({
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

    void logAudit({ action: "update", targetType: "offer", targetId: id, details: { title: updated.title, changes: Object.keys(data) } });
    clearPublicApiCache();
    return NextResponse.json(mapOffer(updated));
  } catch (error) {
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
