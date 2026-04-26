import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requireAdminFeature("bookings");
  if ("error" in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId") || undefined;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Trainer sees only their own schedules
  let trainerClassFilter: { trainerId: string } | undefined;
  if (guard.role === "trainer") {
    const trainerProfile = await db.trainer.findFirst({
      where: { userId: guard.session.user.id },
      select: { id: true },
    });
    if (!trainerProfile) return NextResponse.json([]);
    trainerClassFilter = { trainerId: trainerProfile.id };
  }

  const schedules = await db.schedule.findMany({
    where: {
      isActive: true,
      date: { gte: today },
      ...(classId ? { classId } : {}),
      ...(trainerClassFilter ? { class: trainerClassFilter } : {}),
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
