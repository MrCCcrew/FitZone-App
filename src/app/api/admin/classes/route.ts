import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("classes");
  return "error" in guard ? guard.error : null;
}

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function getNextOccurrences(dayName: string, time: string, maxSpots: number, count = 8): { date: Date; time: string; availableSpots: number }[] {
  const dayIndex = DAYS_AR.indexOf(dayName);
  if (dayIndex === -1) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const results = [];
  let date = new Date(today);
  // advance to next occurrence of that day
  while (date.getDay() !== dayIndex) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  for (let i = 0; i < count; i++) {
    results.push({ date: new Date(date), time, availableSpots: maxSpots });
    date = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return results;
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const [classes, trainers] = await Promise.all([
    db.class.findMany({
      include: {
        trainer: true,
        schedules: { where: { isActive: true }, take: 10 },
        _count: { select: { schedules: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.trainer.findMany({ orderBy: { name: "asc" } }),
  ]);

  const result = classes.map((c) => {
    // Group schedules by day
    const schedulesByDay: Record<string, string[]> = {};
    c.schedules.forEach(s => {
      const day = DAYS_AR[new Date(s.date).getDay()];
      if (!schedulesByDay[day]) schedulesByDay[day] = [];
      schedulesByDay[day].push(s.time);
    });

    // primary schedule for list view
    const firstSched = c.schedules[0];
    const day  = firstSched ? DAYS_AR[new Date(firstSched.date).getDay()] : "—";
    const time = firstSched?.time ?? "—";

    // enrolled = maxSpots - min available spots
    const enrolled = c.schedules.length > 0
      ? c.maxSpots - Math.min(...c.schedules.map(s => s.availableSpots))
      : 0;

    return {
      id:       c.id,
      name:     c.name,
      trainer:  c.trainer.name,
      trainerId: c.trainerId,
      day,
      time,
      duration: c.duration,
      capacity: c.maxSpots,
      enrolled: Math.max(0, enrolled),
      type:     c.type,
      intensity: c.intensity,
      price:    c.price,
      active:   c.isActive,
      schedulesByDay,
    };
  });

  return NextResponse.json({ classes: result, trainers: trainers.map(t => ({ id: t.id, name: t.name, specialty: t.specialty })) });
}

export async function POST(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { name, trainerId, type, duration, intensity, maxSpots, price, day, time } = body;
  if (!name || !trainerId) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const spots = Number(maxSpots ?? 15);
  const c = await db.class.create({
    data: {
      name,
      trainerId,
      type:      type      ?? "strength",
      duration:  Number(duration ?? 60),
      intensity: intensity ?? "medium",
      maxSpots:  spots,
      price:     Number(price     ?? 0),
    },
    include: { trainer: true },
  });

  // Auto-generate 8 weekly schedules if day and time are provided
  if (day && time) {
    const occurrences = getNextOccurrences(day, time, spots);
    if (occurrences.length > 0) {
      await db.schedule.createMany({
        data: occurrences.map((o) => ({
          classId: c.id,
          date: o.date,
          time: o.time,
          availableSpots: o.availableSpots,
          isActive: true,
        })),
      });
    }
  }

  return NextResponse.json({
    id: c.id, name: c.name, trainer: c.trainer.name, trainerId: c.trainerId,
    day: day ?? "—", time: time ?? "—", duration: c.duration, capacity: c.maxSpots,
    enrolled: 0, type: c.type, intensity: c.intensity, price: c.price, active: true,
    schedulesByDay: day && time ? { [day]: [time] } : {},
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { id, active, day, time, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (active     !== undefined) data.isActive  = Boolean(active);
  if (rest.name      !== undefined) data.name      = rest.name;
  if (rest.trainerId !== undefined) data.trainerId = rest.trainerId;
  if (rest.type      !== undefined) data.type      = rest.type;
  if (rest.intensity !== undefined) data.intensity = rest.intensity;
  if (rest.maxSpots  !== undefined) data.maxSpots  = Number(rest.maxSpots);
  if (rest.duration  !== undefined) data.duration  = Number(rest.duration);
  if (rest.price     !== undefined) data.price     = Number(rest.price);

  if (Object.keys(data).length > 0) {
    await db.class.update({ where: { id }, data });
  }

  // If day or time changed, delete future schedules and regenerate
  if (day && time) {
    const cls = await db.class.findUnique({ where: { id } });
    if (cls) {
      await db.schedule.deleteMany({
        where: { classId: id, date: { gte: new Date() }, bookings: { none: {} } },
      });
      const occurrences = getNextOccurrences(day, time, cls.maxSpots);
      if (occurrences.length > 0) {
        await db.schedule.createMany({
          data: occurrences.map((o) => ({
            classId: id,
            date: o.date,
            time: o.time,
            availableSpots: o.availableSpots,
            isActive: true,
          })),
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  await db.class.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
