import { describe, expect, it } from "vitest";
import {
  buildFriendOfferAccountCheckoutPayload,
} from "@/lib/friend-offer-account-checkout";

const now = new Date("2026-10-18T12:00:00Z");
const validId = "30001010112345";

const base = {
  token: "AbCdEfGhIjKlMnOpQrStUvWx",
  returnUrl: "https://fitzoneland.com/account",
  cancelUrl: "https://fitzoneland.com/account",
  requiresBirthDate: true,
  requiresEgyptianNationalId: true,
  minAgeYears: 18,
  maxAgeYears: 30,
  now,
};

describe("Account Friends Offer checkout eligibility parity", () => {
  it("does not send national ID for ordinary offers", () => {
    const payload = buildFriendOfferAccountCheckoutPayload({
      ...base,
      requiresBirthDate: false,
      requiresEgyptianNationalId: false,
      minAgeYears: null,
      maxAgeYears: null,
      egyptianNationalId: validId,
    });

    expect(payload).not.toHaveProperty("egyptianNationalId");
    expect(payload.token).toBe(base.token);
  });

  it("rejects a missing ID before starting student checkout", () => {
    expect(() =>
      buildFriendOfferAccountCheckoutPayload(base),
    ).toThrow();
  });

  it("rejects a malformed ID before starting student checkout", () => {
    expect(() =>
      buildFriendOfferAccountCheckoutPayload({
        ...base,
        egyptianNationalId: "123",
      }),
    ).toThrow();
  });

  it("rejects an ineligible student age", () => {
    expect(() =>
      buildFriendOfferAccountCheckoutPayload({
        ...base,
        egyptianNationalId: "32001010112345",
      }),
    ).toThrow();
  });

  it("accepts an eligible ID without changing purchase identity", () => {
    const payload = buildFriendOfferAccountCheckoutPayload({
      ...base,
      egyptianNationalId: validId,
    });

    expect(payload).toEqual({
      token: base.token,
      returnUrl: base.returnUrl,
      cancelUrl: base.cancelUrl,
      egyptianNationalId: validId,
    });
  });
});
