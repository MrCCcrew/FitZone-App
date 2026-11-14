import { describe, expect, it } from "vitest";
import {
  evaluateFriendOfferStudentEligibility,
} from "@/lib/friend-offer-student-eligibility";

const now = new Date("2026-10-14T12:00:00.000Z");

function nationalId(year: number, month: number, day: number, governorate = "01") {
  return (
    (year < 2000 ? "2" : "3") +
    String(year % 100).padStart(2, "0") +
    String(month).padStart(2, "0") +
    String(day).padStart(2, "0") +
    governorate +
    "12345"
  );
}

function check(id: unknown, options: {
  requiresBirthDate?: boolean;
  requiresEgyptianNationalId?: boolean;
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
} = {}) {
  return evaluateFriendOfferStudentEligibility({
    requiresBirthDate: options.requiresBirthDate ?? true,
    requiresEgyptianNationalId: options.requiresEgyptianNationalId ?? true,
    minAgeYears: options.minAgeYears === undefined ? 13 : options.minAgeYears,
    maxAgeYears: options.maxAgeYears === undefined ? 25 : options.maxAgeYears,
    egyptianNationalId: id,
    now,
  });
}

describe("Friend offer Egyptian student eligibility", () => {
  it("requires national ID when enabled", () => {
    expect(check(undefined)).toMatchObject({
      eligible: false,
      code: "EGYPTIAN_NATIONAL_ID_REQUIRED",
    });
  });

  it("rejects invalid national ID format", () => {
    expect(check("123")).toMatchObject({
      eligible: false,
      code: "EGYPTIAN_NATIONAL_ID_INVALID",
    });
  });

  it("rejects invalid embedded date", () => {
    expect(check(nationalId(2010, 2, 31))).toMatchObject({
      eligible: false,
      code: "EGYPTIAN_NATIONAL_ID_INVALID",
    });
  });

  it("rejects invalid governorate", () => {
    expect(check(nationalId(2010, 1, 1, "00"))).toMatchObject({
      eligible: false,
      code: "EGYPTIAN_NATIONAL_ID_INVALID",
    });
  });

  it("rejects a student younger than 13", () => {
    expect(check(nationalId(2014, 1, 1))).toMatchObject({
      eligible: false,
      code: "AGE_NOT_ELIGIBLE",
    });
  });

  it("allows a student aged exactly 13", () => {
    expect(check(nationalId(2013, 10, 14))).toMatchObject({
      eligible: true,
      ageYears: 13,
    });
  });

  it("allows a student aged exactly 25", () => {
    expect(check(nationalId(2000, 10, 15))).toMatchObject({
      eligible: true,
      ageYears: 25,
    });
  });

  it("rejects a student aged 26", () => {
    expect(check(nationalId(2000, 10, 14))).toMatchObject({
      eligible: false,
      code: "AGE_NOT_ELIGIBLE",
    });
  });

  it("rejects incomplete age configuration", () => {
    expect(check(nationalId(2010, 1, 1), {
      requiresBirthDate: false,
    })).toMatchObject({
      eligible: false,
      code: "INVALID_AGE_RULE",
    });
  });

  it("does not require national ID for offers without that setting", () => {
    expect(check(undefined, {
      requiresBirthDate: false,
      requiresEgyptianNationalId: false,
      minAgeYears: null,
      maxAgeYears: null,
    })).toMatchObject({
      eligible: true,
    });
  });
});
