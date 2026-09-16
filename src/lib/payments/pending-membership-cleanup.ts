import { asDbTransactionClient, db } from "@/lib/db";
import { releaseMarketingCheckoutLockTx } from "@/lib/marketing-conversion-service";

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}

export type PendingMembershipCleanupResult =
  | {
      cleaned: true;
      membershipId: string;
      userId: string;
      planName: string;
      deletedBookings: number;
    }
  | {
      cleaned: false;
      membershipId: string;
      reason:
        | "not_found"
        | "not_pending"
        | "not_expired"
        | "paid_transaction_exists"
        | "lost_race";
    };

export async function cleanupExpiredPendingMembership(
  membershipId: string,
  now = new Date(),
): Promise<PendingMembershipCleanupResult> {
  return db.$transaction(async (tx) => {
    const membership = await tx.userMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        userId: true,
        status: true,
        pendingExpiresAt: true,
        membership: {
          select: { name: true },
        },
      },
    });

    if (!membership) {
      return {
        cleaned: false,
        membershipId,
        reason: "not_found",
      };
    }

    if (membership.status !== "pending_payment") {
      return {
        cleaned: false,
        membershipId,
        reason: "not_pending",
      };
    }

    if (!membership.pendingExpiresAt || membership.pendingExpiresAt > now) {
      return {
        cleaned: false,
        membershipId,
        reason: "not_expired",
      };
    }

    // Never timeout-clean a membership that already has a paid transaction.
    const paidTx = await tx.paymentTransaction.findFirst({
      where: {
        membershipId,
        status: "paid",
      },
      select: { id: true },
    });

    if (paidTx) {
      return {
        cleaned: false,
        membershipId,
        reason: "paid_transaction_exists",
      };
    }

    /*
     * Atomic claim.
     *
     * The webhook activation and this cleanup both require
     * status=pending_payment. Only one side may win.
     *
     * Include pendingExpiresAt in the claim so this helper can never cancel
     * a still-valid pending membership even if called from another code path.
     */
    const claimed = await tx.userMembership.updateMany({
      where: {
        id: membershipId,
        status: "pending_payment",
        pendingExpiresAt: { lte: now },
      },
      data: {
        status: "cancelled",
        pendingExpiresAt: null,
      },
    });

    if (claimed.count !== 1) {
      return {
        cleaned: false,
        membershipId,
        reason: "lost_race",
      };
    }

    // The payment timeout won the race. Release only the marketing conversion
    // frozen to THIS membership so the lead can be followed up again.
    await releaseMarketingCheckoutLockTx(
      asDbTransactionClient(tx),
      membershipId,
    );

    const bookings = await tx.booking.findMany({
      where: {
        userMembershipId: membershipId,
      },
      select: {
        id: true,
        scheduleId: true,
        status: true,
        schedule: {
          select: {
            classId: true,
            date: true,
            time: true,
          },
        },
      },
    });

    // Preserve the exact deleted bookings for verified late-payment recovery.
    if (bookings.length > 0) {
      const paymentTx = await tx.paymentTransaction.findFirst({
        where: {
          membershipId,
          status: { in: ["pending", "requires_action"] },
        },
        select: {
          id: true,
          metadata: true,
        },
      });

      if (paymentTx) {
        const existingMetadata = parseJson(paymentTx.metadata) ?? {};

        const bookingSnapshot = bookings.map((booking) => ({
          scheduleId: booking.scheduleId,
          classId: booking.schedule.classId,
          date: booking.schedule.date.toISOString(),
          time: booking.schedule.time,
          status: booking.status,
        }));

        await tx.paymentTransaction.update({
          where: { id: paymentTx.id },
          data: {
            metadata: stringifyJson({
              ...existingMetadata,
              deletedBookingsSnapshot: {
                userMembershipId: membershipId,
                bookings: bookingSnapshot,
                deletedAt: now.toISOString(),
                reason: "timeout_cleanup",
              },
            }),
          },
        });
      }
    }

    // Pending Paymob transaction belongs to the expired attempt.
    await tx.paymentTransaction.updateMany({
      where: {
        membershipId,
        status: { in: ["pending", "requires_action"] },
      },
      data: {
        status: "cancelled",
      },
    });

    // Delete reservations owned by this expired membership.
    await tx.booking.deleteMany({
      where: {
        userMembershipId: membershipId,
      },
    });

    /*
     * Restore seats only for confirmed bookings.
     * Multiple historical rows for the same schedule are grouped so capacity
     * is updated exactly once per schedule.
     */
    const spotRestorations = new Map<string, number>();

    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;

      spotRestorations.set(
        booking.scheduleId,
        (spotRestorations.get(booking.scheduleId) ?? 0) + 1,
      );
    }

    for (const [scheduleId, count] of spotRestorations) {
      const schedule = await tx.schedule.findUnique({
        where: { id: scheduleId },
        select: {
          availableSpots: true,
          class: {
            select: { maxSpots: true },
          },
        },
      });

      if (!schedule) continue;

      const restoredSpots = Math.min(
        schedule.availableSpots + count,
        schedule.class.maxSpots,
      );

      await tx.schedule.update({
        where: { id: scheduleId },
        data: {
          availableSpots: restoredSpots,
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: membership.userId,
        title: "❌ تم إلغاء اشتراكك تلقائيًا",
        body:
          `تم إلغاء اشتراك "${membership.membership.name}" ` +
          "لعدم إتمام الدفع خلال 60 دقيقة. يمكنك الاشتراك مرة أخرى في أي وقت.",
        type: "error",
      },
    });

    console.info(
      `[PENDING_MEMBERSHIP_CLEANUP] ${membershipId}: ` +
        `${bookings.length} bookings released`,
    );

    return {
      cleaned: true,
      membershipId,
      userId: membership.userId,
      planName: membership.membership.name,
      deletedBookings: bookings.length,
    };
  });
}

export type ReusablePendingMembershipCheckout = {
  membershipId: string;
  transactionId: string;
  checkoutUrl: string;
  endDate: Date;
  pendingExpiresAt: Date;
};

/**
 * Resume an existing still-valid pending checkout only when it represents
 * the exact same purchase source and exact same week-1 schedule selection.
 *
 * This deliberately does NOT:
 * - create another UserMembership
 * - create another Booking
 * - decrement capacity
 * - rebuild bookingPatternSnapshot
 * - create another commission/referral attempt
 */
export type SubscribeAttemptFingerprint = {
  membershipId: string | null;
  offerId: string | null;
  scheduleIds: string[];
  paymentMethod: string;
  discountCode: string | null;
  walletDeduct: number;
  pointsDeduct: number;
  selectedMonths: number | null;
  startDate: string | null;
  partnerCode: string | null;
  memberBenefitCode: string | null;
  affiliateRef: string | null;
  agentRef: string | null;

  // Coach Membership economic identity.
  // Optional only for backwards compatibility with fingerprints created
  // before Coach Membership existed; normalization converts missing to null.
  coachMembershipTrainerId?: string | null;
};

function normalizeFingerprint(
  value: SubscribeAttemptFingerprint,
): SubscribeAttemptFingerprint {
  return {
    ...value,
    scheduleIds: [
      ...new Set(
        value.scheduleIds
          .filter((id) => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].sort(),

    // Canonicalize legacy/missing fingerprints to null.
    // This preserves old regular pending checkouts while ensuring
    // different Coach Membership trainers can never share a checkout.
    coachMembershipTrainerId:
      typeof value.coachMembershipTrainerId === "string"
        ? value.coachMembershipTrainerId.trim() || null
        : null,
  };
}

export async function findReusablePendingMembershipCheckout(input: {
  userId: string;
  fingerprint: SubscribeAttemptFingerprint;
  now?: Date;
}): Promise<ReusablePendingMembershipCheckout | null> {
  const now = input.now ?? new Date();

  const requestedFingerprint = normalizeFingerprint(input.fingerprint);

  const requestedScheduleIds = requestedFingerprint.scheduleIds;

  const sourceWhere = requestedFingerprint.offerId
    ? { offerId: requestedFingerprint.offerId }
    : requestedFingerprint.membershipId
      ? {
          membershipId: requestedFingerprint.membershipId,
          offerId: null,
        }
      : null;

  if (!sourceWhere) {
    return null;
  }

  const pendingMemberships = await db.userMembership.findMany({
    where: {
      userId: input.userId,
      status: "pending_payment",
      pendingExpiresAt: {
        gt: now,
      },
      ...sourceWhere,
    },
    orderBy: {
      pendingExpiresAt: "desc",
    },
    select: {
      id: true,
      endDate: true,
      pendingExpiresAt: true,
    },
  });

  for (const membership of pendingMemberships) {
    if (!membership.pendingExpiresAt) continue;

    const transaction = await db.paymentTransaction.findFirst({
      where: {
        membershipId: membership.id,
        userId: input.userId,
        purpose: "membership",
        status: {
          in: ["pending", "requires_action"],
        },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        checkoutUrl: true,
        metadata: true,
      },
    });

    if (!transaction?.checkoutUrl) {
      continue;
    }

    const metadata = parseJson(transaction.metadata);

    const storedFingerprintRaw = metadata?.subscribeAttemptFingerprint;

    if (!storedFingerprintRaw || typeof storedFingerprintRaw !== "object") {
      // Legacy pending transaction: never guess economic identity.
      continue;
    }

    const storedFingerprint = normalizeFingerprint(
      storedFingerprintRaw as SubscribeAttemptFingerprint,
    );

    if (
      JSON.stringify(storedFingerprint) !== JSON.stringify(requestedFingerprint)
    ) {
      continue;
    }

    const recovery = metadata?.bookingRecoveryData;
    const storedRaw: unknown[] =
      recovery &&
      typeof recovery === "object" &&
      Array.isArray((recovery as Record<string, unknown>).selectedScheduleIds)
        ? ((recovery as Record<string, unknown>)
            .selectedScheduleIds as unknown[])
        : [];

    const storedScheduleIds = [
      ...new Set(
        storedRaw
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].sort();

    if (
      storedScheduleIds.length !== requestedScheduleIds.length ||
      storedScheduleIds.some((id, index) => id !== requestedScheduleIds[index])
    ) {
      continue;
    }

    return {
      membershipId: membership.id,
      transactionId: transaction.id,
      checkoutUrl: transaction.checkoutUrl,
      endDate: membership.endDate,
      pendingExpiresAt: membership.pendingExpiresAt,
    };
  }

  return null;
}

export async function cleanupExpiredPendingMembershipsForUser(
  userId: string,
  now = new Date(),
) {
  const expired = await db.userMembership.findMany({
    where: {
      userId,
      status: "pending_payment",
      pendingExpiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
  });

  const results: PendingMembershipCleanupResult[] = [];

  for (const membership of expired) {
    results.push(await cleanupExpiredPendingMembership(membership.id, now));
  }

  return results;
}
