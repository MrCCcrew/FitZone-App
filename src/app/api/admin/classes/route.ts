import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

const DAYS_AR = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

async function checkAdmin() {
  const guard = await requireAdminFeature("classes");
  return "error" in guard ? guard.error : null;
}

async function checkCanAddClasses(userId: string): Promise<boolean> {
  const profile = await db.trainer.findFirst({
    where: { userId },
    select: { canAddClasses: true },
  });
  return profile?.canAddClasses === true;
}

async function getTrainerProfileId(userId: string): Promise<string | null> {
  const t = await db.trainer.findFirst({ where: { userId }, select: { id: true } });
  return t?.id ?? null;
}

function getNextOccurrences(dayName: string, time: string, maxSpots: number, count = 8) {
  const dayIndex = DAYS_AR.indexOf(dayName);
  if (dayIndex === -1) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let date = new Date(today);
  while (date.getDay() !== dayIndex) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }

  return Array.from({ length: count }, () => {
    const result = {
      date: new Date(date),
      time,
      availableSpots: maxSpots,
    };
    date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    return result;
  });
}

async function upsertTrialConfig(classId: string, trialEnabled: boolean, trialPrice: number) {
  const existing = await db.siteContent.findUnique({ where: { section: "trial_classes_config" } });
  let cfg: Record<string, { trialEnabled: boolean; trialPrice: number }> = {};
  if (existing) {
    try { cfg = JSON.parse(existing.content) as typeof cfg; } catch { /* ignore */ }
  }
  cfg[classId] = { trialEnabled, trialPrice };
  await db.siteContent.upsert({
    where: { section: "trial_classes_config" },
    update: { content: JSON.stringify(cfg) },
    create: { section: "trial_classes_config", content: JSON.stringify(cfg) },
  });
}

function parseTrialConfig(records: Array<{ section: string; content: string }>): Record<string, { trialEnabled: boolean; trialPrice: number }> {
  const record = records.find((r) => r.section === "trial_classes_config");
  if (!record) return {};
  try { return JSON.parse(record.content) as Record<string, { trialEnabled: boolean; trialPrice: number }>; } catch { return {}; }
}

export async function GET() {
  const guard = await requireAdminFeature("classes");
  if ("error" in guard) return guard.error;

  let trainerIdFilter: string | undefined;
  let canAddClasses = true;
  if (guard.role === "trainer") {
    const profile = await db.trainer.findFirst({
      where: { userId: guard.session.user.id },
      select: { id: true, canAddClasses: true },
    });
    if (!profile) return NextResponse.json({ classes: [], trainers: [], userRole: "trainer", canAddClasses: false });
    trainerIdFilter = profile.id;
    canAddClasses = profile.canAddClasses;
  }

  const [classes, trainers, trialConfigRecords] = await Promise.all([
    db.class.findMany({
      where: trainerIdFilter ? { trainerId: trainerIdFilter } : undefined,
      include: {
        trainer: true,
        schedules: { where: { isActive: true }, take: 10, orderBy: { date: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    db.trainer.findMany({ orderBy: { name: "asc" } }),
    db.siteContent.findMany({ where: { section: "trial_classes_config" } }),
  ]);

  const trialConfig = parseTrialConfig(trialConfigRecords);

  const payload = classes.map((item) => {
    const firstSchedule = item.schedules[0];
    const day = firstSchedule ? DAYS_AR[new Date(firstSchedule.date).getDay()] : "الأحد";
    const time = firstSchedule?.time ?? "06:00";
    const enrolled =
      item.schedules.length > 0
        ? item.maxSpots - Math.min(...item.schedules.map((schedule) => schedule.availableSpots))
        : 0;
    const cfg = trialConfig[item.id];

    return {
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      description: item.description ?? "",
      descriptionEn: item.descriptionEn ?? "",
      trainer: item.trainer.name,
      trainerId: item.trainerId,
      day,
      time,
      duration: item.duration,
      capacity: item.maxSpots,
      enrolled: Math.max(0, enrolled),
      category: item.category ?? "",
      categoryEn: item.categoryEn ?? "",
      type: item.type,
      typeEn: item.typeEn ?? "",
      subType: item.subType ?? "",
      subTypeEn: item.subTypeEn ?? "",
      intensity: item.intensity,
      price: item.price,
      showTrainerName: item.showTrainerName ?? true,
      active: item.isActive,
      trialEnabled: cfg?.trialEnabled ?? true,
      trialPrice: cfg?.trialPrice ?? 50,
    };
  });

  return NextResponse.json({
    classes: payload,
    trainers: trainers.map((trainer) => ({
      id: trainer.id,
      name: trainer.name,
      nameEn: trainer.nameEn,
      specialty: trainer.specialty,
      specialtyEn: trainer.specialtyEn,
    })),
    userRole: guard.role,
    canAddClasses,
  });
}

export async function POST(request: Request) {
  const guard = await requireAdminFeature("classes");
  if ("error" in guard) return guard.error;

  if (guard.role === "trainer") {
    const allowed = await checkCanAddClasses(guard.session.user.id);
    if (!allowed) return NextResponse.json({ error: "ليس لديك صلاحية إضافة كلاسات جديدة." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      nameEn?: string;
      description?: string;
      descriptionEn?: string;
      trainerId?: string;
      category?: string;
      categoryEn?: string;
      type?: string;
      typeEn?: string;
      subType?: string;
      subTypeEn?: string;
      duration?: number;
      intensity?: string;
      maxSpots?: number;
      price?: number;
      active?: boolean;
      day?: string;
      time?: string;
      showTrainerName?: boolean;
      trialEnabled?: boolean;
      trialPrice?: number;
    };

    const name = body.name?.trim();
    const trainerId = body.trainerId?.trim();
    const type = body.type?.trim();
    const category = body.category?.trim();
    const subType = body.subType?.trim();

    if (!name || !trainerId) {
      return NextResponse.json({ error: "اسم الكلاس والمدربة مطلوبان." }, { status: 400 });
    }

    const maxSpots = Number(body.maxSpots ?? 15);
    const created = await db.class.create({
      data: {
        name,
        nameEn: body.nameEn?.trim() || null,
        description: body.description?.trim() || null,
        descriptionEn: body.descriptionEn?.trim() || null,
        trainerId,
        category: category || null,
        categoryEn: body.categoryEn?.trim() || null,
        type: type || "strength",
        typeEn: body.typeEn?.trim() || null,
        subType: subType || null,
        subTypeEn: body.subTypeEn?.trim() || null,
        duration: Number(body.duration ?? 60),
        intensity: body.intensity ?? "medium",
        maxSpots,
        price: Number(body.price ?? 0),
        showTrainerName: body.showTrainerName ?? true,
        isActive: body.active ?? true,
      },
      include: { trainer: true },
    });

    if (body.day && body.time) {
      const occurrences = getNextOccurrences(body.day, body.time, maxSpots);
      if (occurrences.length > 0) {
        await db.schedule.createMany({
          data: occurrences.map((occurrence) => ({
            classId: created.id,
            date: occurrence.date,
            time: occurrence.time,
            availableSpots: occurrence.availableSpots,
            isActive: true,
          })),
        });
      }
    }

    // Persist trial settings in siteContent
    await upsertTrialConfig(created.id, body.trialEnabled ?? true, Number(body.trialPrice ?? 50));

    clearPublicApiCache();
    return NextResponse.json({
      id: created.id,
      name: created.name,
      nameEn: created.nameEn,
      description: created.description ?? "",
      descriptionEn: created.descriptionEn ?? "",
      trainer: created.trainer.name,
      trainerId: created.trainerId,
      day: body.day ?? "الأحد",
      time: body.time ?? "06:00",
      duration: created.duration,
      capacity: created.maxSpots,
      enrolled: 0,
      category: created.category ?? "",
      categoryEn: created.categoryEn ?? "",
      type: created.type,
      typeEn: created.typeEn ?? "",
      subType: created.subType ?? "",
      subTypeEn: created.subTypeEn ?? "",
      intensity: created.intensity,
      price: created.price,
      showTrainerName: created.showTrainerName ?? true,
      active: created.isActive,
      trialEnabled: body.trialEnabled ?? true,
      trialPrice: Number(body.trialPrice ?? 50),
    });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ الكلاس الآن." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await requireAdminFeature("classes");
  if ("error" in guard) return guard.error;

  let ownTrainerId: string | null = null;
  if (guard.role === "trainer") {
    const profile = await db.trainer.findFirst({
      where: { userId: guard.session.user.id },
      select: { id: true, canAddClasses: true },
    });
    if (!profile?.canAddClasses) {
      return NextResponse.json({ error: "ليس لديك صلاحية تعديل الكلاسات." }, { status: 403 });
    }
    ownTrainerId = profile.id;
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      active?: boolean;
      name?: string;
      nameEn?: string;
      description?: string;
      descriptionEn?: string;
      trainerId?: string;
      category?: string;
      categoryEn?: string;
      type?: string;
      typeEn?: string;
      subType?: string;
      subTypeEn?: string;
      intensity?: string;
      maxSpots?: number;
      duration?: number;
      price?: number;
      day?: string;
      time?: string;
      showTrainerName?: boolean;
      trialEnabled?: boolean;
      trialPrice?: number;
    };

    if (!body.id) {
      return NextResponse.json({ error: "معرّف الكلاس مطلوب." }, { status: 400 });
    }

    // Trainers can only edit their own classes
    if (ownTrainerId) {
      const cls = await db.class.findUnique({ where: { id: body.id }, select: { trainerId: true } });
      if (!cls || cls.trainerId !== ownTrainerId) {
        return NextResponse.json({ error: "لا يمكنك تعديل كلاس لا يخصك." }, { status: 403 });
      }
    }

    const data: Record<string, unknown> = {};
    if (body.active !== undefined) data.isActive = Boolean(body.active);
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.nameEn !== undefined) data.nameEn = body.nameEn.trim() || null;
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.descriptionEn !== undefined) data.descriptionEn = body.descriptionEn?.trim() || null;
    if (body.trainerId !== undefined && !ownTrainerId) data.trainerId = body.trainerId;
    if (body.category !== undefined) data.category = body.category?.trim() || null;
    if (body.categoryEn !== undefined) data.categoryEn = body.categoryEn?.trim() || null;
    if (body.type !== undefined) data.type = body.type.trim() || "strength";
    if (body.typeEn !== undefined) data.typeEn = body.typeEn?.trim() || null;
    if (body.subType !== undefined) data.subType = body.subType?.trim() || null;
    if (body.subTypeEn !== undefined) data.subTypeEn = body.subTypeEn?.trim() || null;
    if (body.intensity !== undefined) data.intensity = body.intensity;
    if (body.maxSpots !== undefined) data.maxSpots = Number(body.maxSpots);
    if (body.duration !== undefined) data.duration = Number(body.duration);
    if (body.price !== undefined) data.price = Number(body.price);
    if (body.showTrainerName !== undefined) data.showTrainerName = Boolean(body.showTrainerName);

    if (Object.keys(data).length > 0) {
      await db.class.update({ where: { id: body.id }, data });
    }

    // Persist trial settings when provided
    if (body.trialEnabled !== undefined || body.trialPrice !== undefined) {
      const existing = await db.siteContent.findUnique({ where: { section: "trial_classes_config" } });
      let cfg: Record<string, { trialEnabled: boolean; trialPrice: number }> = {};
      if (existing) { try { cfg = JSON.parse(existing.content) as typeof cfg; } catch { /* ignore */ } }
      const prev = cfg[body.id] ?? { trialEnabled: true, trialPrice: 50 };
      cfg[body.id] = {
        trialEnabled: body.trialEnabled ?? prev.trialEnabled,
        trialPrice: body.trialPrice !== undefined ? Number(body.trialPrice) : prev.trialPrice,
      };
      await db.siteContent.upsert({
        where: { section: "trial_classes_config" },
        update: { content: JSON.stringify(cfg) },
        create: { section: "trial_classes_config", content: JSON.stringify(cfg) },
      });
    }

    if (body.day && body.time) {
      const current = await db.class.findUnique({ where: { id: body.id } });
      if (current) {
        await db.schedule.deleteMany({
          where: {
            classId: body.id,
            date: { gte: new Date() },
            bookings: { none: {} },
          },
        });

        const occurrences = getNextOccurrences(body.day, body.time, current.maxSpots);
        if (occurrences.length > 0) {
          await db.schedule.createMany({
            data: occurrences.map((occurrence) => ({
              classId: body.id!,
              date: occurrence.date,
              time: occurrence.time,
              availableSpots: occurrence.availableSpots,
              isActive: true,
            })),
          });
        }
      }
    }

    clearPublicApiCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "تعذر تحديث الكلاس الآن." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const error = await checkAdmin();
  if (error) return error;

  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json({ error: "معرّف الكلاس مطلوب." }, { status: 400 });
    }

    await db.class.delete({ where: { id: body.id } });
    clearPublicApiCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "تعذر حذف الكلاس الآن." }, { status: 500 });
  }
}

// Bulk transfer all classes from one trainer to another
export async function PUT(request: Request) {
  const error = await checkAdmin();
  if (error) return error;

  try {
    const body = (await request.json()) as { fromTrainerId?: string; toTrainerId?: string };
    if (!body.fromTrainerId || !body.toTrainerId) {
      return NextResponse.json({ error: "fromTrainerId و toTrainerId مطلوبان." }, { status: 400 });
    }
    if (body.fromTrainerId === body.toTrainerId) {
      return NextResponse.json({ error: "المدربة المصدر والهدف نفسها." }, { status: 400 });
    }

    const [fromTrainer, toTrainer] = await Promise.all([
      db.trainer.findUnique({ where: { id: body.fromTrainerId }, select: { id: true } }),
      db.trainer.findUnique({ where: { id: body.toTrainerId }, select: { id: true } }),
    ]);
    if (!fromTrainer) return NextResponse.json({ error: "المدربة المصدر غير موجودة." }, { status: 404 });
    if (!toTrainer) return NextResponse.json({ error: "المدربة الهدف غير موجودة." }, { status: 404 });

    const result = await db.class.updateMany({
      where: { trainerId: body.fromTrainerId },
      data: { trainerId: body.toTrainerId },
    });

    clearPublicApiCache();
    return NextResponse.json({ success: true, transferred: result.count });
  } catch {
    return NextResponse.json({ error: "تعذر نقل الكلاسات الآن." }, { status: 500 });
  }
}
