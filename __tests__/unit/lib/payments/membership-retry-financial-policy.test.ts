import { describe, expect, it } from "vitest";
import {
  shouldDeferMembershipPaymentRestore,
} from "@/lib/payments/membership-retry-financial-policy";

const origin = new Date("2026-10-11T15:00:00.000Z");
const expiresAt = new Date(origin.getTime() + 60 * 60 * 1000);

function context(minutes: number) {
  return {
    purpose: "membership",
    membershipId: "held-membership",
    membershipStatus: "pending_payment",
    pendingExpiresAt: expiresAt,
    now: new Date(origin.getTime() + minutes * 60 * 1000),
  };
}

describe("Membership retry financial hold policy", () => {
  for (const minute of [0, 5, 10, 30, 50, 59]) {
    it(`does not restore financial adjustments at minute ${minute}`, () => {
      expect(
        shouldDeferMembershipPaymentRestore(context(minute)),
      ).toBe(true);
    });
  }

  it("ends deferral precisely at the original 60-minute deadline", () => {
    expect(
      shouldDeferMembershipPaymentRestore(context(60)),
    ).toBe(false);
  });

  it("does not extend the original hold at minute 61", () => {
    expect(
      shouldDeferMembershipPaymentRestore(context(61)),
    ).toBe(false);
  });

  it("does not defer restoration for a cancelled membership", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        membershipStatus: "cancelled",
      }),
    ).toBe(false);
  });

  it("does not defer restoration for an active membership", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        membershipStatus: "active",
      }),
    ).toBe(false);
  });

  it("does not affect store order refunds", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        purpose: "order",
      }),
    ).toBe(false);
  });

  it("does not affect Offer Box settlement", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        purpose: "offer_box",
      }),
    ).toBe(false);
  });

  it("does not infer a hold from legacy null expiry", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        pendingExpiresAt: null,
      }),
    ).toBe(false);
  });

  it("does not infer a hold without a membership ID", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        membershipId: null,
      }),
    ).toBe(false);
  });

  it("rejects invalid expiry timestamps", () => {
    expect(
      shouldDeferMembershipPaymentRestore({
        ...context(20),
        pendingExpiresAt: new Date("invalid"),
      }),
    ).toBe(false);
  });
});