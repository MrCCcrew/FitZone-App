import { describe, expect, it } from "vitest";
import { isFinalRetainedPaymobPayment } from "@/lib/payments/paymob-retained-payment-proof";

const safe = () => ({
  success: true,
  pending: false,
  error_occured: false,
  is_refunded: false,
  is_voided: false,
  refunded_amount_cents: 0,
});

describe("Paymob retained funds proof", () => {
  it("accepts a complete successful, unrefunded, unvoided payment", () => {
    expect(isFinalRetainedPaymobPayment(safe())).toBe(true);
  });
  it("rejects refunded, partially-refunded, and voided successes", () => {
    expect(isFinalRetainedPaymobPayment({ ...safe(), is_refunded: true })).toBe(false);
    expect(isFinalRetainedPaymobPayment({ ...safe(), refunded_amount_cents: 1 })).toBe(false);
    expect(isFinalRetainedPaymobPayment({ ...safe(), is_voided: true })).toBe(false);
  });
  it("fails closed on pending, failed, erroneous or incomplete evidence", () => {
    expect(isFinalRetainedPaymobPayment({ ...safe(), pending: true })).toBe(false);
    expect(isFinalRetainedPaymobPayment({ ...safe(), success: false })).toBe(false);
    expect(isFinalRetainedPaymobPayment({ ...safe(), error_occured: true })).toBe(false);
    expect(isFinalRetainedPaymobPayment({ success: true, pending: false })).toBe(false);
  });
});
