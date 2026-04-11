import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

function parseCertifications(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseStoredCertifications(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function formatTrainer(trainer: {
  id: string;
  name: string;
  nameEn: string | null;
  specialty: string;
  specialtyEn: string | null;
  bio: string | null;
  bioEn: string | null;
  certifications: string | null;
  certificationsEn: string | null;
  rating: number;
  sessionsCount: number;
  image: string | null;
  isActive: boolean;
  showOnHome: boolean;
  sortOrder: number;
  _count: { classes: number };
}) {
  return {
    id: trainer.id,
    name: trainer.name,
    nameEn: trainer.nameEn,
    specialty: trainer.specialty,
    specialtyEn: trainer.specialtyEn,
    bio: trainer.bio,
    bioEn: trainer.bioEn,
    certifications: parseStoredCertifications(trainer.certifications),
    certificationsEn: parseStoredCertifications(trainer.certificationsEn),
    rating: trainer.rating,
    sessionsCount: trainer.sessionsCount,
    image: trainer.image,
    classesCount: trainer._count.classes,
    active: trainer.isActive,
    showOnHome: trainer.showOnHome,
    sortOrder: trainer.sortOrder,
  };
}

async function guard() {
  const allowed = await requireAdminFeature("trainers");
  return "error" in allowed ? allowed.error : null;
}

export async function GET() {
  const error = await guard();
  if (error) return error;

  const trainers = await db.trainer.findMany({
    include: { _count: { select: { classes: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(trainers.map(formatTrainer));
}

export async function POST(req: Request) {
  const error = await guard();
  if (error) return error;

  try {
    const body = await req.json();

    if (!body.name?.trim() || !body.specialty?.trim()) {
      return NextResponse.json({ error: "اسم المدربة والتخصص مطلوبان." }, { status: 400 });
    }

    const trainer = await db.trainer.create({
      data: {
        name: body.name.trim(),
        nameEn: body.nameEn?.trim() || null,
        specialty: body.specialty.trim(),
        specialtyEn: body.specialtyEn?.trim() || null,
        bio: body.bio?.trim() || null,
        bioEn: body.bioEn?.trim() || null,
        certifications: JSON.stringify(parseCertifications(body.certifications)),
        certificationsEn: JSON.stringify(parseCertifications(body.certificationsEn)),
        rating: Number(body.rating ?? 5) || 5,
        sessionsCount: Number(body.sessionsCount ?? 0) || 0,
        image: body.image?.trim() || null,
        isActive: body.active !== false,
        showOnHome: body.showOnHome !== false,
        sortOrder: Number(body.sortOrder ?? 0) || 0,
      },
      include: { _count: { select: { classes: true } } },
    });

    clearPublicApiCache();
    return NextResponse.json(formatTrainer(trainer));
  } catch (error) {
    console.error("[ADMIN_TRAINERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ بيانات المدربة الآن." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const error = await guard();
  if (error) return error;

  try {
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "معرّف المدربة مطلوب." }, { status: 400 });
    }

    const trainer = await db.trainer.update({
      where: { id: body.id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.nameEn !== undefined ? { nameEn: String(body.nameEn).trim() || null } : {}),
        ...(body.specialty !== undefined ? { specialty: String(body.specialty).trim() } : {}),
        ...(body.specialtyEn !== undefined ? { specialtyEn: String(body.specialtyEn).trim() || null } : {}),
        ...(body.bio !== undefined ? { bio: String(body.bio).trim() || null } : {}),
        ...(body.bioEn !== undefined ? { bioEn: String(body.bioEn).trim() || null } : {}),
        ...(body.certifications !== undefined
          ? { certifications: JSON.stringify(parseCertifications(body.certifications)) }
          : {}),
        ...(body.certificationsEn !== undefined
          ? { certificationsEn: JSON.stringify(parseCertifications(body.certificationsEn)) }
          : {}),
        ...(body.rating !== undefined ? { rating: Number(body.rating) || 0 } : {}),
        ...(body.sessionsCount !== undefined ? { sessionsCount: Number(body.sessionsCount) || 0 } : {}),
        ...(body.image !== undefined ? { image: String(body.image).trim() || null } : {}),
        ...(body.active !== undefined ? { isActive: Boolean(body.active) } : {}),
        ...(body.showOnHome !== undefined ? { showOnHome: Boolean(body.showOnHome) } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: Number(body.sortOrder) || 0 } : {}),
      },
      include: { _count: { select: { classes: true } } },
    });

    clearPublicApiCache();
    return NextResponse.json(formatTrainer(trainer));
  } catch (error) {
    console.error("[ADMIN_TRAINERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث بيانات المدربة الآن." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const error = await guard();
  if (error) return error;

  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "معرّف المدربة مطلوب." }, { status: 400 });
    }

    await db.trainer.delete({ where: { id } });
    clearPublicApiCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_TRAINERS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المدربة الآن." }, { status: 500 });
  }
}
