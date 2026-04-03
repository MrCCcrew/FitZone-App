import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

function slugifyProgram(value: string) {
  const ascii = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return ascii || `program-${Date.now()}`;
}

function parseFeatures(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function mapProgram(program: {
  id: string;
  title: string;
  slug: string;
  type: string;
  audience: string;
  billingCycle: string | null;
  sessionsCount: number | null;
  durationDays: number | null;
  validityDays: number | null;
  basePrice: number;
  salePrice: number | null;
  compareAtPrice: number | null;
  classSessionPrice: number | null;
  description: string | null;
  image: string | null;
  isActive: boolean;
  showOnHome: boolean;
  sortOrder: number;
  surveyEnabled: boolean;
  scheduleManagedByAdmin: boolean;
  features: string | null;
}) {
  return {
    id: program.id,
    title: program.title,
    slug: program.slug,
    type: program.type,
    audience: program.audience,
    billingCycle: program.billingCycle,
    sessionsCount: program.sessionsCount,
    durationDays: program.durationDays,
    validityDays: program.validityDays,
    basePrice: program.basePrice,
    salePrice: program.salePrice,
    compareAtPrice: program.compareAtPrice,
    classSessionPrice: program.classSessionPrice,
    description: program.description,
    image: program.image,
    active: program.isActive,
    showOnHome: program.showOnHome,
    sortOrder: program.sortOrder,
    surveyEnabled: program.surveyEnabled,
    scheduleManagedByAdmin: program.scheduleManagedByAdmin,
    features: parseFeatures(program.features),
  };
}

export async function GET() {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const programs = await db.program.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      goalMappings: {
        include: {
          goal: {
            select: { id: true, name: true, slug: true, kind: true },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      },
      consumables: {
        include: {
          product: { select: { id: true, name: true, stock: true } },
        },
      },
      schedules: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: {
          enrollments: true,
          offers: true,
        },
      },
    },
  });

  return NextResponse.json(
    programs.map((program) => ({
      ...mapProgram(program),
      goals: program.goalMappings.map((mapping) => ({
        id: mapping.goal.id,
        name: mapping.goal.name,
        slug: mapping.goal.slug,
        kind: mapping.goal.kind,
        isPrimary: mapping.isPrimary,
        sortOrder: mapping.sortOrder,
      })),
      consumables: program.consumables.map((consumable) => ({
        id: consumable.id,
        productId: consumable.productId,
        productName: consumable.product.name,
        quantity: consumable.quantity,
        notes: consumable.notes,
        stock: consumable.product.stock,
      })),
      schedules: program.schedules.map((schedule) => ({
        id: schedule.id,
        label: schedule.label,
        audience: schedule.audience,
        timetableJson: schedule.timetableJson,
        notes: schedule.notes,
        isDefault: schedule.isDefault,
        active: schedule.isActive,
        sortOrder: schedule.sortOrder,
      })),
      enrollmentsCount: program._count.enrollments,
      offersCount: program._count.offers,
    })),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    title?: string;
    slug?: string;
    type?: string;
    audience?: string;
    billingCycle?: string | null;
    sessionsCount?: number | null;
    durationDays?: number | null;
    validityDays?: number | null;
    basePrice?: number;
    salePrice?: number | null;
    compareAtPrice?: number | null;
    classSessionPrice?: number | null;
    description?: string | null;
    image?: string | null;
    active?: boolean;
    showOnHome?: boolean;
    sortOrder?: number;
    surveyEnabled?: boolean;
    scheduleManagedByAdmin?: boolean;
    features?: unknown;
    goalMappings?: Array<{ goalId: string; isPrimary?: boolean; sortOrder?: number }>;
    consumables?: Array<{ productId: string; quantity: number; notes?: string | null }>;
    schedules?: Array<{
      label: string;
      audience?: string | null;
      timetableJson: string;
      notes?: string | null;
      isDefault?: boolean;
      active?: boolean;
      sortOrder?: number;
    }>;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "اسم البرنامج أو الباقة مطلوب." }, { status: 400 });
  }
  if (!body.type?.trim()) {
    return NextResponse.json({ error: "نوع البرنامج مطلوب." }, { status: 400 });
  }
  if (body.basePrice == null || Number(body.basePrice) < 0) {
    return NextResponse.json({ error: "السعر الأساسي مطلوب." }, { status: 400 });
  }

  const slug = (body.slug?.trim() || slugifyProgram(title)).toLowerCase();
  const existing = await db.program.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "يوجد برنامج آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  const goalMappings = Array.isArray(body.goalMappings) ? body.goalMappings.filter((item) => item.goalId) : [];
  const consumables = Array.isArray(body.consumables) ? body.consumables.filter((item) => item.productId && item.quantity > 0) : [];
  const schedules = Array.isArray(body.schedules)
    ? body.schedules.filter((item) => item.label?.trim() && item.timetableJson?.trim())
    : [];

  const created = await db.program.create({
    data: {
      title,
      slug,
      type: body.type.trim(),
      audience: body.audience?.trim() || "women",
      billingCycle: body.billingCycle?.trim() || null,
      sessionsCount: body.sessionsCount == null ? null : Number(body.sessionsCount),
      durationDays: body.durationDays == null ? null : Number(body.durationDays),
      validityDays: body.validityDays == null ? null : Number(body.validityDays),
      basePrice: Number(body.basePrice),
      salePrice: body.salePrice == null ? null : Number(body.salePrice),
      compareAtPrice: body.compareAtPrice == null ? null : Number(body.compareAtPrice),
      classSessionPrice: body.classSessionPrice == null ? null : Number(body.classSessionPrice),
      description: body.description?.trim() || null,
      image: body.image?.trim() || null,
      isActive: body.active ?? true,
      showOnHome: body.showOnHome ?? false,
      sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
      surveyEnabled: body.surveyEnabled ?? true,
      scheduleManagedByAdmin: body.scheduleManagedByAdmin ?? true,
      features: JSON.stringify(body.features ?? []),
      goalMappings: goalMappings.length
        ? {
            create: goalMappings.map((mapping, index) => ({
              goalId: mapping.goalId,
              isPrimary: mapping.isPrimary ?? index === 0,
              sortOrder: mapping.sortOrder ?? index,
            })),
          }
        : undefined,
      consumables: consumables.length
        ? {
            create: consumables.map((item) => ({
              productId: item.productId,
              quantity: Number(item.quantity),
              notes: item.notes?.trim() || null,
            })),
          }
        : undefined,
      schedules: schedules.length
        ? {
            create: schedules.map((item, index) => ({
              label: item.label.trim(),
              audience: item.audience?.trim() || null,
              timetableJson: item.timetableJson.trim(),
              notes: item.notes?.trim() || null,
              isDefault: item.isDefault ?? index === 0,
              isActive: item.active ?? true,
              sortOrder: item.sortOrder ?? index,
            })),
          }
        : undefined,
    },
    include: {
      goalMappings: { include: { goal: true } },
      consumables: { include: { product: true } },
      schedules: true,
    },
  });

  return NextResponse.json({
    ...mapProgram(created),
    goals: created.goalMappings.map((mapping) => ({
      id: mapping.goal.id,
      name: mapping.goal.name,
      slug: mapping.goal.slug,
      kind: mapping.goal.kind,
      isPrimary: mapping.isPrimary,
      sortOrder: mapping.sortOrder,
    })),
    consumables: created.consumables.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      notes: item.notes,
      stock: item.product.stock,
    })),
    schedules: created.schedules.map((schedule) => ({
      id: schedule.id,
      label: schedule.label,
      audience: schedule.audience,
      timetableJson: schedule.timetableJson,
      notes: schedule.notes,
      isDefault: schedule.isDefault,
      active: schedule.isActive,
      sortOrder: schedule.sortOrder,
    })),
  });
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    id?: string;
    title?: string;
    slug?: string;
    type?: string;
    audience?: string;
    billingCycle?: string | null;
    sessionsCount?: number | null;
    durationDays?: number | null;
    validityDays?: number | null;
    basePrice?: number;
    salePrice?: number | null;
    compareAtPrice?: number | null;
    classSessionPrice?: number | null;
    description?: string | null;
    image?: string | null;
    active?: boolean;
    showOnHome?: boolean;
    sortOrder?: number;
    surveyEnabled?: boolean;
    scheduleManagedByAdmin?: boolean;
    features?: unknown;
    goalMappings?: Array<{ goalId: string; isPrimary?: boolean; sortOrder?: number }>;
    consumables?: Array<{ productId: string; quantity: number; notes?: string | null }>;
    schedules?: Array<{
      id?: string;
      label: string;
      audience?: string | null;
      timetableJson: string;
      notes?: string | null;
      isDefault?: boolean;
      active?: boolean;
      sortOrder?: number;
    }>;
  };

  if (!body.id) {
    return NextResponse.json({ error: "معرف البرنامج مطلوب." }, { status: 400 });
  }

  const current = await db.program.findUnique({ where: { id: body.id } });
  if (!current) {
    return NextResponse.json({ error: "البرنامج غير موجود." }, { status: 404 });
  }

  const nextSlug = body.slug?.trim()
    ? body.slug.trim().toLowerCase()
    : body.title?.trim()
      ? slugifyProgram(body.title.trim()).toLowerCase()
      : current.slug;

  const slugOwner = await db.program.findFirst({
    where: { slug: nextSlug, NOT: { id: body.id } },
    select: { id: true },
  });
  if (slugOwner) {
    return NextResponse.json({ error: "يوجد برنامج آخر بنفس الرابط المختصر." }, { status: 400 });
  }

  const goalMappings = Array.isArray(body.goalMappings) ? body.goalMappings.filter((item) => item.goalId) : null;
  const consumables = Array.isArray(body.consumables) ? body.consumables.filter((item) => item.productId && item.quantity > 0) : null;
  const schedules = Array.isArray(body.schedules)
    ? body.schedules.filter((item) => item.label?.trim() && item.timetableJson?.trim())
    : null;

  const updated = await db.$transaction(async (tx) => {
    const program = await tx.program.update({
      where: { id: body.id! },
      data: {
        title: body.title?.trim() ?? undefined,
        slug: nextSlug,
        type: body.type?.trim() ?? undefined,
        audience: body.audience?.trim() ?? undefined,
        billingCycle: body.billingCycle === undefined ? undefined : body.billingCycle?.trim() || null,
        sessionsCount: body.sessionsCount === undefined ? undefined : body.sessionsCount == null ? null : Number(body.sessionsCount),
        durationDays: body.durationDays === undefined ? undefined : body.durationDays == null ? null : Number(body.durationDays),
        validityDays: body.validityDays === undefined ? undefined : body.validityDays == null ? null : Number(body.validityDays),
        basePrice: body.basePrice === undefined ? undefined : Number(body.basePrice),
        salePrice: body.salePrice === undefined ? undefined : body.salePrice == null ? null : Number(body.salePrice),
        compareAtPrice: body.compareAtPrice === undefined ? undefined : body.compareAtPrice == null ? null : Number(body.compareAtPrice),
        classSessionPrice: body.classSessionPrice === undefined ? undefined : body.classSessionPrice == null ? null : Number(body.classSessionPrice),
        description: body.description === undefined ? undefined : body.description?.trim() || null,
        image: body.image === undefined ? undefined : body.image?.trim() || null,
        isActive: body.active,
        showOnHome: body.showOnHome,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        surveyEnabled: body.surveyEnabled,
        scheduleManagedByAdmin: body.scheduleManagedByAdmin,
        features: body.features === undefined ? undefined : JSON.stringify(body.features ?? []),
      },
    });

    if (goalMappings) {
      await tx.programGoal.deleteMany({ where: { programId: body.id! } });
      if (goalMappings.length) {
        await tx.programGoal.createMany({
          data: goalMappings.map((mapping, index) => ({
            programId: body.id!,
            goalId: mapping.goalId,
            isPrimary: mapping.isPrimary ?? index === 0,
            sortOrder: mapping.sortOrder ?? index,
          })),
        });
      }
    }

    if (consumables) {
      await tx.programConsumable.deleteMany({ where: { programId: body.id! } });
      if (consumables.length) {
        await tx.programConsumable.createMany({
          data: consumables.map((item) => ({
            programId: body.id!,
            productId: item.productId,
            quantity: Number(item.quantity),
            notes: item.notes?.trim() || null,
          })),
        });
      }
    }

    if (schedules) {
      await tx.programSchedule.deleteMany({ where: { programId: body.id! } });
      if (schedules.length) {
        await tx.programSchedule.createMany({
          data: schedules.map((item, index) => ({
            programId: body.id!,
            label: item.label.trim(),
            audience: item.audience?.trim() || null,
            timetableJson: item.timetableJson.trim(),
            notes: item.notes?.trim() || null,
            isDefault: item.isDefault ?? index === 0,
            isActive: item.active ?? true,
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }
    }

    return program;
  });

  const refreshed = await db.program.findUniqueOrThrow({
    where: { id: updated.id },
    include: {
      goalMappings: { include: { goal: true }, orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      consumables: { include: { product: true } },
      schedules: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  return NextResponse.json({
    ...mapProgram(refreshed),
    goals: refreshed.goalMappings.map((mapping) => ({
      id: mapping.goal.id,
      name: mapping.goal.name,
      slug: mapping.goal.slug,
      kind: mapping.goal.kind,
      isPrimary: mapping.isPrimary,
      sortOrder: mapping.sortOrder,
    })),
    consumables: refreshed.consumables.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      quantity: item.quantity,
      notes: item.notes,
      stock: item.product.stock,
    })),
    schedules: refreshed.schedules.map((schedule) => ({
      id: schedule.id,
      label: schedule.label,
      audience: schedule.audience,
      timetableJson: schedule.timetableJson,
      notes: schedule.notes,
      isDefault: schedule.isDefault,
      active: schedule.isActive,
      sortOrder: schedule.sortOrder,
    })),
  });
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("memberships");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "معرف البرنامج مطلوب." }, { status: 400 });
  }

  const enrollments = await db.programEnrollment.count({ where: { programId: body.id } });
  if (enrollments > 0) {
    return NextResponse.json({ error: "لا يمكن حذف برنامج مرتبط بطلبات اشتراك." }, { status: 400 });
  }

  await db.program.delete({ where: { id: body.id } });
  return NextResponse.json({ success: true });
}
