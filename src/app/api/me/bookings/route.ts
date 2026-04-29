import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const bookings = await db.booking.findMany({
    where: { userId: currentUser.id },
    include: { schedule: { include: { class: { include: { trainer: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(
    bookings.map((b) => ({
      id: b.id,
      scheduleId: b.scheduleId,
      classId: b.schedule.classId,
      className: b.schedule.class.name,
      trainerName: b.schedule.class.trainer.name,
      date: b.schedule.date.toISOString(),
      time: b.schedule.time,
      status: b.status,
      type: b.schedule.class.type,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
