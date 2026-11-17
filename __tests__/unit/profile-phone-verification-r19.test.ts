import { describe, expect, it } from "vitest";
import {
  isVerifiedProfilePhone,
  isCompletedVerifiedProfile,
} from "@/lib/profile-phone-verification";

const completed = {
  phone: "+201012345678",
  verifiedPhone: "+201012345678",
  phoneVerifiedAt: new Date("2026-11-16T12:00:00Z"),
  gender: "student",
  birthDate: new Date("2000-01-01T00:00:00Z"),
  governorate: "القاهرة",
};

describe("R19 registered phone and profile completion", () => {
  it("accepts a matching verified phone", () => {
    expect(isVerifiedProfilePhone(completed)).toBe(true);
  });

  it("does not trust a phone without verification", () => {
    expect(isVerifiedProfilePhone({
      ...completed,
      verifiedPhone: null,
      phoneVerifiedAt: null,
    })).toBe(false);
  });

  it("invalidates verification when phone changes", () => {
    expect(isVerifiedProfilePhone({
      ...completed,
      phone: "+201098765432",
    })).toBe(false);
  });

  it("rejects a verification date without a matching number", () => {
    expect(isVerifiedProfilePhone({
      ...completed,
      verifiedPhone: null,
    })).toBe(false);
  });

  it("rejects an absent phone", () => {
    expect(isVerifiedProfilePhone({
      ...completed,
      phone: null,
    })).toBe(false);
  });

  it("marks a fully completed verified profile complete", () => {
    expect(isCompletedVerifiedProfile(completed)).toBe(true);
  });

  it("does not complete a profile with unverified phone", () => {
    expect(isCompletedVerifiedProfile({
      ...completed,
      phoneVerifiedAt: null,
    })).toBe(false);
  });

  it("requires birth date", () => {
    expect(isCompletedVerifiedProfile({
      ...completed,
      birthDate: null,
    })).toBe(false);
  });

  it("requires governorate", () => {
    expect(isCompletedVerifiedProfile({
      ...completed,
      governorate: null,
    })).toBe(false);
  });

  it("requires the existing profile status field", () => {
    expect(isCompletedVerifiedProfile({
      ...completed,
      gender: null,
    })).toBe(false);
  });
});