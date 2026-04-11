import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

function mapQuestion(question: {
  id: string;
  title: string;
  titleEn: string | null;
  slug: string;
  prompt: string;
  promptEn: string | null;
  isActive: boolean;
  sortOrder: number;
}) {
  return {
    id: question.id,
    title: question.title,
    titleEn: question.titleEn,
    slug: question.slug,
    prompt: question.prompt,
    promptEn: question.promptEn,
    active: question.isActive,
    sortOrder: question.sortOrder,
  };
}

function slugifyQuestion(value: string) {
  const ascii = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return ascii || `health-question-${Date.now()}`;
}

export async function GET() {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const questions = await db.healthQuestion.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      restrictions: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(
    questions.map((question) => ({
      ...mapQuestion(question),
      restrictedClassTypes: question.restrictions.map((item) => item.classType),
      restrictions: question.restrictions.map((item) => ({
        id: item.id,
        classType: item.classType,
        notes: item.notes,
      })),
    })),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    title?: string;
    titleEn?: string;
    slug?: string;
    prompt?: string;
    promptEn?: string;
    active?: boolean;
    sortOrder?: number;
    restrictions?: Array<{ classType: string; notes?: string | null }>;
  };

  const title = body.title?.trim();
  const prompt = body.prompt?.trim();
  if (!title || !prompt) {
    return NextResponse.json({ error: "عنوان السؤال ونصه مطلوبان." }, { status: 400 });
  }

  const slug = (body.slug?.trim() || slugifyQuestion(title)).toLowerCase();
  const exists = await db.healthQuestion.findUnique({ where: { slug } });
  if (exists) {
    return NextResponse.json({ error: "يوجد سؤال آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  const restrictions = Array.isArray(body.restrictions)
    ? body.restrictions.filter((item) => item.classType?.trim())
    : [];

  const created = await db.healthQuestion.create({
    data: {
      title,
      titleEn: body.titleEn?.trim() || null,
      slug,
      prompt,
      promptEn: body.promptEn?.trim() || null,
      isActive: body.active ?? true,
      sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
      restrictions: restrictions.length
        ? {
            create: restrictions.map((item) => ({
              classType: item.classType.trim(),
              notes: item.notes?.trim() || null,
            })),
          }
        : undefined,
    },
    include: { restrictions: true },
  });

  clearPublicApiCache();
  return NextResponse.json({
    ...mapQuestion(created),
    restrictedClassTypes: created.restrictions.map((item) => item.classType),
    restrictions: created.restrictions.map((item) => ({
      id: item.id,
      classType: item.classType,
      notes: item.notes,
    })),
  });
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    id?: string;
    title?: string;
    titleEn?: string;
    slug?: string;
    prompt?: string;
    promptEn?: string;
    active?: boolean;
    sortOrder?: number;
    restrictions?: Array<{ classType: string; notes?: string | null }>;
  };

  if (!body.id) {
    return NextResponse.json({ error: "معرّف السؤال مطلوب." }, { status: 400 });
  }

  const current = await db.healthQuestion.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ error: "السؤال غير موجود." }, { status: 404 });
  }

  const nextSlug = body.slug?.trim()
    ? body.slug.trim().toLowerCase()
    : body.title?.trim()
      ? slugifyQuestion(body.title.trim()).toLowerCase()
      : current.slug;

  const owner = await db.healthQuestion.findFirst({
    where: { slug: nextSlug, NOT: { id: body.id } },
    select: { id: true },
  });
  if (owner) {
    return NextResponse.json({ error: "يوجد سؤال آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  const restrictions = Array.isArray(body.restrictions)
    ? body.restrictions.filter((item) => item.classType?.trim())
    : null;

  const updated = await db.$transaction(async (tx) => {
    const question = await tx.healthQuestion.update({
      where: { id: body.id! },
      data: {
        title: body.title?.trim() ?? undefined,
        titleEn: body.titleEn === undefined ? undefined : body.titleEn?.trim() || null,
        slug: nextSlug,
        prompt: body.prompt?.trim() ?? undefined,
        promptEn: body.promptEn === undefined ? undefined : body.promptEn?.trim() || null,
        isActive: body.active,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      },
    });

    if (restrictions) {
      await tx.healthQuestionRestriction.deleteMany({ where: { questionId: body.id! } });
      if (restrictions.length) {
        await tx.healthQuestionRestriction.createMany({
          data: restrictions.map((item) => ({
            questionId: body.id!,
            classType: item.classType.trim(),
            notes: item.notes?.trim() || null,
          })),
        });
      }
    }

    return question;
  });

  clearPublicApiCache();
  const refreshed = await db.healthQuestion.findUniqueOrThrow({
    where: { id: updated.id },
    include: { restrictions: true },
  });

  return NextResponse.json({
    ...mapQuestion(refreshed),
    restrictedClassTypes: refreshed.restrictions.map((item) => item.classType),
    restrictions: refreshed.restrictions.map((item) => ({
      id: item.id,
      classType: item.classType,
      notes: item.notes,
    })),
  });
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "معرّف السؤال مطلوب." }, { status: 400 });
  }

  await db.healthQuestion.delete({ where: { id: body.id } });
  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
