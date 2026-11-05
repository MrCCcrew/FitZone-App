import type { Prisma } from "@prisma/client";
import {
  cairoCalendarDateKey,
  scheduleSlotInstant,
} from "@/lib/fitzone-time";
import {
  getBookingEntitlementUnits,
} from "@/lib/membership-session-units";

export type MembershipCarryoverReason =
  | "eligible"
  | "applied"
  | "already_applied"
  | "no_source"
  | "multiple_active_sources"
  | "different_plan"
  | "different_offer"
  | "incompatible_entitlement"
  | "source_unlimited"
  | "target_unlimited"
  | "target_trial"
  | "target_not_active"
  | "target_period_invalid"
  | "source_overallocated"
  | "source_changed_during_apply"
  | "zero_balance"
  | "pending_exchange_request"
  | "booking_outside_target_period";

const BLOCKING_MEMBERSHIP_CARRYOVER_REASONS =
  new Set<MembershipCarryoverReason>([
    "multiple_active_sources",
    "different_plan",
    "different_offer",
    "incompatible_entitlement",
    "target_not_active",
    "target_period_invalid",
    "source_overallocated",
    "source_changed_during_apply",
    "pending_exchange_request",
    "booking_outside_target_period",
  ]);

export function isBlockingMembershipCarryoverReason(
  reason: MembershipCarryoverReason,
): boolean {
  return BLOCKING_MEMBERSHIP_CARRYOVER_REASONS.has(
    reason,
  );
}

export type MembershipCarryoverTargetContract = {
  membershipId: string;
  offerId: string | null;
  eligibilitySnapshot: string | null;
  allowedClassTypesSnapshot: string | null;
  baseSessions: number | null;
  startDate: Date;
  endDate: Date;
  kind: string;
};

export type MembershipCarryoverPreview = {
  eligible: boolean;
  reason: MembershipCarryoverReason;
  sourceMembershipId: string | null;
  baseSessions: number | null;
  freeCarryoverSessions: number;
  transferredReservedUnits: number;
  carryoverSessions: number;
  expectedTotalSessions: number | null;
  transferableBookingIds: string[];
};

export type MembershipCarryoverApplyResult =
  MembershipCarryoverPreview & {
    appliedAt: Date | null;
  };

type CanonicalSnapshot = {
  valid: boolean;
  value: string | null;
};

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(stableJsonValue);
    return normalized.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      output[key] = stableJsonValue(record[key]);
    }

    return output;
  }

  return value;
}

function canonicalizeSnapshot(
  value: string | null,
): CanonicalSnapshot {
  if (value === null) {
    return {
      valid: true,
      value: null,
    };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return {
      valid: true,
      value: JSON.stringify(stableJsonValue(parsed)),
    };
  } catch {
    return {
      valid: false,
      value: null,
    };
  }
}

function snapshotsMatch(
  left: string | null,
  right: string | null,
): boolean {
  const a = canonicalizeSnapshot(left);
  const b = canonicalizeSnapshot(right);

  return (
    a.valid &&
    b.valid &&
    a.value === b.value
  );
}

function emptyPreview(
  reason: MembershipCarryoverReason,
  baseSessions: number | null,
  sourceMembershipId: string | null = null,
): MembershipCarryoverPreview {
  return {
    eligible: false,
    reason,
    sourceMembershipId,
    baseSessions,
    freeCarryoverSessions: 0,
    transferredReservedUnits: 0,
    carryoverSessions: 0,
    expectedTotalSessions: baseSessions,
    transferableBookingIds: [],
  };
}

/**
 * Read-only authoritative carryover evaluation.
 *
 * Important:
 * - confirmed ordinary bookings are reserved entitlement and are transferred
 *   with the renewal instead of being silently invalidated by supersession.
 * - confirmed make-up bookings remain attached to the old membership because
 *   FitZone explicitly permits make-up attendance on an expired membership.
 * - attended bookings remain historical on the old membership.
 * - no mutation happens in this function.
 */
export async function previewMembershipSessionCarryoverTx(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    target: MembershipCarryoverTargetContract;
    excludeMembershipId?: string | null;
  },
): Promise<MembershipCarryoverPreview> {
  const { userId, target } = input;

  if (target.kind === "trial") {
    return emptyPreview(
      "target_trial",
      target.baseSessions,
    );
  }

  if (
    target.baseSessions === null ||
    target.baseSessions <= 0
  ) {
    return emptyPreview(
      "target_unlimited",
      target.baseSessions,
    );
  }

  const targetStartDay =
    cairoCalendarDateKey(target.startDate);
  const targetEndDay =
    cairoCalendarDateKey(target.endDate);

  if (targetEndDay < targetStartDay) {
    return emptyPreview(
      "target_period_invalid",
      target.baseSessions,
    );
  }

  const activeMemberships =
    await tx.userMembership.findMany({
      where: {
        userId,
        status: "active",
        ...(input.excludeMembershipId
          ? {
              id: {
                not: input.excludeMembershipId,
              },
            }
          : {}),
      },
      orderBy: [
        {
          endDate: "asc",
        },
        {
          startDate: "asc",
        },
      ],
      select: {
        id: true,
        membershipId: true,
        offerId: true,
        totalSessions: true,
        eligibilitySnapshot: true,
        allowedClassTypesSnapshot: true,
        membership: {
          select: {
            kind: true,
          },
        },
      },
    });

  const paidSources =
    activeMemberships.filter(
      (membership) =>
        membership.membership.kind !== "trial",
    );

  if (paidSources.length === 0) {
    return emptyPreview(
      "no_source",
      target.baseSessions,
    );
  }

  /*
   * Carryover is deliberately one-source-only.
   *
   * More than one active paid membership is an anomalous state. Never choose
   * one implicitly because supersession expires older active memberships and
   * could otherwise discard entitlement from an unselected source.
   */
  if (paidSources.length > 1) {
    return emptyPreview(
      "multiple_active_sources",
      target.baseSessions,
    );
  }

  const samePlanSources =
    paidSources.filter(
      (membership) =>
        membership.membershipId ===
        target.membershipId,
    );

  if (samePlanSources.length === 0) {
    return emptyPreview(
      "different_plan",
      target.baseSessions,
    );
  }

  const sameOfferSources =
    samePlanSources.filter(
      (membership) =>
        membership.offerId === target.offerId,
    );

  if (sameOfferSources.length === 0) {
    return emptyPreview(
      "different_offer",
      target.baseSessions,
      samePlanSources[0]?.id ?? null,
    );
  }

  /*
   * Compatibility is entitlement-based.
   *
   * offerSnapshot is intentionally not compared in full because it also
   * freezes commercial/display terms such as title, price, duration and
   * purchased session count.
   *
   * bookingPatternSnapshot is intentionally not required to match because it
   * describes the recurring schedule chosen for that individual purchase and
   * may legitimately change on renewal.
   *
   * Automatic carryover therefore requires the same plan, same offer identity
   * and matching frozen class eligibility. Transferable future bookings are
   * separately validated against the renewed membership period.
   */
  const source =
    sameOfferSources.find(
      (membership) =>
        snapshotsMatch(
          membership.eligibilitySnapshot,
          target.eligibilitySnapshot,
        ) &&
        snapshotsMatch(
          membership.allowedClassTypesSnapshot,
          target.allowedClassTypesSnapshot,
        ),
    ) ?? null;

  if (!source) {
    return emptyPreview(
      "incompatible_entitlement",
      target.baseSessions,
      sameOfferSources[0]?.id ?? null,
    );
  }

  if (
    source.totalSessions === null ||
    source.totalSessions <= 0
  ) {
    return emptyPreview(
      "source_unlimited",
      target.baseSessions,
      source.id,
    );
  }

  const pendingExchangeRequests =
    await tx.classExchangeRequest.count({
      where: {
        userMembershipId: source.id,
        status: "pending",
      },
    });

  if (pendingExchangeRequests > 0) {
    return emptyPreview(
      "pending_exchange_request",
      target.baseSessions,
      source.id,
    );
  }

  const bookings =
    await tx.booking.findMany({
      where: {
        userMembershipId: source.id,
        status: {
          in: [
            "confirmed",
            "attended",
          ],
        },
      },
      select: {
        id: true,
        status: true,
        entitlementUnits: true,
        isMakeup: true,
        schedule: {
          select: {
            date: true,
            time: true,
          },
        },
      },
    });

  let attendedUnits = 0;
  let confirmedMakeupUnits = 0;
  let confirmedOrdinaryUnits = 0;

  const ordinaryConfirmedBookings =
    bookings.filter((booking) => {
      const units =
        getBookingEntitlementUnits(booking);

      if (booking.status === "attended") {
        attendedUnits += units;
        return false;
      }

      if (
        booking.status === "confirmed" &&
        booking.isMakeup === true
      ) {
        confirmedMakeupUnits += units;
        return false;
      }

      if (booking.status === "confirmed") {
        confirmedOrdinaryUnits += units;
        return true;
      }

      return false;
    });

  const committedUnits =
    attendedUnits +
    confirmedMakeupUnits +
    confirmedOrdinaryUnits;

  if (
    committedUnits >
    source.totalSessions
  ) {
    return emptyPreview(
      "source_overallocated",
      target.baseSessions,
      source.id,
    );
  }

  const freeCarryoverSessions =
    source.totalSessions -
    committedUnits;

  /*
   * A confirmed ordinary reservation is not free balance, but it is still
   * unused entitlement belonging to the old membership.
   *
   * When supersession expires the old membership, these bookings must move to
   * the renewed membership. Their entitlement units are therefore preserved
   * in the new total alongside the truly-free remaining balance.
   */
  const carryoverSessions =
    freeCarryoverSessions +
    confirmedOrdinaryUnits;

  if (carryoverSessions <= 0) {
    return emptyPreview(
      "zero_balance",
      target.baseSessions,
      source.id,
    );
  }

  for (
    const booking of
    ordinaryConfirmedBookings
  ) {
    const bookingDay =
      cairoCalendarDateKey(
        scheduleSlotInstant(
          booking.schedule.date,
          booking.schedule.time,
        ),
      );

    if (
      bookingDay < targetStartDay ||
      bookingDay > targetEndDay
    ) {
      return emptyPreview(
        "booking_outside_target_period",
        target.baseSessions,
        source.id,
      );
    }
  }

  return {
    eligible: true,
    reason: "eligible",
    sourceMembershipId: source.id,
    baseSessions: target.baseSessions,
    freeCarryoverSessions,
    transferredReservedUnits:
      confirmedOrdinaryUnits,
    carryoverSessions,
    expectedTotalSessions:
      target.baseSessions +
      carryoverSessions,
    transferableBookingIds:
      ordinaryConfirmedBookings.map(
        (booking) => booking.id,
      ),
  };
}

/**
 * Produces an authoritative carryover decision while holding the source
 * UserMembership row lock until the caller's transaction completes.
 *
 * This can be used BEFORE a paid pending membership becomes active.
 * It performs no carryover mutation by itself.
 */
export async function prepareMembershipSessionCarryoverTx(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    target: MembershipCarryoverTargetContract;
    excludeMembershipId?: string | null;
  },
): Promise<MembershipCarryoverPreview> {
  const initialPreview =
    await previewMembershipSessionCarryoverTx(
      tx,
      input,
    );

  /*
   * Some legitimate terminal previews have no source membership at all
   * (for example no_source / different_plan). There is nothing to lock.
   */
  if (!initialPreview.sourceMembershipId) {
    return initialPreview;
  }

  /*
   * Serialize against customer booking creation, which also locks the
   * UserMembership row before its authoritative entitlement recheck.
   */
  const lockedSourceRows =
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT \`id\`
      FROM \`UserMembership\`
      WHERE \`id\` = ${initialPreview.sourceMembershipId}
        AND \`userId\` = ${input.userId}
        AND \`status\` = 'active'
      FOR UPDATE
    `;

  if (lockedSourceRows.length !== 1) {
    return emptyPreview(
      "source_changed_during_apply",
      input.target.baseSessions,
      initialPreview.sourceMembershipId,
    );
  }

  /*
   * Never trust the pre-lock balance. A booking may have committed while
   * this transaction was waiting for the membership row lock.
   */
  const authoritativePreview =
    await previewMembershipSessionCarryoverTx(
      tx,
      input,
    );

  if (
    authoritativePreview.sourceMembershipId !==
    initialPreview.sourceMembershipId
  ) {
    return emptyPreview(
      "source_changed_during_apply",
      input.target.baseSessions,
      initialPreview.sourceMembershipId,
    );
  }

  return authoritativePreview;
}

/**
 * Applies carryover inside the caller's existing membership lifecycle
 * transaction and lock.
 *
 * The caller MUST already hold lockMembershipLifecycleUserTx() for userId.
 * This function intentionally does not expire the source membership; existing
 * authoritative supersession remains owned by the activation/subscribe flow.
 */
export async function applyMembershipSessionCarryoverTx(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    targetMembershipId: string;
    appliedAt?: Date;
  },
): Promise<MembershipCarryoverApplyResult> {
  const target =
    await tx.userMembership.findUnique({
      where: {
        id: input.targetMembershipId,
      },
      select: {
        id: true,
        userId: true,
        membershipId: true,
        offerId: true,
        status: true,
        startDate: true,
        endDate: true,
        totalSessions: true,
        baseSessions: true,
        carryoverSessions: true,
        carryoverFromMembershipId: true,
        carryoverAppliedAt: true,
        eligibilitySnapshot: true,
        allowedClassTypesSnapshot: true,
        membership: {
          select: {
            kind: true,
          },
        },
      },
    });

  if (
    !target ||
    target.userId !== input.userId
  ) {
    return {
      ...emptyPreview(
        "no_source",
        null,
      ),
      appliedAt: null,
    };
  }

  const baseSessions =
    target.baseSessions ??
    target.totalSessions;

  if (target.status !== "active") {
    return {
      ...emptyPreview(
        "target_not_active",
        baseSessions,
      ),
      appliedAt: null,
    };
  }

  if (
    target.carryoverAppliedAt !== null ||
    target.carryoverFromMembershipId !== null
  ) {
    return {
      eligible: true,
      reason: "already_applied",
      sourceMembershipId:
        target.carryoverFromMembershipId,
      baseSessions,
      freeCarryoverSessions: 0,
      transferredReservedUnits: 0,
      carryoverSessions:
        target.carryoverSessions,
      expectedTotalSessions:
        target.totalSessions,
      transferableBookingIds: [],
      appliedAt:
        target.carryoverAppliedAt,
    };
  }

  const previewInput = {
    userId: input.userId,
    excludeMembershipId: target.id,
    target: {
      membershipId:
        target.membershipId,
      offerId:
        target.offerId,
      eligibilitySnapshot:
        target.eligibilitySnapshot,
      allowedClassTypesSnapshot:
        target.allowedClassTypesSnapshot,
      baseSessions,
      startDate:
        target.startDate,
      endDate:
        target.endDate,
      kind:
        target.membership.kind,
    },
  };

  const preview =
    await prepareMembershipSessionCarryoverTx(
      tx,
      previewInput,
    );

  if (
    !preview.eligible ||
    !preview.sourceMembershipId ||
    preview.expectedTotalSessions === null
  ) {
    return {
      ...preview,
      appliedAt: null,
    };
  }

  if (
    preview.transferableBookingIds.length > 0
  ) {
    const movedBookings =
      await tx.booking.updateMany({
        where: {
          id: {
            in:
              preview.transferableBookingIds,
          },
          userMembershipId:
            preview.sourceMembershipId,
          status: "confirmed",
          isMakeup: false,
        },
        data: {
          userMembershipId: target.id,
        },
      });

    if (
      movedBookings.count !==
      preview.transferableBookingIds.length
    ) {
      throw new Error(
        "MEMBERSHIP_CARRYOVER_BOOKING_RELINK_RACE",
      );
    }

    /*
     * Class Exchange cancellation is booking-driven, but the audit row also
     * stores membership lineage. Keep both sides aligned whenever an exchange
     * booking moves with renewal.
     */
    await tx.membershipClassExchange.updateMany({
      where: {
        bookingId: {
          in:
            preview.transferableBookingIds,
        },
        userMembershipId:
          preview.sourceMembershipId,
      },
      data: {
        userMembershipId:
          target.id,
      },
    });
  }

  const appliedAt =
    input.appliedAt ?? new Date();

  const claimed =
    await tx.userMembership.updateMany({
      where: {
        id: target.id,
        status: "active",
        carryoverAppliedAt: null,
        carryoverFromMembershipId: null,
      },
      data: {
        baseSessions,
        carryoverSessions:
          preview.carryoverSessions,
        carryoverFromMembershipId:
          preview.sourceMembershipId,
        carryoverAppliedAt: appliedAt,
        totalSessions:
          preview.expectedTotalSessions,
      },
    });

  if (claimed.count !== 1) {
    throw new Error(
      "MEMBERSHIP_CARRYOVER_ALREADY_CLAIMED",
    );
  }

  return {
    ...preview,
    reason: "applied",
    appliedAt,
  };
}
