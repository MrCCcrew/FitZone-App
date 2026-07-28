export type AdminBookingDisplayInput = {
  status: string;
  paymentMethod: string;
  userMembership?: { status: string } | null;
};

export const isPendingPaymentBooking = (booking: AdminBookingDisplayInput) =>
  booking.userMembership?.status === "pending_payment";

export function getBookingStatusDisplay(booking: AdminBookingDisplayInput) {
  if (isPendingPaymentBooking(booking)) {
    return { label: "قيد الدفع", badgeClass: "bg-amber-500/15 text-amber-300" };
  }

  return null;
}

export function getBookingPaymentDisplay(booking: AdminBookingDisplayInput) {
  return isPendingPaymentBooking(booking) ? "في انتظار الدفع" : null;
}

export function isBookingActionableInAdmin(booking: AdminBookingDisplayInput, userRole: string | null) {
  return userRole === "admin" && !isPendingPaymentBooking(booking);
}
