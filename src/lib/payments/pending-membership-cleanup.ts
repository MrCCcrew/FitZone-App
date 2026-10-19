import { asDbTransactionClient, db } from "@/lib/db";
import {
  canSettleExpiredPaymobOrder,
  type PaymobUnpaidOrderProof,
} from "@/lib/payments/paymob-order-unpaid-proof";
import { releaseMarketingCheckoutLockTx } from "@/lib/marketing-conversion-service";
import { validReusableMembershipCheckoutUrl } from "@/lib/payments/membership-pending-session-validity";

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
        | "provider_reconciliation_required"
        | "paid_transaction_exists"
        | "lost_race";
    };

export async function cleanupExpiredPendingMembership(
  membershipId: string,
  now = new Date(),
  unpaidOrderProof: PaymobUnpaidOrderProof | null = null,
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
    /*
     * PAYMOB_TIMEOUT_FINALITY_GUARD
     *
     * An expired local hold and a non-paid local payment status
     * do not prove that Paymob did not capture funds.
     *
     * Until provider-wide reconciliation establishes finality,
     * retain the membership, bookings and frozen adjustments.
     *
     * This is intentionally fail-closed. A separate reconciliation
     * process must later settle these records.
     */
    const paymobPayments = await tx.paymentTransaction.findMany({
      where: {
        membershipId,
        provider: "paymob",
        purpose: "membership",
      },
      take: 2,
      select: {
        id: true,
        status: true,
        metadata: true,
        providerReference: true,
        externalReference: true,
        providerPayload: true,
        amount: true,
        currency: true,
        expiresAt: true,
      },
    });

    let manuallyReviewedPaymobPaymentId: string | null = null;

    if (paymobPayments.length > 0) {
      // Negative proof cannot be inferred from Paymob's last-attempt API.
      // A pair of separate master-authorized reviewers must cross-check
      // the full merchant transaction report after the original hold.
      if (paymobPayments.length !== 1) {
        return {
          cleaned: false,
          membershipId,
          reason: "provider_reconciliation_required",
        };
      }

      const payment = paymobPayments[0];
      const metadata = parseJson(payment.metadata);

      // Invalid financial metadata must never authorize a release.
      if (payment.metadata && !metadata) {
        return {
          cleaned: false,
          membershipId,
          reason: "provider_reconciliation_required",
        };
      }

      const automatedUnpaidProofValid = canSettleExpiredPaymobOrder({
        proof: unpaidOrderProof,
        payment,
        membershipExpiresAt: membership.pendingExpiresAt,
        now,
      });

      const review = metadata?.paymobNoChargeReview;
      const approval = review && typeof review === "object" && !Array.isArray(review)
        ? review as Record<string, unknown>
        : null;
      const entries = Array.isArray(approval?.approvals)
        ? approval.approvals
        : [];

      const validEntries = entries.length === 2 &&
        entries.every((value): value is { reviewerId: string; reviewedAt: string } =>
          Boolean(
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            typeof (value as Record<string, unknown>).reviewerId === "string" &&
            typeof (value as Record<string, unknown>).reviewedAt === "string",
          ),
        );

      const twoDistinctReviewers = validEntries &&
        entries[0].reviewerId !== entries[1].reviewerId;

      const afterHold = validEntries && entries.every((entry) => {
        const checkedAt = Date.parse(entry.reviewedAt);
        return Number.isFinite(checkedAt) &&
          checkedAt >= membership.pendingExpiresAt!.getTime() + 20 * 60_000 &&
          checkedAt <= now.getTime();
      });

      const safelyClosedProviderSession =
        !["paid", "retrying", "processing", "pending_payment"].includes(payment.status) &&
        (
          automatedUnpaidProofValid ||
          now.getTime() >= membership.pendingExpiresAt.getTime() + 20 * 60_000
        );

      if (
        !safelyClosedProviderSession ||
        (!automatedUnpaidProofValid && (
          !twoDistinctReviewers ||
          !afterHold ||
          typeof approval?.reportReference !== "string" ||
          approval.reportReference.length < 8
        ))
      ) {
        return {
          cleaned: false,
          membershipId,
          reason: "provider_reconciliation_required",
        };
      }

      // Mutually exclude late webhook settlements and admin release.
      // No customer wallet/seat adjustments occur unless this CAS and
      // the membership status claim both succeed in the SAME transaction.
      const paymentClaim = await tx.paymentTransaction.updateMany({
        where: {
          id: payment.id,
          membershipId,
          provider: "paymob",
          purpose: "membership",
          status: payment.status,
          metadata: payment.metadata,
          providerReference: payment.providerReference,
          externalReference: payment.externalReference,
          providerPayload: payment.providerPayload,
        },
        data: {
          status: "cancelled",
          metadata: stringifyJson({
            ...(metadata ?? {}),
            paymobNoChargeReview: automatedUnpaidProofValid
              ? {
                  source: "paymob_order_unpaid_automated",
                  orderId: unpaidOrderProof!.orderId,
                  checkedAt: unpaidOrderProof!.checkedAt,
                  paidAmountCents: 0,
                  settledAt: now.toISOString(),
                }
              : {
                  ...approval,
                  settledAt: now.toISOString(),
                },
          }),
        },
      });

      if (paymentClaim.count !== 1) {
        return {
          cleaned: false,
          membershipId,
          reason: "lost_race",
        };
      }

      manuallyReviewedPaymobPaymentId = payment.id;
    }
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
      if (manuallyReviewedPaymobPaymentId) {
        // Do not commit the Paymob cancellation claim without also
        // claiming the membership. Throw to roll back BOTH DB writes.
        throw new Error("PAYMOB_MANUAL_RELEASE_MEMBERSHIP_CAS_LOST");
      }
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
      const paymentTx = manuallyReviewedPaymobPaymentId
        ? await tx.paymentTransaction.findUnique({
            where: { id: manuallyReviewedPaymobPaymentId },
            select: { id: true, metadata: true },
          })
        : await tx.paymentTransaction.findFirst({
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

    /*
     * TIMEOUT_MEMBERSHIP_FINANCIAL_SETTLEMENT
     *
     * Reservation release and financial restoration must commit
     * atomically. A failed settlement rolls back the cancellation.
     *
     * Never guess which payment owns the original wallet/points
     * deduction. Multiple ownership snapshots require review.
     */
    const membershipPayments = await tx.paymentTransaction.findMany({
      where: {
        membershipId,
        userId: membership.userId,
        purpose: "membership",
      },
      select: {
        id: true,
        status: true,
        metadata: true,
      },
    });

    if (
      membershipPayments.some((payment) =>
        [
          "paid",
          "retrying",
          "processing",
          "pending_payment",
        ].includes(payment.status),
      )
    ) {
      throw new Error(
        "TIMEOUT_PAYMENT_SETTLEMENT_REQUIRES_RECONCILIATION",
      );
    }

    const financialOwners = membershipPayments.filter((payment) => {
      const metadata = parseJson(payment.metadata);

      if (payment.metadata && !metadata) {
        throw new Error(
          "TIMEOUT_PAYMENT_FINANCIAL_METADATA_INVALID",
        );
      }

      const adjustments = metadata?.paymentAdjustments;

      return (
        adjustments !== null &&
        typeof adjustments === "object" &&
        !Array.isArray(adjustments)
      );
    });

    if (financialOwners.length > 1) {
      throw new Error(
        "TIMEOUT_MULTIPLE_FINANCIAL_OWNERS_REQUIRE_REVIEW",
      );
    }

    if (financialOwners.length === 1) {
      const { restorePaymentTransactionAdjustmentsTx } =
        await import("@/lib/payments/service");

      await restorePaymentTransactionAdjustmentsTx(
        tx,
        financialOwners[0].id,
      );
    }
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

export type ScheduleReplaceablePendingMembershipCheckout =
  ReusablePendingMembershipCheckout & {
    startDate: Date;
    membershipKind: string;
    bookingPatternSnapshot: string;
    transactionMetadata: string | null;
    storedScheduleIds: string[];
    scheduleSelectionChanged: boolean;
  };

function economicFingerprintKey(
  value: SubscribeAttemptFingerprint,
) {
  const normalized = normalizeFingerprint(value);

  return JSON.stringify({
    membershipId: normalized.membershipId,
    offerId: normalized.offerId,
    paymentMethod: normalized.paymentMethod,
    discountCode: normalized.discountCode,
    walletDeduct: normalized.walletDeduct,
    pointsDeduct: normalized.pointsDeduct,
    selectedMonths: normalized.selectedMonths,
    startDate: normalized.startDate,
    partnerCode: normalized.partnerCode,
    memberBenefitCode: normalized.memberBenefitCode,
    affiliateRef: normalized.affiliateRef,
    agentRef: normalized.agentRef,
    coachMembershipTrainerId:
      normalized.coachMembershipTrainerId ?? null,
  });
}

export async function findScheduleReplaceablePendingMembershipCheckoutTx(input: {
  tx: any;
  userId: string;
  fingerprint: SubscribeAttemptFingerprint;
  now?: Date;
}): Promise<ScheduleReplaceablePendingMembershipCheckout | null> {
  const now = input.now ?? new Date();
  const requestedFingerprint = normalizeFingerprint(input.fingerprint);

  const sourceWhere = requestedFingerprint.offerId
    ? { offerId: requestedFingerprint.offerId }
    : requestedFingerprint.membershipId
      ? {
          membershipId: requestedFingerprint.membershipId,
          offerId: null,
        }
      : null;

  if (!sourceWhere) return null;

  let matchedCheckout: ScheduleReplaceablePendingMembershipCheckout | null =
    null;

  const pendingMemberships = await input.tx.userMembership.findMany({
    where: {
      userId: input.userId,
      status: "pending_payment",
      pendingExpiresAt: { gt: now },
      ...sourceWhere,
    },
    orderBy: { pendingExpiresAt: "desc" },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      pendingExpiresAt: true,
      bookingPatternSnapshot: true,
      membership: {
        select: { kind: true },
      },
    },
  });

  for (const membership of pendingMemberships) {
    if (
      !membership.pendingExpiresAt ||
      !membership.bookingPatternSnapshot
    ) {
      continue;
    }

    const transaction = await input.tx.paymentTransaction.findFirst({
      where: {
        membershipId: membership.id,
        userId: input.userId,
        purpose: "membership",
        status: { in: ["pending", "requires_action"] },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        checkoutUrl: true,
        expiresAt: true,
        metadata: true,
      },
    });

    const usableCheckoutUrl =
      validReusableMembershipCheckoutUrl({
        checkoutUrl: transaction?.checkoutUrl ?? null,
        expiresAt: transaction?.expiresAt ?? null,
        holdExpiresAt: membership.pendingExpiresAt,
        now,
      });

    if (!usableCheckoutUrl) continue;

    const metadata = parseJson(transaction.metadata);
    const storedRaw = metadata?.subscribeAttemptFingerprint;

    if (!storedRaw || typeof storedRaw !== "object") continue;

    const storedFingerprint = normalizeFingerprint(
      storedRaw as SubscribeAttemptFingerprint,
    );

    if (
      economicFingerprintKey(storedFingerprint) !==
      economicFingerprintKey(requestedFingerprint)
    ) {
      continue;
    }

    const recovery = metadata?.bookingRecoveryData;
    const recoveryScheduleIds = [
      ...new Set(
        recovery &&
        typeof recovery === "object" &&
        Array.isArray(
          (recovery as Record<string, unknown>).selectedScheduleIds,
        )
          ? (
              (recovery as Record<string, unknown>)
                .selectedScheduleIds as unknown[]
            )
              .filter((id): id is string => typeof id === "string")
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
      ),
    ].sort();

    if (
      recoveryScheduleIds.length !== storedFingerprint.scheduleIds.length ||
      recoveryScheduleIds.some(
        (id, index) => id !== storedFingerprint.scheduleIds[index],
      )
    ) {
      continue;
    }

    const scheduleSelectionChanged =
      storedFingerprint.scheduleIds.length !==
        requestedFingerprint.scheduleIds.length ||
      storedFingerprint.scheduleIds.some(
        (id, index) => id !== requestedFingerprint.scheduleIds[index],
      );

    const candidate: ScheduleReplaceablePendingMembershipCheckout = {
      membershipId: membership.id,
      transactionId: transaction.id,
      checkoutUrl: usableCheckoutUrl,
      startDate: membership.startDate,
      endDate: membership.endDate,
      pendingExpiresAt: membership.pendingExpiresAt,
      membershipKind: membership.membership.kind,
      bookingPatternSnapshot: membership.bookingPatternSnapshot,
      transactionMetadata: transaction.metadata,
      storedScheduleIds: storedFingerprint.scheduleIds,
      scheduleSelectionChanged,
    };

    if (matchedCheckout) {
      throw new Error("AMBIGUOUS_PENDING_MEMBERSHIP_CHECKOUT");
    }

    matchedCheckout = candidate;
  }

  return matchedCheckout;
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
        expiresAt: { gt: now },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        checkoutUrl: true,
        expiresAt: true,
        metadata: true,
      },
    });

    const usableCheckoutUrl =
      validReusableMembershipCheckoutUrl({
        checkoutUrl: transaction?.checkoutUrl ?? null,
        expiresAt: transaction?.expiresAt ?? null,
        holdExpiresAt: membership.pendingExpiresAt,
        now,
      });

    if (!usableCheckoutUrl || !transaction) {
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
      checkoutUrl: usableCheckoutUrl,
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
  if (expired.length === 0) return results;

  const { settleExpiredPendingMembership } =
    await import("@/lib/payments/expired-membership-settlement");

  for (const membership of expired) {
    const settled = await settleExpiredPendingMembership(membership.id);

    results.push(
      settled.kind === "paid_recovered"
        ? {
            cleaned: false,
            membershipId: membership.id,
            reason: "paid_transaction_exists",
          }
        : settled.cleanup,
    );
  }

  return results;
}
