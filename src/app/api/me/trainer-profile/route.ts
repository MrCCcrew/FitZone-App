import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import {
  parseStoredTrainerFileLinks,
  parseStoredTrainerTextList,
  parseTrainerTextList,
  serializeTrainerFileLinks,
} from "@/lib/trainer-profile";
import { clearPublicApiCache } from "@/lib/public-cache";

async function getTrainerForCurrentUser() {
  const session = await getCurrentAppUser();
  if (!session) {
    return { error: NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 }) };
  }

  const trainer = await db.trainer.findFirst({
    where: { userId: session.id },
    select: {
      id: true,
      userId: true,
      name: true,
      nameEn: true,
      specialty: true,
      specialtyEn: true,
      bio: true,
      bioEn: true,
      certifications: true,
      certificationsEn: true,
      certificateFiles: true,
      image: true,
      isActive: true,
      showOnHome: true,
      sortOrder: true,
      rating: true,
      sessionsCount: true,
    },
  });

  if (!trainer) {
    return { error: NextResponse.json({ error: "لا يوجد ملف مدربة مرتبط بهذا الحساب." }, { status: 404 }) };
  }

  return { session, trainer };
}

export async function GET() {
  const result = await getTrainerForCurrentUser();
  if ("error" in result) return result.error;

  const { trainer } = result;
  return NextResponse.json({
    trainer: {
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
      image: trainer.image,
      active: trainer.isActive,
      showOnHome: trainer.showOnHome,
      sortOrder: trainer.sortOrder,
      rating: trainer.rating,
      sessionsCount: trainer.sessionsCount,
    },
  });
}

export async function PATCH(req: Request) {
  const result = await getTrainerForCurrentUser();
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.nameEn !== undefined) data.nameEn = body.nameEn ? String(body.nameEn).trim() || null : null;
  if (body.specialty !== undefined) data.specialty = String(body.specialty).trim();
  if (body.specialtyEn !== undefined) data.specialtyEn = body.specialtyEn ? String(body.specialtyEn).trim() || null : null;
  if (body.bio !== undefined) data.bio = body.bio ? String(body.bio).trim() || null : null;
  if (body.bioEn !== undefined) data.bioEn = body.bioEn ? String(body.bioEn).trim() || null : null;
  if (body.certifications !== undefined) data.certifications = JSON.stringify(parseTrainerTextList(body.certifications));
  if (body.certificationsEn !== undefined) data.certificationsEn = JSON.stringify(parseTrainerTextList(body.certificationsEn));
  if (body.certificateFiles !== undefined) data.certificateFiles = serializeTrainerFileLinks(body.certificateFiles);
  if (body.image !== undefined) data.image = String(body.image).trim() || null;

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "لا توجد بيانات للتحديث." }, { status: 400 });
  }

  if (typeof data.name === "string" && data.name) {
    await db.user.update({
      where: { id: result.session.id },
      data: { name: data.name },
    });
  }

  await db.trainer.update({
    where: { id: result.trainer.id },
    data,
  });

  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
