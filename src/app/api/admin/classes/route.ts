import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

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

function getNextOccurrences(
  dayName: string,
  time: string,
  maxSpots: number,
  count = 8,
) {
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

export async function GET() {
  const error = await checkAdmin();
  if (error) return error;

  const [classes, trainers] = await Promise.all([
    db.class.findMany({
      include: {
        trainer: true,
        schedules: { where: { isActive: true }, take: 10, orderBy: { date: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    db.trainer.findMany({ orderBy: { name: "asc" } }),
  ]);

  const payload = classes.map((item) => {
    const firstSchedule = item.schedules[0];
    const day = firstSchedule ? DAYS_AR[new Date(firstSchedule.date).getDay()] : "الأحد";
    const time = firstSchedule?.time ?? "06:00";
    const enrolled =
      item.schedules.length > 0
        ? item.maxSpots - Math.min(...item.schedules.map((schedule) => schedule.availableSpots))
        : 0;

    return {
      id: item.id,
      name: item.name,
      trainer: item.trainer.name,
      trainerId: item.trainerId,
      day,
      time,
      duration: item.duration,
      capacity: item.maxSpots,
      enrolled: Math.max(0, enrolled),
      category: item.category ?? "",
      type: item.type,
      subType: item.subType ?? "",
      intensity: item.intensity,
      price: item.price,
      showTrainerName: item.showTrainerName ?? true,
      active: item.isActive,
    };
  });

  return NextResponse.json({
    classes: payload,
    trainers: trainers.map((trainer) => ({
      id: trainer.id,
      name: trainer.name,
      specialty: trainer.specialty,
    })),
  });
}

export async function POST(request: Request) {
  const error = await checkAdmin();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      name?: string;
      trainerId?: string;
      category?: string;
      type?: string;
      subType?: string;
      duration?: number;
      intensity?: string;
      maxSpots?: number;
      price?: number;
      active?: boolean;
      day?: string;
      time?: string;
      showTrainerName?: boolean;
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
        trainerId,
        category: category || null,
        type: type || "strength",
        subType: subType || null,
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

    return NextResponse.json({
      id: created.id,
      name: created.name,
      trainer: created.trainer.name,
      trainerId: created.trainerId,
      day: body.day ?? "الأحد",
      time: body.time ?? "06:00",
      duration: created.duration,
      capacity: created.maxSpots,
      enrolled: 0,
      category: created.category ?? "",
      type: created.type,
      subType: created.subType ?? "",
      intensity: created.intensity,
      price: created.price,
      showTrainerName: created.showTrainerName ?? true,
      active: created.isActive,
    });
  } catch {
    return NextResponse.json({ error: "تعذر حفظ الكلاس الآن." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const error = await checkAdmin();
  if (error) return error;

  try {
    const body = (await request.json()) as {
      id?: string;
      active?: boolean;
      name?: string;
      trainerId?: string;
      category?: string;
      type?: string;
      subType?: string;
      intensity?: string;
      maxSpots?: number;
      duration?: number;
      price?: number;
      day?: string;
      time?: string;
      showTrainerName?: boolean;
    };

    if (!body.id) {
      return NextResponse.json({ error: "معرف الكلاس مطلوب." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.active !== undefined) data.isActive = Boolean(body.active);
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.trainerId !== undefined) data.trainerId = body.trainerId;
    if (body.category !== undefined) data.category = body.category?.trim() || null;
    if (body.type !== undefined) data.type = body.type.trim() || "strength";
    if (body.subType !== undefined) data.subType = body.subType?.trim() || null;
    if (body.intensity !== undefined) data.intensity = body.intensity;
    if (body.maxSpots !== undefined) data.maxSpots = Number(body.maxSpots);
    if (body.duration !== undefined) data.duration = Number(body.duration);
    if (body.price !== undefined) data.price = Number(body.price);
    if (body.showTrainerName !== undefined) data.showTrainerName = Boolean(body.showTrainerName);

    if (Object.keys(data).length > 0) {
      await db.class.update({ where: { id: body.id }, data });
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
      return NextResponse.json({ error: "معرف الكلاس مطلوب." }, { status: 400 });
    }

    await db.class.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "تعذر حذف الكلاس الآن." }, { status: 500 });
  }
}
