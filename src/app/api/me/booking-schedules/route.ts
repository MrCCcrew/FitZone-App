import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { resolveMembershipClassEligibility } from "@/lib/membership-class-eligibility";
import { visibleClassScheduleWhere, visibleScheduleWhere } from "@/lib/public-catalog";

export async function GET() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const now = new Date();
  const [memberships, classes] = await Promise.all([
    db.userMembership.findMany({
      where: { userId: currentUser.id, status: "active", startDate: { lte: now }, endDate: { gte: now } },
      orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
      select: {
        id: true,
        offerId: true,
        status: true,
        startDate: true,
        endDate: true,
        allowedClassTypesSnapshot: true,
        membership: { select: { classSessions: true } },
      },
    }),
    db.class.findMany({
      where: visibleClassScheduleWhere(now),
      include: {
        trainer: true,
        schedules: {
          where: visibleScheduleWhere(now),
          orderBy: [{ date: "asc" }, { time: "asc" }],
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const eligibility = await resolveMembershipClassEligibility({
    userId: currentUser.id,
    classes: classes.map((gymClass) => ({ id: gymClass.id, type: gymClass.type })),
    now,
    memberships,
  });
  const allowedClassIds = new Set(eligibility.allowedClassIds);
  const allowedClasses = eligibility.hasEligibleMembership
    ? classes.filter((gymClass) => eligibility.unrestricted || allowedClassIds.has(gymClass.id))
    : [];

  return NextResponse.json(
    {
      schedules: allowedClasses.flatMap((gymClass) =>
        gymClass.schedules.map((schedule) => ({
          id: schedule.id,
          classId: gymClass.id,
          className: gymClass.name,
          trainer: gymClass.showTrainerName === false || !gymClass.trainer ? "" : gymClass.trainer.name,
          type: gymClass.type,
          subType: gymClass.subType ?? null,
          date: schedule.date.toISOString(),
          time: schedule.time,
          availableSpots: schedule.availableSpots,
        })),
      ),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
