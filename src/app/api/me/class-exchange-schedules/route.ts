import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { cairoCalendarDateKey, scheduleSlotInstant } from "@/lib/fitzone-time";
import { resolveMembershipClassEligibility } from "@/lib/membership-class-eligibility";

export async function GET(req: Request) {
  const currentUser = await getCurrentAppUser();

  if (!currentUser) {
    return NextResponse.json(
      { error: "غير مصرح" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const userMembershipId =
    url.searchParams.get("userMembershipId")?.trim() ?? "";

  if (!userMembershipId) {
    return NextResponse.json(
      { error: "الاشتراك مطلوب." },
      { status: 400 },
    );
  }

  const now = new Date();

  const membership =
    await db.userMembership.findFirst({
      where: {
        id: userMembershipId,
        userId: currentUser.id,
        status: "active",
      },
      include: {
        membership: {
          select: {
            classSessions: true,
          },
        },
      },
    });

  if (!membership) {
    return NextResponse.json(
      { error: "الاشتراك غير متاح للاستبدال." },
      { status: 404 },
    );
  }

  const classes = await db.class.findMany({
    where: {
      isActive: true,
      schedules: {
        some: {
          isActive: true,
          date: {
            gte: now,
            lte: membership.endDate,
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
            gte: now,
            lte: membership.endDate,
          },
        },
        orderBy: [
          { date: "asc" },
          { time: "asc" },
        ],
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  const eligibility =
    await resolveMembershipClassEligibility({
      userId: currentUser.id,
      classes: classes.map((gymClass) => ({
        id: gymClass.id,
        type: gymClass.type,
        classTypeId:
          gymClass.classTypeId ?? null,
      })),
      now,
      memberships: [membership],
    });

  const normallyAllowed =
    new Set(
      eligibility.unrestricted
        ? classes.map((gymClass) => gymClass.id)
        : eligibility.allowedClassIds,
    );

  const existingBookings =
    await db.booking.findMany({
      where: {
        userId: currentUser.id,
        userMembershipId: membership.id,
        status: {
          in: ["confirmed", "attended"],
        },
      },
      select: {
        id: true,
        scheduleId: true,
        schedule: {
          select: {
            date: true,
            time: true,
            class: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

  const existingScheduleIds =
    new Set(
      existingBookings.map(
        (booking) => booking.scheduleId,
      ),
    );

  const bookingsByDay =
    new Map<
      string,
      Array<{
        id: string;
        scheduleId: string;
        className: string;
        date: string;
        time: string;
      }>
    >();

  for (const booking of existingBookings) {
    const day =
      cairoCalendarDateKey(
        booking.schedule.date,
      );

    const dayBookings =
      bookingsByDay.get(day) ?? [];

    dayBookings.push({
      id: booking.id,
      scheduleId: booking.scheduleId,
      className:
        booking.schedule.class.name,
      date:
        booking.schedule.date.toISOString(),
      time:
        booking.schedule.time,
    });

    bookingsByDay.set(
      day,
      dayBookings,
    );
  }

  const membershipStartDay =
    cairoCalendarDateKey(membership.startDate);

  const membershipEndDay =
    cairoCalendarDateKey(membership.endDate);

  const schedules = classes.flatMap(
    (gymClass) => {
      if (normallyAllowed.has(gymClass.id)) {
        return [];
      }

      return gymClass.schedules
        .filter((schedule) => {
          const instant =
            scheduleSlotInstant(
              schedule.date,
              schedule.time,
            );

          if (
            instant.getTime() <=
            now.getTime()
          ) {
            return false;
          }

          const targetDay =
            cairoCalendarDateKey(
              schedule.date,
            );

          if (
            targetDay < membershipStartDay ||
            targetDay > membershipEndDay
          ) {
            return false;
          }

          if (
            schedule.availableSpots <= 0
          ) {
            return false;
          }

          if (
            existingScheduleIds.has(
              schedule.id,
            )
          ) {
            return false;
          }

          return true;
        })
        .map((schedule) => {
          const targetDay =
            cairoCalendarDateKey(
              schedule.date,
            );

          const sameDayBookings =
            bookingsByDay.get(targetDay) ?? [];

          return {
            id: schedule.id,
            classId: gymClass.id,
            className: gymClass.name,
            trainer:
              gymClass.showTrainerName === false ||
              !gymClass.trainer
                ? ""
                : gymClass.trainer.name,
            type: gymClass.type,
            subType:
              gymClass.subType ?? null,
            date:
              schedule.date.toISOString(),
            time: schedule.time,
            availableSpots:
              schedule.availableSpots,
            sameDayBookings,
            sameDayBookingCount:
              sameDayBookings.length,
            customerSelectable:
              sameDayBookings.length < 2,
          };
        });
    },
  );

  return NextResponse.json(
    { schedules },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
