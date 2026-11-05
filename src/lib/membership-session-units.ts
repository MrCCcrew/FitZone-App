export type MembershipBookingUnitLike = {
  status: string;
  entitlementUnits?: number | null;
};

/**
 * Backward-compatible unit normalization.
 *
 * A Booking created before Class Exchange did not conceptually carry a
 * weight, so missing/invalid values intentionally resolve to exactly 1.
 */
export function getBookingEntitlementUnits(
  booking: Pick<
    MembershipBookingUnitLike,
    "entitlementUnits"
  >,
): number {
  const value = booking.entitlementUnits;

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return 1;
  }

  return value;
}

export function sumMembershipBookingUnits(
  bookings: MembershipBookingUnitLike[],
  statuses: readonly string[],
): number {
  const allowed = new Set(statuses);

  return bookings.reduce(
    (total, booking) =>
      allowed.has(booking.status)
        ? total + getBookingEntitlementUnits(booking)
        : total,
    0,
  );
}

export type MembershipSessionUnitSummary = {
  reserved: number;
  used: number;
  noShow: number;
  cancelled: number;
};

/**
 * Status semantics intentionally match the existing FitZone domains:
 *
 * confirmed -> reserved
 * attended  -> used
 * noshow    -> separate bucket
 * cancelled -> no active entitlement reservation
 *
 * Callers remain free to decide whether noshow counts for their specific
 * existing domain rule. This prevents Class Exchange from silently changing
 * historical booking-plan, attendance or customer-display behavior.
 */
export function summarizeMembershipSessionUnits(
  bookings: MembershipBookingUnitLike[],
): MembershipSessionUnitSummary {
  return {
    reserved: sumMembershipBookingUnits(
      bookings,
      ["confirmed"],
    ),
    used: sumMembershipBookingUnits(
      bookings,
      ["attended"],
    ),
    noShow: sumMembershipBookingUnits(
      bookings,
      ["noshow"],
    ),
    cancelled: sumMembershipBookingUnits(
      bookings,
      ["cancelled"],
    ),
  };
}
