import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { resolveMembershipClassEligibility } from "@/lib/membership-class-eligibility";
import { publicScheduleWindow } from "@/lib/public-catalog";
import { cairoCalendarDateKey } from "@/lib/fitzone-time";

export async function GET() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const now = new Date();
  const [memberships, existingBookings] = await Promise.all([
    db.userMembership.findMany({
      where: { userId: currentUser.id, status: "active", startDate: { lte: now }, endDate: { gte: now } },
      orderBy: [{ endDate: "asc" }, { startDate: "asc" }],
      select: {
        id: true,
        offerId: true,
        status: true,
        startDate: true,
        endDate: true,
        eligibilitySnapshot: true,
        bookingPatternSnapshot: true,
        allowedClassTypesSnapshot: true,
        membership: { select: { classSessions: true } },
      },
    }),
    db.booking.findMany({
      where: {
        userId: currentUser.id,
        status: { in: ["confirmed", "attended"] },
      },
      select: { scheduleId: true },
    }),
  ]);

  const alreadyBookedScheduleIds = new Set(
    existingBookings.map((booking) => booking.scheduleId),
  );

  if (memberships.length === 0) {
    return NextResponse.json(
      { schedules: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { from } = publicScheduleWindow(now);

  const latestMembershipEnd = memberships.reduce(
    (latest, membership) =>
      membership.endDate > latest ? membership.endDate : latest,
    memberships[0].endDate,
  );

  const classes = await db.class.findMany({
    where: {
      isActive: true,
      schedules: {
        some: {
          isActive: true,
          date: {
            gte: from,
            lte: latestMembershipEnd,
          },
        },
      },
    },
    include: {
      trainer: true,
      schedules: {
        where: {
          isActive: true,
          date: {
            gte: from,
            lte: latestMembershipEnd,
          },
        },
        orderBy: [{ date: "asc" }, { time: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const eligibility = await resolveMembershipClassEligibility({
    userId: currentUser.id,
    classes: classes.map((gymClass) => ({
      id: gymClass.id,
      type: gymClass.type,
      classTypeId: gymClass.classTypeId ?? null,
    })),
    now,
    memberships,
  });
  const allowedClassIds = new Set(eligibility.allowedClassIds);

  const membershipById = new Map(
    memberships.map((membership) => [membership.id, membership]),
  );

  const allowedClasses = eligibility.hasEligibleMembership
    ? classes.filter(
        (gymClass) =>
          eligibility.unrestricted || allowedClassIds.has(gymClass.id),
      )
    : [];

  return NextResponse.json(
    {
      schedules: allowedClasses.flatMap((gymClass) => {
        const grantingMembershipIds =
          eligibility.membershipIdsByClass[gymClass.id] ?? [];

        const grantingMemberships = grantingMembershipIds
          .map((membershipId) => membershipById.get(membershipId))
          .filter((membership): membership is NonNullable<typeof membership> =>
            Boolean(membership),
          );

        return gymClass.schedules
          .filter((schedule) => {
            const targetDay = cairoCalendarDateKey(schedule.date);

            return grantingMemberships.some((membership) => {
              const startDay = cairoCalendarDateKey(membership.startDate);
              const endDay = cairoCalendarDateKey(membership.endDate);

              return targetDay >= startDay && targetDay <= endDay;
            });
          })
          .map((schedule) => ({
          id: schedule.id,
          classId: gymClass.id,
          className: gymClass.name,
          trainer: gymClass.showTrainerName === false || !gymClass.trainer ? "" : gymClass.trainer.name,
          type: gymClass.type,
          subType: gymClass.subType ?? null,
          date: schedule.date.toISOString(),
          time: schedule.time,
          availableSpots: schedule.availableSpots,
          alreadyBooked: alreadyBookedScheduleIds.has(schedule.id),
        }));
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
