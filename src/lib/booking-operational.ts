/**
 * Booking Operational Validation
 *
 * A booking is operationally valid only when:
 * 1. Its status is "confirmed" or "attended"
 * 2. AND either:
 *    a) It's not linked to a membership (standalone paid booking), OR
 *    b) Its linked membership has status="active"
 *
 * Bookings linked to pending_payment, cancelled, or expired memberships
 * are treated as non-operational reservations.
 */

export function isBookingOperational(booking: {
  status: string;
  userMembership?: { status: string } | null;
}): boolean {
  // Must be in confirmed or attended state
  if (booking.status !== "confirmed" && booking.status !== "attended") {
    return false;
  }

  // If linked to a membership, it must be active
  if (booking.userMembership) {
    return booking.userMembership.status === "active";
  }

  // Standalone booking (no membership) is operational
  return true;
}
