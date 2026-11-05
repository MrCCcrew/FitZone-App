/**
 * Booking Operational Validation
 *
 * Normal membership booking:
 *   membership must be active.
 *
 * Make-up entitlement booking:
 *   may remain operational after the contractual membership endDate,
 *   even when the membership itself is expired.
 *
 * This does NOT reactivate or extend the membership.
 */
export function isBookingOperational(booking: {
  status: string;
  isMakeup?: boolean;
  userMembership?: { status: string } | null;
}): boolean {
  if (
    booking.status !== "confirmed" &&
    booking.status !== "attended"
  ) {
    return false;
  }

  if (!booking.userMembership) {
    return true;
  }

  if (booking.userMembership.status === "active") {
    return true;
  }

  return (
    booking.isMakeup === true &&
    booking.userMembership.status === "expired"
  );
}
