import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseStoredTrainerFileLinks, parseStoredTrainerTextList } from "@/lib/trainer-profile";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const trainer = await db.trainer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      nameEn: true,
      specialty: true,
      specialtyEn: true,
      bio: true,
      bioEn: true,
      certifications: true,
      certificationsEn: true,
      certificateFiles: true,
      rating: true,
      sessionsCount: true,
      image: true,
      isActive: true,
      _count: { select: { classes: true } },
    },
  });

  if (!trainer || !trainer.isActive)
    return NextResponse.json({ error: "المدربة غير موجودة." }, { status: 404 });

  return NextResponse.json({
    id: trainer.id,
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
  });
}
