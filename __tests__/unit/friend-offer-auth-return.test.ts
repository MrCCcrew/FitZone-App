import { describe, expect, it } from "vitest";
import {
  normalizeFriendOfferReturn,
  withFriendOfferReturn,
} from "@/lib/friend-offer-auth-return";

const token = "AbCdEfGhIjKlMnOpQrStUvWx";
const target = `/?page=offers&friendOffer=${token}`;

describe("Friend Offer auth continuation", () => {
  it("preserves the exact invitation through registration", () => {
    const link = withFriendOfferReturn("/register", target);
    const parsed = new URL(link, "https://fitzoneland.com");
    expect(normalizeFriendOfferReturn(parsed.searchParams.get("callbackUrl")))
      .toBe(target);
  });

  it("preserves the invitation through verification", () => {
    const link = withFriendOfferReturn(
      "/verify-email?email=test%40example.com",
      target,
    );
    const parsed = new URL(link, "https://fitzoneland.com");
    expect(parsed.searchParams.get("email")).toBe("test@example.com");
    expect(parsed.searchParams.get("callbackUrl")).toBe(target);
  });

  it("accepts the canonical invitation directly", () => {
    expect(normalizeFriendOfferReturn(target)).toBe(target);
  });

  it("blocks raw control characters before URL parsing", () => {
    for (const character of [
      String.fromCharCode(0),
      String.fromCharCode(9),
      String.fromCharCode(10),
      String.fromCharCode(13),
      String.fromCharCode(31),
    ]) {
      expect(normalizeFriendOfferReturn(target + character)).toBeNull();
    }
  });

  it("preserves the creator flow without an invitation token", () => {
    const target = "/?page=offers";

    expect(normalizeFriendOfferReturn(target)).toBe(target);

    const register = withFriendOfferReturn("/register", target);
    const verify = withFriendOfferReturn(
      "/verify-email?email=test%40example.com",
      target,
    );

    expect(
      new URL(register, "https://fitzoneland.com")
        .searchParams.get("callbackUrl"),
    ).toBe(target);

    expect(
      new URL(verify, "https://fitzoneland.com")
        .searchParams.get("callbackUrl"),
    ).toBe(target);

    expect(normalizeFriendOfferReturn(
      "/?page=offers&unexpected=1",
    )).toBeNull();
  });

  it("does not alter normal registration", () => {
    expect(withFriendOfferReturn("/register", null)).toBe("/register");
  });

  it("blocks external, protocol-relative, malformed and duplicate targets", () => {
    for (const input of [
      "//evil.example",
      "https://evil.example/?page=offers",
      "/\\\\evil.example",
      "/?page=offers&friendOffer=invalid",
      `${target}&friendOffer=${token}`,
      `/?page=offers&page=offers&friendOffer=${token}`,
      "/account",
    ]) {
      expect(normalizeFriendOfferReturn(input)).toBeNull();
    }
  });
});
