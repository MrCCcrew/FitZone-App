import { describe, expect, it } from "vitest";
import {
  getBookingPaymentDisplay,
  getBookingStatusDisplay,
  isBookingActionableInAdmin,
  isPendingPaymentBooking,
} from "@/lib/admin-booking-display";

const activeBooking = { status: "confirmed", paymentMethod: "cash", userMembership: { status: "active" } };
const pendingBooking = { status: "confirmed", paymentMethod: "cash", userMembership: { status: "pending_payment" } };

describe("admin booking display", () => {
  it("keeps confirmed active-membership bookings confirmed", () => {
    expect(getBookingStatusDisplay(activeBooking)).toBeNull();
  });

  it("shows pending-payment bookings as pending payment", () => {
    expect(isPendingPaymentBooking(pendingBooking)).toBe(true);
    expect(getBookingStatusDisplay(pendingBooking)?.label).toBe("قيد الدفع");
  });

  it("shows pending payment instead of cash", () => {
    expect(getBookingPaymentDisplay(pendingBooking)).toBe("في انتظار الدفع");
  });

  it("prevents pending-payment bookings from admin actions and bulk selection", () => {
    expect(isBookingActionableInAdmin(pendingBooking, "admin")).toBe(false);
    expect(isPendingPaymentBooking(pendingBooking)).toBe(true);
  });

  it("keeps active booking actions unchanged and non-admins read-only", () => {
    expect(isBookingActionableInAdmin(activeBooking, "admin")).toBe(true);
    expect(isBookingActionableInAdmin(activeBooking, "trainer")).toBe(false);
  });
});
