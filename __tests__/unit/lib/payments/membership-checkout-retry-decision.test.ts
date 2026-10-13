import { describe, expect, it } from "vitest";
import {
  decideMembershipCheckoutRetry,
  type MembershipRetryInput,
} from "@/lib/payments/membership-checkout-retry-decision";

const startedAt = Date.parse("2026-10-11T15:00:00.000Z");

function fixture(
  minute: number,
  overrides: Partial<MembershipRetryInput> = {},
): MembershipRetryInput {
  return {
    membershipStatus: "pending_payment",
    pendingExpiresAt: new Date(startedAt + 60 * 60_000),
    ownerMatches: true,
    economicIdentityMatches: true,
    anotherPaidPaymentExists: false,
    paymentStatus: "requires_action",
    checkoutUrl: "https://checkout.example.test/valid",
    paymentExpiresAt: new Date(startedAt + 40 * 60_000),
    now: new Date(startedAt + minute * 60_000),
    ...overrides,
  };
}

describe("Membership checkout retry decision", () => {
  for (const minute of [0, 10, 30]) {
    it(`resumes the existing valid checkout at minute ${minute}`, () => {
      expect(
        decideMembershipCheckoutRetry(fixture(minute)).action,
      ).toBe("resume");
    });
  }

  it("requires reconciliation when checkout expires before the hold", () => {
    expect(decideMembershipCheckoutRetry(fixture(50))).toEqual({
      action: "reconcile_before_retry",
      reason: "checkout_unusable_or_expired",
    });
  });

  it("requires reconciliation for failed Paymob payment", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { paymentStatus: "failed" }),
      ).action,
    ).toBe("reconcile_before_retry");
  });

  it("requires reconciliation for cancelled checkout", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(20, { paymentStatus: "cancelled" }),
      ).action,
    ).toBe("reconcile_before_retry");
  });

  it("does not trust checkout with no provider expiry", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(20, { paymentExpiresAt: null }),
      ).action,
    ).toBe("reconcile_before_retry");
  });

  it("does not resume an insecure checkout URL", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(20, { checkoutUrl: "http://example.test/pay" }),
      ).action,
    ).toBe("reconcile_before_retry");
  });

  it("blocks at exactly minute 60", () => {
    expect(decideMembershipCheckoutRetry(fixture(60))).toEqual({
      action: "blocked",
      reason: "original_hold_expired",
    });
  });

  it("blocks after the original hold", () => {
    expect(
      decideMembershipCheckoutRetry(fixture(61)).action,
    ).toBe("blocked");
  });

  it("never replaces a paid transaction", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { paymentStatus: "paid" }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks another already-paid attempt", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { anotherPaidPaymentExists: true }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks payment creation while an attempt is processing", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { paymentStatus: "processing" }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks concurrent retry handoff", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { paymentStatus: "retrying" }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks cross-user ownership", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { ownerMatches: false }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks changed prices or purchase economics", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { economicIdentityMatches: false }),
      ).action,
    ).toBe("blocked");
  });

  it("blocks a cancelled membership", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { membershipStatus: "cancelled" }),
      ).action,
    ).toBe("blocked");
  });

  it("fails closed for missing or invalid hold expiry", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { pendingExpiresAt: null }),
      ).action,
    ).toBe("blocked");

    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { pendingExpiresAt: new Date("invalid") }),
      ).action,
    ).toBe("blocked");
  });

  it("fails closed for an unknown payment state", () => {
    expect(
      decideMembershipCheckoutRetry(
        fixture(15, { paymentStatus: "unknown" }),
      ).action,
    ).toBe("blocked");
  });
});