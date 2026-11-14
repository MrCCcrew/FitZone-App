import { asDbTransactionClient, db } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import {
  ensureMembershipAttendancePass,
  ensureOfferBoxAttendancePass,
  ensureIndependentFriendAttendancePass,
  getPrivateSessionsRemaining,
  isPrivateApplicationEligibleForAttendance,
} from "@/lib/attendance";
import { isBookingOperational } from "@/lib/booking-operational";
import { cairoCalendarDateKey, scheduleSlotInstant } from "@/lib/fitzone-time";
import { getBookingEntitlementUnits } from "@/lib/membership-session-units";

export type AttendanceSource = "manual" | "qr";

export type MarkClassAttendanceResult =
  | {
      ok: true;
      status: "checked_in";
      bookingId: string;
      checkInId: string;
      membershipExpired: boolean;
      sessionsUsed: number;
      sessionsRemaining: number | null;
      customerName: string;
      className: string;
      trainerName: string;
      time: string;
    }
  | {
      ok: true;
      status: "already_attended";
      bookingId: string;
      customerName: string;
      className: string;
      trainerName: string;
      time: string;
    }
  | {
      ok: false;
      code:
        | "BOOKING_NOT_FOUND"
        | "BOOKING_NOT_CONFIRMED"
        | "BOOKING_NOT_OPERATIONAL"
        | "FUTURE_SESSION"
        | "MEMBERSHIP_REQUIRED"
        | "ATTENDANCE_PASS_UNAVAILABLE"
        | "ATTENDANCE_PASS_NOT_ACTIVE"
        | "BOOKING_STATUS_CHANGED";
    };

export async function markClassAttendance(input: {
  bookingId: string;
  scannedByUserId: string;
  source: AttendanceSource;
  scannedPassId?: string;
}): Promise<MarkClassAttendanceResult> {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      user: {
        select: {
          name: true,
        },
      },
      userMembership: {
        include: {
          membership: true,
        },
      },
      schedule: {
        include: {
          class: {
            include: {
              trainer: true,
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return { ok: false, code: "BOOKING_NOT_FOUND" };
  }

  if (booking.friendOfferEntitlementId) {
    return markIndependentFriendClassAttendance(input, booking.userId);
  }

  if (booking.offerBoxEntitlementId) {
    return markOfferBoxClassAttendance(input, booking.userId);
  }

  const responseDetails = {
    bookingId: booking.id,
    customerName: booking.user.name ?? "Member",
    className: booking.schedule.class.name,
    trainerName: booking.schedule.class.trainer.name,
    time: booking.schedule.time,
  };

  /*
   * Idempotent read path.
   *
   * The caller may choose a different HTTP representation for manual vs QR,
   * but the domain truth is the same: an attended booking must never consume
   * another session.
   */
  if (booking.status === "attended") {
    return {
      ok: true,
      status: "already_attended",
      ...responseDetails,
    };
  }

  if (booking.status !== "confirmed") {
    return { ok: false, code: "BOOKING_NOT_CONFIRMED" };
  }

  if (!isBookingOperational(booking)) {
    return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
  }

  /*
   * Schedule.date is a calendar anchor while Schedule.time is Cairo local.
   * Attendance is allowed only when the real Cairo session instant has begun.
   */
  const sessionInstant = scheduleSlotInstant(
    new Date(booking.schedule.date),
    booking.schedule.time,
  );

  if (sessionInstant.getTime() > Date.now()) {
    return { ok: false, code: "FUTURE_SESSION" };
  }

  if (!booking.userMembershipId || !booking.userMembership) {
    return { ok: false, code: "MEMBERSHIP_REQUIRED" };
  }

  const pass = await ensureMembershipAttendancePass(
    booking.userMembershipId,
    {
      allowExpiredMakeup: booking.isMakeup === true,
    },
  );

  if (!pass) {
    return { ok: false, code: "ATTENDANCE_PASS_UNAVAILABLE" };
  }

  /*
   * A revoked/inactive/expired pass must not be silently bypassed by a
   * different attendance entry point.
   *
   * ensureMembershipAttendancePass() may specifically reactivate an expired
   * pass for a valid expired-membership make-up booking before we reach here.
   */
  if (pass.status !== "active") {
    return { ok: false, code: "ATTENDANCE_PASS_NOT_ACTIVE" };
  }

  const membershipId = booking.userMembershipId;
  const sessionLimit =
    booking.userMembership.totalSessions ??
    booking.userMembership.membership.sessionsCount ??
    null;

  const result = await db.$transaction(async (tx) => {
    /*
     * Authoritative atomic claim.
     *
     * Membership eligibility is part of the claim itself so an ordinary
     * booking cannot be consumed if the membership expires concurrently.
     * A specifically marked make-up booking may remain operational on an
     * expired membership.
     */
    const claimed = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "confirmed",
        userMembership: booking.isMakeup
          ? {
              status: {
                in: ["active", "expired"],
              },
            }
          : {
              status: "active",
            },
      },
      data: {
        status: "attended",
      },
    });

    if (claimed.count !== 1) {
      return {
        claimed: false as const,
      };
    }

    const created = await tx.attendanceCheckIn.create({
      data: {
        passId: pass.id,
        userId: booking.userId,
        userMembershipId: membershipId,
        bookingId: booking.id,
        scheduleId: booking.scheduleId,
        scannedByUserId: input.scannedByUserId,
        checkInType: "class",
      },
    });

    let sessionsUsed = 0;
    let membershipExpired = false;

    if (sessionLimit != null && sessionLimit > 0) {
      const attendanceRows =
        await tx.attendanceCheckIn.findMany({
          where: {
            userMembershipId: membershipId,
          },
          select: {
            booking: {
              select: {
                entitlementUnits: true,
              },
            },
          },
        });

      sessionsUsed = attendanceRows.reduce(
        (total, row) =>
          total +
          getBookingEntitlementUnits({
            entitlementUnits:
              row.booking?.entitlementUnits ?? null,
          }),
        0,
      );

      if (sessionsUsed >= sessionLimit) {
        membershipExpired = true;

        await tx.userMembership.updateMany({
          where: {
            id: membershipId,
            status: "active",
          },
          data: {
            status: "expired",
          },
        });
      }
    }

    /*
     * Pass lifecycle is centralized here for BOTH manual and QR attendance.
     *
     * For an expired membership, specifically confirmed make-up bookings may
     * remain usable without reactivating/extending the membership itself.
     */
    const membershipNow = await tx.userMembership.findUnique({
      where: { id: membershipId },
      select: { status: true },
    });

    if (
      membershipNow?.status === "expired" &&
      booking.isMakeup === true
    ) {
      const remainingMakeups = await tx.booking.count({
        where: {
          userMembershipId: membershipId,
          isMakeup: true,
          status: "confirmed",
          id: {
            not: booking.id,
          },
        },
      });

      await tx.attendancePass.update({
        where: { id: pass.id },
        data: {
          lastUsedAt: new Date(),
          status: remainingMakeups > 0 ? "active" : "expired",
        },
      });
    } else if (membershipExpired) {
      await tx.attendancePass.update({
        where: { id: pass.id },
        data: {
          lastUsedAt: new Date(),
          status: "expired",
        },
      });
    } else {
      await tx.attendancePass.update({
        where: { id: pass.id },
        data: {
          lastUsedAt: new Date(),
        },
      });
    }

    const notificationBody =
      input.source === "manual"
        ? "تم تسجيل حضورك بواسطة الإدارة."
        : membershipExpired
          ? `تم تسجيل حضورك في ${booking.schedule.class.name} الساعة ${booking.schedule.time}. لقد استهلكتِ جميع حصصك — انتهى اشتراكك.`
          : `تم تسجيل حضورك في ${booking.schedule.class.name} الساعة ${booking.schedule.time}.`;

    await tx.notification.create({
      data: {
        userId: booking.userId,
        title:
          input.source === "qr" && membershipExpired
            ? `✅ آخر حصة — ${booking.schedule.class.name}`
            : `تم تسجيل حضور ${booking.schedule.class.name}`,
        body: notificationBody,
        type: "success",
      },
    }).catch(() => null);

    return {
      claimed: true as const,
      checkInId: created.id,
      sessionsUsed,
      membershipExpired,
    };
  });

  if (!result.claimed) {
    return {
      ok: false,
      code: "BOOKING_STATUS_CHANGED",
    };
  }

  return {
    ok: true,
    status: "checked_in",
    ...responseDetails,
    checkInId: result.checkInId,
    membershipExpired: result.membershipExpired,
    sessionsUsed: result.sessionsUsed,
    sessionsRemaining:
      sessionLimit != null
        ? Math.max(0, sessionLimit - result.sessionsUsed)
        : null,
  };
}

/** Independent friend-offer check-in, protected by entitlement + booking locks. */
async function markIndependentFriendClassAttendance(
  input: { bookingId: string; scannedByUserId: string; source: AttendanceSource; scannedPassId?: string },
  userId: string,
): Promise<MarkClassAttendanceResult> {
  const initial = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: { userId: true, friendOfferEntitlementId: true, userMembershipId: true, offerBoxEntitlementId: true },
  });
  if (!initial || initial.userId !== userId || !initial.friendOfferEntitlementId ||
      initial.userMembershipId !== null || initial.offerBoxEntitlementId !== null)
    return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
  const entitlementId = initial.friendOfferEntitlementId;
  const pass = await ensureIndependentFriendAttendancePass(entitlementId, userId);
  if (!pass || pass.status !== "active")
    return { ok: false, code: "ATTENDANCE_PASS_UNAVAILABLE" };
  if (input.source === "qr" && pass.id !== input.scannedPassId)
    return { ok: false, code: "ATTENDANCE_PASS_NOT_ACTIVE" };
  return db.$transaction(async (tx) => {
    await lockMembershipLifecycleUserTx(asDbTransactionClient(tx), userId);
    await tx.$queryRaw`SELECT id FROM FriendOfferEntitlement WHERE id = ${entitlementId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM Booking WHERE id = ${input.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: {
        user: {select: {name: true, isActive: true}},
        schedule: {include: {class: {include: {trainer: true}}}},
      },
    });
    if (!booking) return {ok: false as const, code: "BOOKING_NOT_FOUND" as const};
    if (!booking.user.isActive || booking.userId !== userId ||
        booking.friendOfferEntitlementId !== entitlementId ||
        booking.userMembershipId !== null || booking.offerBoxEntitlementId !== null)
      return {ok: false as const, code: "BOOKING_NOT_OPERATIONAL" as const};
    const right = await tx.friendOfferEntitlement.findUnique({
      where: {id: entitlementId},
      include: {participant: {select: {userId: true, userMembershipId: true, paymentTransactionId: true, status: true}},
        paymentTransaction: {select: {userId: true, membershipId: true, provider: true, status: true}}},
    });
    if (!right || right.status !== "active" || right.userId !== userId ||
        right.participant.userId !== userId || right.participant.userMembershipId !== null ||
        right.participant.paymentTransactionId !== right.paymentTransactionId ||
        !["paid", "activated"].includes(right.participant.status) ||
        right.paymentTransaction.userId !== userId || right.paymentTransaction.status !== "paid" ||
        right.paymentTransaction.provider !== "paymob" || right.paymentTransaction.membershipId !== null)
      return {ok: false as const, code: "BOOKING_NOT_OPERATIONAL" as const};
    await tx.$queryRaw`SELECT id FROM AttendancePass WHERE id = ${pass.id} FOR UPDATE`;
    const currentPass = await tx.attendancePass.findUnique({where: {id: pass.id}});
    if (!currentPass || currentPass.status !== "active" || currentPass.kind !== "friend_offer" ||
        currentPass.userId !== userId || currentPass.friendOfferEntitlementId !== entitlementId ||
        currentPass.userMembershipId !== null || currentPass.offerBoxEntitlementId !== null ||
        currentPass.privateSessionApplicationId !== null)
      return {ok: false as const, code: "ATTENDANCE_PASS_NOT_ACTIVE" as const};
    const details = {bookingId: booking.id, customerName: booking.user.name ?? "Member",
      className: booking.schedule.class.name, trainerName: booking.schedule.class.trainer.name,
      time: booking.schedule.time};
    if (booking.status === "attended") return {ok: true as const, status: "already_attended" as const, ...details};
    if (booking.status !== "confirmed") return {ok: false as const, code: "BOOKING_NOT_CONFIRMED" as const};
    const when = scheduleSlotInstant(booking.schedule.date, booking.schedule.time);
    if (!Number.isFinite(when.getTime())) return {ok: false as const, code: "BOOKING_NOT_OPERATIONAL" as const};
    if (when.getTime() > Date.now()) return {ok: false as const, code: "FUTURE_SESSION" as const};
    const day = cairoCalendarDateKey(when);
    if (day < cairoCalendarDateKey(right.startDate) || day > cairoCalendarDateKey(right.endDate))
      return {ok: false as const, code: "BOOKING_NOT_OPERATIONAL" as const};
    const claimed = await tx.booking.updateMany({
      where: {id: booking.id, userId, scheduleId: booking.scheduleId, status: "confirmed",
        userMembershipId: null, offerBoxEntitlementId: null, friendOfferEntitlementId: entitlementId},
      data: {status: "attended"},
    });
    if (claimed.count !== 1) return {ok: false as const, code: "BOOKING_STATUS_CHANGED" as const};
    const check = await tx.attendanceCheckIn.create({data: {
      passId: pass.id, userId, bookingId: booking.id, scheduleId: booking.scheduleId,
      scannedByUserId: input.scannedByUserId, checkInType: "class",
    }});
    const attended = await tx.booking.findMany({
      where: {friendOfferEntitlementId: entitlementId, userMembershipId: null, userId, status: "attended"},
      select: {entitlementUnits: true},
    });
    const sessionsUsed = attended.reduce((n, b) => n + getBookingEntitlementUnits(b), 0);
    await tx.attendancePass.update({where: {id: pass.id}, data: {lastUsedAt: new Date()}});
    await tx.notification.create({data: {userId, title: `تم تسجيل حضور ${booking.schedule.class.name}`,
      body: "تم تسجيل حضور حصة عرض الصحاب المستقل.", type: "success"}});
    return {ok: true as const, status: "checked_in" as const, ...details, checkInId: check.id,
      membershipExpired: false, sessionsUsed,
      sessionsRemaining: right.totalSessions === null ? null : Math.max(0, right.totalSessions - sessionsUsed)};
  });
}

async function markOfferBoxClassAttendance(
  input: {
    bookingId: string;
    scannedByUserId: string;
    source: AttendanceSource;
    scannedPassId?: string;
  },
  userId: string,
): Promise<MarkClassAttendanceResult> {
  const initial = await db.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      userId: true,
      offerBoxEntitlementId: true,
      userMembershipId: true,
    },
  });

  if (
    !initial ||
    initial.userId !== userId ||
    !initial.offerBoxEntitlementId ||
    initial.userMembershipId !== null
  ) {
    return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
  }

  const entitlementId = initial.offerBoxEntitlementId;

  const issuedPass = await ensureOfferBoxAttendancePass(
    entitlementId,
    userId,
  );

  if (!issuedPass) {
    return { ok: false, code: "ATTENDANCE_PASS_UNAVAILABLE" };
  }

  if (
    issuedPass.status !== "active" ||
    (input.source === "qr" && input.scannedPassId !== issuedPass.id)
  ) {
    return { ok: false, code: "ATTENDANCE_PASS_NOT_ACTIVE" };
  }

  return db.$transaction(async (tx) => {
    await lockMembershipLifecycleUserTx(
      asDbTransactionClient(tx),
      userId,
    );

    await tx.$queryRaw`
      SELECT id FROM OfferBoxEntitlement
      WHERE id = ${entitlementId}
      FOR UPDATE
    `;

    await tx.$queryRaw`
      SELECT id FROM Booking
      WHERE id = ${input.bookingId}
      FOR UPDATE
    `;

    const booking = await tx.booking.findUnique({
      where: { id: input.bookingId },
      include: {
        user: { select: { name: true, isActive: true } },
        schedule: {
          include: {
            class: { include: { trainer: true } },
          },
        },
      },
    });

    if (!booking) {
      return { ok: false, code: "BOOKING_NOT_FOUND" };
    }

    if (
      booking.userId !== userId ||
      booking.userMembershipId !== null ||
      booking.offerBoxEntitlementId !== entitlementId ||
      !booking.user.isActive
    ) {
      return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
    }

    const entitlement = await tx.offerBoxEntitlement.findUnique({
      where: { id: entitlementId },
      include: {
        purchase: {
          select: {
            userId: true,
            status: true,
            paidAt: true,
            redeemedUserMembershipId: true,
          },
        },
      },
    });

    if (
      !entitlement ||
      entitlement.userId !== userId ||
      entitlement.status !== "active" ||
      entitlement.purchase.userId !== userId ||
      entitlement.purchase.status !== "redeemed" ||
      !entitlement.purchase.paidAt ||
      entitlement.purchase.redeemedUserMembershipId !== null
    ) {
      return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
    }

    await tx.$queryRaw`
      SELECT id FROM AttendancePass
      WHERE id = ${issuedPass.id}
      FOR UPDATE
    `;

    const pass = await tx.attendancePass.findUnique({
      where: { id: issuedPass.id },
    });

    if (
      !pass ||
      pass.userId !== userId ||
      pass.offerBoxEntitlementId !== entitlementId ||
      pass.userMembershipId !== null ||
      pass.privateSessionApplicationId !== null ||
      pass.kind !== "offer_box" ||
      pass.status !== "active"
    ) {
      return { ok: false, code: "ATTENDANCE_PASS_NOT_ACTIVE" };
    }

    const details = {
      bookingId: booking.id,
      customerName: booking.user.name ?? "Member",
      className: booking.schedule.class.name,
      trainerName: booking.schedule.class.trainer.name,
      time: booking.schedule.time,
    };

    if (booking.status === "attended") {
      return {
        ok: true,
        status: "already_attended",
        ...details,
      };
    }

    if (booking.status !== "confirmed") {
      return { ok: false, code: "BOOKING_NOT_CONFIRMED" };
    }

    const slot = scheduleSlotInstant(
      booking.schedule.date,
      booking.schedule.time,
    );

    if (!Number.isFinite(slot.getTime())) {
      return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
    }

    if (slot.getTime() > Date.now()) {
      return { ok: false, code: "FUTURE_SESSION" };
    }

    const slotDay = cairoCalendarDateKey(slot);

    if (
      slotDay < cairoCalendarDateKey(entitlement.startDate) ||
      slotDay > cairoCalendarDateKey(entitlement.endDate)
    ) {
      return { ok: false, code: "BOOKING_NOT_OPERATIONAL" };
    }

    const claimed = await tx.booking.updateMany({
      where: {
        id: booking.id,
        userId,
        userMembershipId: null,
        offerBoxEntitlementId: entitlementId,
        scheduleId: booking.scheduleId,
        status: "confirmed",
      },
      data: { status: "attended" },
    });

    if (claimed.count !== 1) {
      return { ok: false, code: "BOOKING_STATUS_CHANGED" };
    }

    const checkIn = await tx.attendanceCheckIn.create({
      data: {
        passId: pass.id,
        userId,
        bookingId: booking.id,
        scheduleId: booking.scheduleId,
        scannedByUserId: input.scannedByUserId,
        checkInType: "class",
      },
    });

    const attended = await tx.booking.findMany({
      where: {
        offerBoxEntitlementId: entitlementId,
        userMembershipId: null,
        userId,
        status: "attended",
      },
      select: { entitlementUnits: true },
    });

    const sessionsUsed = attended.reduce(
      (total, row) => total + getBookingEntitlementUnits(row),
      0,
    );

    await tx.attendancePass.update({
      where: { id: pass.id },
      data: { lastUsedAt: new Date() },
    });

    await tx.notification.create({
      data: {
        userId,
        title: `تم تسجيل حضور ${booking.schedule.class.name}`,
        body: "تم تسجيل حضور حصة العرض المستقل.",
        type: "success",
      },
    });

    return {
      ok: true,
      status: "checked_in",
      ...details,
      checkInId: checkIn.id,
      membershipExpired: false,
      sessionsUsed,
      sessionsRemaining:
        entitlement.totalSessions === null
          ? null
          : Math.max(0, entitlement.totalSessions - sessionsUsed),
    };
  });
}

export type ConsumePrivateSessionResult =
  | {
      ok: true;
      status: "checked_in";
      checkInId: string;
      type: "private" | "mini_private";
      customerName: string;
      trainerName: string;
      remainingSessions: number;
    }
  | {
      ok: false;
      code:
        | "PASS_NOT_FOUND"
        | "PASS_NOT_ACTIVE"
        | "PRIVATE_APPLICATION_NOT_FOUND"
        | "PRIVATE_APPLICATION_NOT_ELIGIBLE"
        | "PRIVATE_APPLICATION_EXPIRED"
        | "PRIVATE_SESSIONS_EXHAUSTED";
    };

/*
 * Consume one Private / Mini Private session.
 *
 * The AttendancePass row is the serialization point:
 * there is exactly one pass per privateSessionApplicationId by schema.
 * SELECT ... FOR UPDATE ensures concurrent scans for the same entitlement
 * cannot calculate and consume the same remaining session.
 */
export async function consumePrivateSession(input: {
  passId: string;
  scannedByUserId: string;
}): Promise<ConsumePrivateSessionResult> {
  return db.$transaction(async (tx) => {
    const lockedPassRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM \`AttendancePass\`
      WHERE id = ${input.passId}
      FOR UPDATE
    `;

    if (lockedPassRows.length !== 1) {
      return {
        ok: false as const,
        code: "PASS_NOT_FOUND" as const,
      };
    }

    const pass = await tx.attendancePass.findUnique({
      where: {
        id: input.passId,
      },
      include: {
        user: {
          select: {
            name: true,
            isActive: true,
          },
        },
        privateSessionApplication: {
          include: {
            trainer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!pass) {
      return {
        ok: false as const,
        code: "PASS_NOT_FOUND" as const,
      };
    }

    if (pass.status !== "active" || !pass.user.isActive) {
      return {
        ok: false as const,
        code: "PASS_NOT_ACTIVE" as const,
      };
    }

    const application = pass.privateSessionApplication;

    if (!application) {
      return {
        ok: false as const,
        code: "PRIVATE_APPLICATION_NOT_FOUND" as const,
      };
    }

    if (!isPrivateApplicationEligibleForAttendance(application)) {
      const expired =
        application.expiresAt != null &&
        new Date().getTime() > application.expiresAt.getTime();

      if (expired) {
        await tx.attendancePass.updateMany({
          where: {
            id: pass.id,
            status: "active",
          },
          data: {
            status: "expired",
          },
        });

        return {
          ok: false as const,
          code: "PRIVATE_APPLICATION_EXPIRED" as const,
        };
      }

      return {
        ok: false as const,
        code: "PRIVATE_APPLICATION_NOT_ELIGIBLE" as const,
      };
    }

    /*
     * Recalculate consumption AFTER acquiring the row lock.
     * No pre-transaction remaining-session value is trusted.
     */
    const usedCount = await tx.attendanceCheckIn.count({
      where: {
        privateSessionApplicationId: application.id,
      },
    });

    const remainingBefore = getPrivateSessionsRemaining(
      usedCount,
      application.sessionsCount,
    );

    if (remainingBefore <= 0) {
      await tx.attendancePass.updateMany({
        where: {
          id: pass.id,
          status: "active",
        },
        data: {
          status: "expired",
        },
      });

      return {
        ok: false as const,
        code: "PRIVATE_SESSIONS_EXHAUSTED" as const,
      };
    }

    const created = await tx.attendanceCheckIn.create({
      data: {
        passId: pass.id,
        userId: pass.userId,
        privateSessionApplicationId: application.id,
        scannedByUserId: input.scannedByUserId,
        checkInType:
          application.type === "mini_private"
            ? "mini_private"
            : "private",
      },
    });

    const remainingSessions = remainingBefore - 1;

    await tx.attendancePass.update({
      where: {
        id: pass.id,
      },
      data: {
        lastUsedAt: new Date(),
        status:
          remainingSessions <= 0
            ? "expired"
            : "active",
      },
    });

    await tx.notification.create({
      data: {
        userId: pass.userId,
        title:
          application.type === "mini_private"
            ? "تم تسجيل حضور جلسة ميني برايفيت"
            : "تم تسجيل حضور جلسة برايفيت",
        body: `تم تسجيل حضورك مع المدربة ${application.trainer.name}.`,
        type: "success",
      },
    }).catch(() => null);

    return {
      ok: true as const,
      status: "checked_in" as const,
      checkInId: created.id,
      type:
        application.type === "mini_private"
          ? ("mini_private" as const)
          : ("private" as const),
      customerName: pass.user.name ?? "Member",
      trainerName: application.trainer.name,
      remainingSessions,
    };
  });
}
