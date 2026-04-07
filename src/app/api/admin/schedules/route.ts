import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("bookings");
  return "error" in guard ? guard.error : null;
}

export async function GET(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") || undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedules = await db.schedule.findMany({
    where: {
      isActive: true,
      date: { gte: today },
      ...(classId ? { classId } : {}),
    },
    include: { class: true },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 200,
  });

  return NextResponse.json(
    schedules.map((schedule) => ({
      id: schedule.id,
      date: schedule.date.toISOString(),
      time: schedule.time,
      availableSpots: schedule.availableSpots,
      class: { id: schedule.classId, name: schedule.class.name },
    })),
  );
}
