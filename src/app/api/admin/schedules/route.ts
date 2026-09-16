import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { requireAdminPermission } from "@/lib/admin-authorization-server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const featureGuard = await requireAdminFeature("bookings");

  let guard:
    | typeof featureGuard
    | {
        role: string;
        session: {
          user: {
            id: string;
          };
        };
      };

  if ("error" in featureGuard) {
    const exchangeGuard =
      await requireAdminPermission("class_exchanges_execute");

    if ("error" in exchangeGuard) {
      return featureGuard.error;
    }

    guard = {
      role: exchangeGuard.role,
      session: {
        user: {
          id: exchangeGuard.session.id,
        },
      },
    };
  } else {
    guard = featureGuard;
  }

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
