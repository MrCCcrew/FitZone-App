import { db } from "@/lib/db";
import {
  cairoCalendarDateKey,
  scheduleWeekday,
} from "@/lib/fitzone-time";
import { ensureMembershipBookingsTx } from "@/lib/payments/membership-booking-plan";

export const DAYS_AR = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
// Must cover the post-end entitlement recovery window.
const HORIZON_BUFFER_DAYS = 30;
const MIN_HORIZON_DAYS = 30;
const MAKEUP_GRACE_DAYS = 30;

function makeupGraceStart(now: Date) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - MAKEUP_GRACE_DAYS);
  return d;
}

export type ScheduleMaintenanceResult = {
  classesProcessed: number;
  schedulesCreated: number;
  membershipsReconciled: number;
  reconciliationFailures: number;
  makeupCreated: number;
  underEntitlementMemberships: number;
  unresolvedEntitlement: number;
  unresolvedMembershipIds: string[];
};

function cairoTodayAnchor(now: Date) {
  return new Date(
    `${cairoCalendarDateKey(now)}T00:00:00.000Z`,
  );
}

function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function scheduleLogicalKey(
  classId: string,
  date: Date,
  time: string,
) {
  return `${classId}|${date.toISOString().slice(0, 10)}|${time}`;
}

/**
 * Dynamic materialization horizon.
 *
 * The database must contain enough future Schedule rows for:
 * - currently active membership definitions
 * - active offers
 * - already purchased active/pending memberships
 * plus a 14-day safety buffer.
 */
export async function getScheduleGenerationHorizonDays(
  now = new Date(),
) {
  const [memberships, offers, longestLiveMembership] =
    await Promise.all([
      db.membership.findMany({
        where: { isActive: true },
        select: {
          duration: true,
          maxMonths: true,
        },
      }),

      db.offer.findMany({
        where: { isActive: true },
        select: {
          durationDays: true,
        },
      }),

      db.userMembership.findFirst({
        where: {
          status: {
            in: ["active", "pending_payment"],
          },
          endDate: {
            gt: now,
          },
        },
        orderBy: {
          endDate: "desc",
        },
        select: {
          endDate: true,
        },
      }),
    ]);

  let maxDays = MIN_HORIZON_DAYS;

  for (const membership of memberships) {
    if (
      Number.isFinite(membership.duration) &&
      membership.duration > 0
    ) {
      maxDays = Math.max(
        maxDays,
        membership.duration,
      );
    }

    if (
      membership.maxMonths &&
      membership.maxMonths > 0
    ) {
      maxDays = Math.max(
        maxDays,
        membership.maxMonths * 30,
      );
    }
  }

  for (const offer of offers) {
    if (
      offer.durationDays &&
      offer.durationDays > 0
    ) {
      maxDays = Math.max(
        maxDays,
        offer.durationDays,
      );
    }
  }

  if (longestLiveMembership) {
    const remainingDays = Math.ceil(
      (
        longestLiveMembership.endDate.getTime() -
        now.getTime()
      ) / DAY_MS,
    );

    maxDays = Math.max(
      maxDays,
      remainingDays,
    );
  }

  return maxDays + HORIZON_BUFFER_DAYS;
}

/**
 * Build weekly occurrences using Cairo's business calendar.
 *
 * Schedule.date remains a UTC-midnight calendar anchor.
 */
export async function getNextOccurrences(
  dayName: string,
  time: string,
  maxSpots: number,
  now = new Date(),
) {
  const dayIndex = DAYS_AR.indexOf(
    dayName as (typeof DAYS_AR)[number],
  );

  if (dayIndex === -1) {
    return [];
  }

  const horizonDays =
    await getScheduleGenerationHorizonDays(now);

  const occurrenceCount =
    Math.ceil(horizonDays / 7) + 1;

  let date = cairoTodayAnchor(now);

  while (scheduleWeekday(date) !== dayIndex) {
    date = addUtcDays(date, 1);
  }

  return Array.from(
    { length: occurrenceCount },
    () => {
      const result = {
        date: new Date(date),
        time,
        availableSpots: maxSpots,
      };

      date = addUtcDays(date, 7);

      return result;
    },
  );
}

/**
 * Ensure that a single recurring class has all required future
 * Schedule rows.
 *
 * Important:
 * - existing rows are never modified
 * - existing availableSpots is never reset
 * - historical rows are never touched
 * - logical duplicate = classId + calendar date + time
 *
 * A MySQL advisory lock is used per class so concurrent maintenance
 * calls do not independently decide to create the same missing rows.
 */
export async function ensureRecurringScheduleForClass(input: {
  classId: string;
  dayName: string;
  time: string;
  maxSpots: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  const occurrences = await getNextOccurrences(
    input.dayName,
    input.time,
    input.maxSpots,
    now,
  );

  if (occurrences.length === 0) {
    return {
      created: 0,
    };
  }

  const firstDate = occurrences[0].date;
  const lastDate =
    occurrences[occurrences.length - 1].date;

  const lockName =
    `fitzone:schedule:${input.classId}`;

  return db.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<
      Array<{ acquired: number | bigint | null }>
    >`
      SELECT GET_LOCK(${lockName}, 10) AS acquired
    `;

    const acquired =
      Number(lockRows[0]?.acquired ?? 0);

    if (acquired !== 1) {
      throw new Error(
        `Could not acquire schedule maintenance lock for class ${input.classId}`,
      );
    }

    try {
      /*
       * Re-read inside the lock.
       * Include inactive rows as logical existing rows too:
       * an intentionally disabled occurrence must not be recreated
       * as a second active occurrence.
       */
      const existing =
        await tx.schedule.findMany({
          where: {
            classId: input.classId,
            date: {
              gte: firstDate,
              lte: lastDate,
            },
            time: input.time,
          },
          select: {
            classId: true,
            date: true,
            time: true,
          },
        });

      const existingKeys = new Set(
        existing.map((row) =>
          scheduleLogicalKey(
            row.classId,
            row.date,
            row.time,
          ),
        ),
      );

      const missing = occurrences.filter(
        (occurrence) =>
          !existingKeys.has(
            scheduleLogicalKey(
              input.classId,
              occurrence.date,
              occurrence.time,
            ),
          ),
      );

      if (missing.length === 0) {
        return {
          created: 0,
        };
      }

      const result =
        await tx.schedule.createMany({
          data: missing.map((occurrence) => ({
            classId: input.classId,
            date: occurrence.date,
            time: occurrence.time,
            availableSpots: input.maxSpots,
            isActive: true,
          })),
        });

      return {
        created: result.count,
      };
    } finally {
      /*
       * GET_LOCK is connection-scoped. Interactive transaction keeps
       * this work on the same DB connection until the callback ends.
       */
      await tx.$queryRaw`
        SELECT RELEASE_LOCK(${lockName})
      `.catch(() => null);
    }
  });
}

/**
 * Reconcile one class against immutable membership contracts.
 *
 * This remains useful for admin POST/PATCH so bookings can be repaired
 * immediately after that class's future schedule is changed.
 */
export async function reconcileFrozenMembershipsForClass(
  classId: string,
  now = new Date(),
) {
  const memberships =
    await db.userMembership.findMany({
      where: {
        status: {
          in: ["active", "expired"],
        },
        endDate: {
          gte: makeupGraceStart(now),
        },
        bookingPatternSnapshot: {
          not: null,
          contains: classId,
        },
      },
      select: {
        id: true,
      },
    });

  let reconciled = 0;
  let failures = 0;

  for (const membership of memberships) {
    try {
      await db.$transaction(async (tx) => {
        await ensureMembershipBookingsTx({
          tx,
          userMembershipId: membership.id,
        });
      });

      reconciled++;
    } catch (error) {
      failures++;

      console.error(
        `[MEMBERSHIP_BOOKING_RECONCILIATION_FAILED] ${membership.id}`,
        error,
      );
    }
  }

  return {
    reconciled,
    failures,
  };
}

/**
 * Reconcile every active membership that owns an immutable Contract v1.
 *
 * Running this after schedule extension is important:
 * Schedule rows are inventory; the booking engine cannot materialize
 * a member's remaining entitlement until those rows exist.
 */
export async function reconcileAllFrozenActiveMemberships(
  now = new Date(),
) {
  const memberships =
    await db.userMembership.findMany({
      where: {
        status: {
          in: ["active", "expired"],
        },
        endDate: {
          gte: makeupGraceStart(now),
        },
        bookingPatternSnapshot: {
          not: null,
        },
      },
      select: {
        id: true,
      },
    });

  let reconciled = 0;
  let failures = 0;
  let makeupCreated = 0;
  let underEntitlementMemberships = 0;
  let unresolvedEntitlement = 0;
  const unresolvedMembershipIds: string[] = [];

  for (const membership of memberships) {
    try {
      const result =
        await db.$transaction(async (tx) =>
          ensureMembershipBookingsTx({
            tx,
            userMembershipId:
              membership.id,
          }),
        );

      reconciled++;

      makeupCreated +=
        result.makeupCreatedCount ?? 0;

      if (result.underEntitlement) {
        underEntitlementMemberships++;
        unresolvedEntitlement +=
          result.remainingEntitlement ?? 0;

        unresolvedMembershipIds.push(
          membership.id,
        );

        console.warn(
          `[MEMBERSHIP_UNDER_ENTITLEMENT] ${membership.id} remaining=${result.remainingEntitlement}`,
        );
      }
    } catch (error) {
      failures++;

      console.error(
        `[MEMBERSHIP_BOOKING_MAINTENANCE_FAILED] ${membership.id}`,
        error,
      );
    }
  }

  return {
    reconciled,
    failures,
    makeupCreated,
    underEntitlementMemberships,
    unresolvedEntitlement,
    unresolvedMembershipIds,
  };
}

/**
 * System-wide recurring schedule maintenance.
 *
 * For every active class, infer the current recurring pattern from
 * its furthest active Schedule row. This is safe with the current
 * admin model because each Class represents one weekly recurring slot.
 *
 * Old booked schedules from a previous class pattern may remain in the
 * database, but the furthest generated schedule represents the current
 * recurring pattern.
 */
export async function extendRecurringSchedules(
  now = new Date(),
): Promise<ScheduleMaintenanceResult> {
  const classes =
    await db.class.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        maxSpots: true,
        schedules: {
          where: {
            isActive: true,
          },
          orderBy: [
            {
              date: "desc",
            },
            {
              time: "desc",
            },
          ],
          take: 1,
          select: {
            date: true,
            time: true,
          },
        },
      },
    });

  let classesProcessed = 0;
  let schedulesCreated = 0;

  for (const cls of classes) {
    const latest = cls.schedules[0];

    /*
     * A class with no schedule has no recurrence pattern stored
     * anywhere in the current schema, so maintenance cannot invent one.
     */
    if (!latest) {
      continue;
    }

    const weekday =
      scheduleWeekday(latest.date);

    const dayName =
      DAYS_AR[weekday];

    const result =
      await ensureRecurringScheduleForClass({
        classId: cls.id,
        dayName,
        time: latest.time,
        maxSpots: cls.maxSpots,
        now,
      });

    classesProcessed++;
    schedulesCreated += result.created;
  }

  /*
   * Reconcile even if this particular run created zero rows.
   * This makes a transient reconciliation failure self-healing on the
   * next maintenance run.
   */
  const reconciliation =
    await reconcileAllFrozenActiveMemberships(now);

  return {
    classesProcessed,
    schedulesCreated,
    membershipsReconciled:
      reconciliation.reconciled,
    reconciliationFailures:
      reconciliation.failures,
    makeupCreated:
      reconciliation.makeupCreated,
    underEntitlementMemberships:
      reconciliation.underEntitlementMemberships,
    unresolvedEntitlement:
      reconciliation.unresolvedEntitlement,
    unresolvedMembershipIds:
      reconciliation.unresolvedMembershipIds,
  };
}
