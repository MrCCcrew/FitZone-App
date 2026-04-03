import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

function slugifyGoal(value: string) {
  const ascii = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return ascii || `goal-${Date.now()}`;
}

function mapGoal(goal: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  kind: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
}) {
  return {
    id: goal.id,
    name: goal.name,
    slug: goal.slug,
    description: goal.description,
    image: goal.image,
    kind: goal.kind,
    parentId: goal.parentId,
    sortOrder: goal.sortOrder,
    active: goal.isActive,
  };
}

export async function GET() {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const goals = await db.clubGoal.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      parent: { select: { id: true, name: true } },
      _count: {
        select: {
          children: true,
          programGoals: true,
          enrollments: true,
        },
      },
    },
  });

  return NextResponse.json(
    goals.map((goal) => ({
      ...mapGoal(goal),
      parent: goal.parent ? { id: goal.parent.id, name: goal.parent.name } : null,
      childrenCount: goal._count.children,
      linkedProgramsCount: goal._count.programGoals,
      enrollmentsCount: goal._count.enrollments,
    })),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    name?: string;
    slug?: string;
    description?: string | null;
    image?: string | null;
    kind?: string;
    parentId?: string | null;
    sortOrder?: number;
    active?: boolean;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "اسم الهدف مطلوب." }, { status: 400 });
  }

  const slug = (body.slug?.trim() || slugifyGoal(name)).toLowerCase();
  const existing = await db.clubGoal.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "يوجد هدف آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  if (body.parentId) {
    const parent = await db.clubGoal.findUnique({ where: { id: body.parentId } });
    if (!parent) {
      return NextResponse.json({ error: "الهدف الأب غير موجود." }, { status: 400 });
    }
  }

  const created = await db.clubGoal.create({
    data: {
      name,
      slug,
      description: body.description?.trim() || null,
      image: body.image?.trim() || null,
      kind: body.kind?.trim() || "standard",
      parentId: body.parentId?.trim() || null,
      sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
      isActive: body.active ?? true,
    },
  });

  return NextResponse.json(mapGoal(created));
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    slug?: string;
    description?: string | null;
    image?: string | null;
    kind?: string;
    parentId?: string | null;
    sortOrder?: number;
    active?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "معرف الهدف مطلوب." }, { status: 400 });
  }

  const current = await db.clubGoal.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ error: "الهدف غير موجود." }, { status: 404 });
  }

  const nextSlug = body.slug?.trim()
    ? body.slug.trim().toLowerCase()
    : body.name?.trim()
      ? slugifyGoal(body.name.trim()).toLowerCase()
      : current.slug;

  const slugOwner = await db.clubGoal.findFirst({
    where: { slug: nextSlug, NOT: { id: body.id } },
    select: { id: true },
  });
  if (slugOwner) {
    return NextResponse.json({ error: "يوجد هدف آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  if (body.parentId) {
    if (body.parentId === body.id) {
      return NextResponse.json({ error: "لا يمكن جعل الهدف تابعًا لنفسه." }, { status: 400 });
    }
    const parent = await db.clubGoal.findUnique({ where: { id: body.parentId } });
    if (!parent) {
      return NextResponse.json({ error: "الهدف الأب غير موجود." }, { status: 400 });
    }
  }

  const updated = await db.clubGoal.update({
    where: { id: body.id },
    data: {
      name: body.name?.trim() ?? undefined,
      slug: nextSlug,
      description: body.description === undefined ? undefined : body.description?.trim() || null,
      image: body.image === undefined ? undefined : body.image?.trim() || null,
      kind: body.kind?.trim() ?? undefined,
      parentId: body.parentId === undefined ? undefined : body.parentId?.trim() || null,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isActive: body.active,
    },
  });

  return NextResponse.json(mapGoal(updated));
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "معرف الهدف مطلوب." }, { status: 400 });
  }

  const linkedPrograms = await db.programGoal.count({ where: { goalId: body.id } });
  const linkedEnrollments = await db.programEnrollment.count({ where: { sourceGoalId: body.id } });

  if (linkedPrograms > 0 || linkedEnrollments > 0) {
    return NextResponse.json(
      { error: "لا يمكن حذف الهدف لأنه مرتبط ببرامج أو طلبات اشتراك." },
      { status: 400 },
    );
  }

  await db.clubGoal.delete({ where: { id: body.id } });
  return NextResponse.json({ success: true });
}
