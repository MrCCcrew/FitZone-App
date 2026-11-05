import { scheduleSlotInstant } from "@/lib/fitzone-time";
export type MembershipExpirationResult = {
  found: number;
  expired: number;
  skipped: number;
  attendancePassesExpired: number;
};

/**
 * Expire active memberships whose contractual endDate has passed.
 *
 * Designed for repeated/concurrent execution:
 * - Only status=active is claimable.
 * - endDate is re-checked atomically during update.
 * - AttendancePass expires only after this worker successfully
 *   claims the membership.
 */
export async function expireEndedActiveMembershipsTx(
  tx: any,
  now: Date,
): Promise<MembershipExpirationResult> {
  const candidates = await tx.userMembership.findMany({
    where: {
      status: "active",
      endDate: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
  });

  let expired = 0;
  let skipped = 0;
  let attendancePassesExpired = 0;

  for (const membership of candidates) {
    /*
     * Atomic claim.
     *
     * If another request/cron already expired the membership, or its
     * endDate/status changed meanwhile, count=0 and we leave it alone.
     */
    const claimed = await tx.userMembership.updateMany({
      where: {
        id: membership.id,
        status: "active",
        endDate: {
          lte: now,
        },
      },
      data: {
        status: "expired",
      },
    });

    if (claimed.count !== 1) {
      skipped++;
      continue;
    }

    /*
     * Contractual membership still expires normally.
     *
     * A future confirmed make-up booking is a narrow entitlement recovery
     * right and must NOT keep the membership active. It only keeps the
     * attendance pass usable for that specifically booked session.
     */
    const makeupBookings = await tx.booking.findMany({
      where: {
        userMembershipId: membership.id,
        isMakeup: true,
        status: "confirmed",
      },
      select: {
        id: true,
        schedule: {
          select: {
            date: true,
            time: true,
          },
        },
      },
    });

    const pendingMakeup = makeupBookings.some((booking: any) =>
      scheduleSlotInstant(
        new Date(booking.schedule.date),
        booking.schedule.time,
      ).getTime() >= now.getTime(),
    );

    if (!pendingMakeup) {
      const passes = await tx.attendancePass.updateMany({
        where: {
          userMembershipId: membership.id,
          status: "active",
        },
        data: {
          status: "expired",
        },
      });

      attendancePassesExpired += passes.count;
    }

    expired++;
  }

  return {
    found: candidates.length,
    expired,
    skipped,
    attendancePassesExpired,
  };
}
