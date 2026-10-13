import { describe, expect, it } from "vitest";
import {
  resolvePaymobIntentionExpiration,
} from "@/lib/payments/paymob-membership-expiration";

const started = new Date("2026-10-11T15:00:00.000Z");
const hold = new Date(started.getTime() + 60 * 60_000);

function atMinute(minute: number) {
  return resolvePaymobIntentionExpiration({
    membershipHoldExpiresAt: hold,
    now: new Date(started.getTime() + minute * 60_000),
  });
}

describe("Paymob membership intention expiry", () => {
  it("keeps ordinary payments on 30 minutes", () => {
    expect(resolvePaymobIntentionExpiration({ now: started }))
      .toBe(1800);
  });

  it("uses the original hold, not a new 60-minute window", () => {
    expect(atMinute(0)).toBe(3570);
    expect(atMinute(15)).toBe(2670);
    expect(atMinute(30)).toBe(1770);
    expect(atMinute(45)).toBe(870);
    expect(atMinute(50)).toBe(570);
  });

  it("keeps a safety margin at minute 59", () => {
    expect(atMinute(59)).toBe(30);
  });

  it("rejects creation too close to the original expiry", () => {
    expect(() => atMinute(59.8)).toThrow(
      "PAYMOB_CHECKOUT_HOLD_TOO_CLOSE_TO_EXPIRY",
    );
  });

  it("rejects expiry at exactly minute 60", () => {
    expect(() => atMinute(60)).toThrow();
  });

  it("rejects an already-expired membership hold", () => {
    expect(() => atMinute(61)).toThrow();
  });

  it("rejects invalid dates", () => {
    expect(() =>
      resolvePaymobIntentionExpiration({
        membershipHoldExpiresAt: new Date("invalid"),
        now: started,
      }),
    ).toThrow("PAYMOB_CHECKOUT_INVALID_EXPIRY");
  });

  it("does not extend an abnormally long membership hold", () => {
    expect(
      resolvePaymobIntentionExpiration({
        membershipHoldExpiresAt: new Date(
          started.getTime() + 5 * 60 * 60_000,
        ),
        now: started,
      }),
    ).toBe(3600);
  });
});