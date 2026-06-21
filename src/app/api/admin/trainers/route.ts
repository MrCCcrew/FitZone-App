import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";
import { logAudit } from "@/lib/audit-context";
import {
  parseStoredTrainerFileLinks,
  parseStoredTrainerTextList,
  parseTrainerTextList,
  serializeTrainerFileLinks,
} from "@/lib/trainer-profile";

const MAX_TRAINER_BIO_LENGTH = 191;

function formatTrainer(trainer: {
  id: string;
  userId: string | null;
  name: string;
  nameEn: string | null;
  specialty: string;
  specialtyEn: string | null;
  bio: string | null;
  bioEn: string | null;
  certifications: string | null;
  certificationsEn: string | null;
  certificateFiles: string | null;
  rating: number;
  sessionsCount: number;
  image: string | null;
  isActive: boolean;
  showOnHome: boolean;
  sortOrder: number;
  canSendGifts: boolean;
  giftMonthlyLimit: number;
  canAddClasses: boolean;
  canAddBookings: boolean;
  _count: { classes: number };
  user: { id: string; name: string | null; email: string | null; discountType: string; discountValue: number; maxDiscount: number | null } | null;
}) {
  return {
    id: trainer.id,
    userId: trainer.userId,
    name: trainer.name,
    nameEn: trainer.nameEn,
    specialty: trainer.specialty,
    specialtyEn: trainer.specialtyEn,
    bio: trainer.bio,
    bioEn: trainer.bioEn,
    certifications: parseStoredTrainerTextList(trainer.certifications),
    certificationsEn: parseStoredTrainerTextList(trainer.certificationsEn),
    certificateFiles: parseStoredTrainerFileLinks(trainer.certificateFiles),
    rating: trainer.rating,
    sessionsCount: trainer.sessionsCount,
    image: trainer.image,
    classesCount: trainer._count.classes,
    active: trainer.isActive,
    showOnHome: trainer.showOnHome,
    sortOrder: trainer.sortOrder,
    canSendGifts: trainer.canSendGifts,
    giftMonthlyLimit: trainer.giftMonthlyLimit,
    canAddClasses: trainer.canAddClasses,
    canAddBookings: trainer.canAddBookings,
    linkedUser: trainer.user
      ? {
          id: trainer.user.id,
          name: trainer.user.name ?? "",
          email: trainer.user.email ?? "",
          discountType: trainer.user.discountType,
          discountValue: trainer.user.discountValue,
          maxDiscount: trainer.user.maxDiscount,
        }
      : null,
  };
}

async function guard() {
  const allowed = await requireAdminFeature("trainers");
  return "error" in allowed
    ? { error: allowed.error, role: null, userId: null }
    : { error: null, role: allowed.role, userId: allowed.session.user.id };
}

async function getOwnTrainerId(userId: string): Promise<string | null> {
  const t = await db.trainer.findFirst({ where: { userId }, select: { id: true } });
  return t?.id ?? null;
}

export async function GET() {
  const { error, role, userId } = await guard();
  if (error) return error;

  // Trainers can only view their own record
  if (role === "trainer") {
    const trainerId = await getOwnTrainerId(userId!);
    if (!trainerId) return NextResponse.json([]);
    const trainer = await db.trainer.findUnique({
      where: { id: trainerId },
      include: {
        _count: { select: { classes: true } },
        user: { select: { id: true, name: true, email: true, discountType: true, discountValue: true, maxDiscount: true } },
      },
    });
    return NextResponse.json(trainer ? [formatTrainer(trainer)] : []);
  }

  const trainers = await db.trainer.findMany({
    include: {
      _count: { select: { classes: true } },
      user: { select: { id: true, name: true, email: true, discountType: true, discountValue: true, maxDiscount: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(trainers.map(formatTrainer));
}

export async function POST(req: Request) {
  const { error, role } = await guard();
  if (error) return error;
  if (role === "trainer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();

    if (!body.name?.trim() || !body.specialty?.trim()) {
      return NextResponse.json({ error: "اسم المدربة والتخصص مطلوبان." }, { status: 400 });
    }

    if (body.bio && String(body.bio).trim().length > MAX_TRAINER_BIO_LENGTH) {
      return NextResponse.json(
        { error: `نبذة المدربة طويلة جداً (الحد الأقصى ${MAX_TRAINER_BIO_LENGTH} حرفاً). يُرجى تقصير النص والمحاولة مجدداً.` },
        { status: 400 },
      );
    }

    const trainer = await db.trainer.create({
      data: {
        name: body.name.trim(),
        nameEn: body.nameEn?.trim() || null,
        specialty: body.specialty.trim(),
        specialtyEn: body.specialtyEn?.trim() || null,
        bio: body.bio?.trim() || null,
        bioEn: body.bioEn?.trim() || null,
        certifications: JSON.stringify(parseTrainerTextList(body.certifications)),
        certificationsEn: JSON.stringify(parseTrainerTextList(body.certificationsEn)),
        certificateFiles: serializeTrainerFileLinks(body.certificateFiles),
        rating: Number(body.rating ?? 5) || 5,
        sessionsCount: Number(body.sessionsCount ?? 0) || 0,
        image: body.image?.trim() || null,
        isActive: body.active !== false,
        showOnHome: body.showOnHome !== false,
        sortOrder: Number(body.sortOrder ?? 0) || 0,
        userId: body.userId?.trim() || null,
        canSendGifts: Boolean(body.canSendGifts ?? false),
        giftMonthlyLimit: Math.max(0, Number(body.giftMonthlyLimit ?? 4) || 4),
        canAddClasses: Boolean(body.canAddClasses ?? false),
        canAddBookings: Boolean(body.canAddBookings ?? false),
      },
      include: {
        _count: { select: { classes: true } },
        user: { select: { id: true, name: true, email: true, discountType: true, discountValue: true, maxDiscount: true } },
      },
    });

    clearPublicApiCache();
    void logAudit({ action: "create", targetType: "trainer", targetId: trainer.id, details: { name: trainer.name } });
    return NextResponse.json(formatTrainer(trainer));
  } catch (error) {
    console.error("[ADMIN_TRAINERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ بيانات المدربة الآن." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { error, role, userId } = await guard();
  if (error) return error;

  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "معرّف المدربة مطلوب." }, { status: 400 });
    }

    if (body.bio && String(body.bio).trim().length > MAX_TRAINER_BIO_LENGTH) {
      return NextResponse.json(
        { error: `نبذة المدربة طويلة جداً (الحد الأقصى ${MAX_TRAINER_BIO_LENGTH} حرفاً). يُرجى تقصير النص والمحاولة مجدداً.` },
        { status: 400 },
      );
    }

    // Trainers can only edit their own profile
    if (role === "trainer") {
      const ownId = await getOwnTrainerId(userId!);
      if (body.id !== ownId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Determine which fields are allowed based on role
    const isTrainer = role === "trainer";

    const trainer = await db.trainer.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.nameEn !== undefined ? { nameEn: body.nameEn ? String(body.nameEn).trim() || null : null } : {}),
        ...(body.specialty !== undefined ? { specialty: String(body.specialty).trim() } : {}),
        ...(body.specialtyEn !== undefined ? { specialtyEn: body.specialtyEn ? String(body.specialtyEn).trim() || null : null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio ? String(body.bio).trim() || null : null } : {}),
        ...(body.bioEn !== undefined ? { bioEn: body.bioEn ? String(body.bioEn).trim() || null : null } : {}),
        ...(body.certifications !== undefined
          ? { certifications: JSON.stringify(parseTrainerTextList(body.certifications)) }
          : {}),
        ...(body.certificationsEn !== undefined
          ? { certificationsEn: JSON.stringify(parseTrainerTextList(body.certificationsEn)) }
          : {}),
        ...(body.certificateFiles !== undefined
          ? { certificateFiles: serializeTrainerFileLinks(body.certificateFiles) }
          : {}),
        ...(body.rating !== undefined ? { rating: Number(body.rating) || 0 } : {}),
        ...(body.sessionsCount !== undefined ? { sessionsCount: Number(body.sessionsCount) || 0 } : {}),
        ...(body.image !== undefined ? { image: String(body.image).trim() || null } : {}),
        ...(!isTrainer && body.active !== undefined ? { isActive: Boolean(body.active) } : {}),
        ...(!isTrainer && body.showOnHome !== undefined ? { showOnHome: Boolean(body.showOnHome) } : {}),
        ...(!isTrainer && body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) || 0 } : {}),
        ...(!isTrainer && body.userId !== undefined ? { userId: body.userId ? String(body.userId).trim() || null : null } : {}),
        ...(!isTrainer && body.canSendGifts !== undefined ? { canSendGifts: Boolean(body.canSendGifts) } : {}),
        ...(!isTrainer && body.giftMonthlyLimit !== undefined ? { giftMonthlyLimit: Math.max(0, Number(body.giftMonthlyLimit) || 0) } : {}),
        ...(!isTrainer && body.canAddClasses !== undefined ? { canAddClasses: Boolean(body.canAddClasses) } : {}),
        ...(!isTrainer && body.canAddBookings !== undefined ? { canAddBookings: Boolean(body.canAddBookings) } : {}),
      },
      include: {
        _count: { select: { classes: true } },
        user: { select: { id: true, name: true, email: true, discountType: true, discountValue: true, maxDiscount: true } },
      },
    });

    clearPublicApiCache();
    void logAudit({ action: "update", targetType: "trainer", targetId: trainer.id, details: { name: trainer.name } });
    return NextResponse.json(formatTrainer(trainer));
  } catch (error) {
    console.error("[ADMIN_TRAINERS_PATCH]", error);
    // Unique constraint on userId — another trainer already linked to this account
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique constraint") || msg.includes("P2002")) {
      return NextResponse.json(
        { error: "هذا الحساب مرتبط بمدربة أخرى بالفعل. يرجى اختيار حساب مختلف أو إلغاء الربط من المدربة الأخرى أولاً." },
        { status: 409 },
      );
    }
    if (msg.includes("Foreign key constraint") || msg.includes("foreign key constraint") || msg.includes("P2003")) {
      return NextResponse.json(
        { error: "الحساب المختار غير موجود في النظام. يرجى اختيار حساب صحيح أو ترك حقل الربط فارغًا." },
        { status: 400 },
      );
    }
    if (msg.includes("P2000") || msg.includes("Value too long") || msg.includes("value too long")) {
      return NextResponse.json(
        { error: "نبذة المدربة طويلة جداً. يُرجى تقصيرها والمحاولة مجدداً." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "تعذر تحديث بيانات المدربة الآن.", detail: msg || undefined },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const { error, role } = await guard();
  if (error) return error;
  if (role === "trainer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "معرّف المدربة مطلوب." }, { status: 400 });
    }

    await db.trainer.delete({ where: { id } });
    clearPublicApiCache();
    void logAudit({ action: "delete", targetType: "trainer", targetId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_TRAINERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المدربة الآن." }, { status: 500 });
  }
}
