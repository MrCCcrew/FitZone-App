import { describe, expect, it } from "vitest";
import {
  canManageBooking,
  canMarkAttendance,
  getBookingPaymentDisplay,
  getBookingStatusDisplay,
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

  it("allows admins to manage pending-payment bookings but disables their attendance", () => {
    expect(canManageBooking("admin")).toBe(true);
    expect(canMarkAttendance(pendingBooking, "admin")).toBe(false);
    expect(isPendingPaymentBooking(pendingBooking)).toBe(true);
  });

  it("keeps active admin actions enabled and non-admins read-only", () => {
    expect(canManageBooking("admin")).toBe(true);
    expect(canMarkAttendance(activeBooking, "admin")).toBe(true);
    expect(canManageBooking("trainer")).toBe(false);
    expect(canMarkAttendance(activeBooking, "trainer")).toBe(false);
  });
});
