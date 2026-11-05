import { describe, expect, it } from "vitest";
import {
  evaluateOfferAgeEligibility,
  getAgeYearsByCalendarDay,
} from "@/lib/offer-age-eligibility";

const NOW = new Date("2026-10-10T12:00:00.000Z");

function eligibleForStudentOffer(
  birthDate: string,
) {
  return evaluateOfferAgeEligibility({
    requiresBirthDate: true,
    minAgeYears: 13,
    maxAgeYears: 25,
    birthDate: new Date(`${birthDate}T12:00:00.000Z`),
    now: NOW,
  });
}

describe("offer age eligibility", () => {
  it("rejects the day before the 13th birthday", () => {
    const result = eligibleForStudentOffer("2013-10-11");

    expect(result.eligible).toBe(false);
    expect(result.ageYears).toBe(12);

    if (!result.eligible) {
      expect(result.code).toBe("AGE_NOT_ELIGIBLE");
    }
  });

  it("accepts the 13th birthday", () => {
    const result = eligibleForStudentOffer("2013-10-10");

    expect(result.eligible).toBe(true);
    expect(result.ageYears).toBe(13);
  });

  it("accepts age 25 through the day before the 26th birthday", () => {
    const result = eligibleForStudentOffer("2000-10-11");

    expect(result.eligible).toBe(true);
    expect(result.ageYears).toBe(25);
  });

  it("rejects on the 26th birthday", () => {
    const result = eligibleForStudentOffer("2000-10-10");

    expect(result.eligible).toBe(false);
    expect(result.ageYears).toBe(26);

    if (!result.eligible) {
      expect(result.code).toBe("AGE_NOT_ELIGIBLE");
    }
  });

  it("requires birth date when the offer rule requires it", () => {
    const result = evaluateOfferAgeEligibility({
      requiresBirthDate: true,
      minAgeYears: 13,
      maxAgeYears: 25,
      birthDate: null,
      now: NOW,
    });

    expect(result.eligible).toBe(false);

    if (!result.eligible) {
      expect(result.code).toBe("BIRTH_DATE_REQUIRED");
    }
  });

  it("rejects future birth dates with maximum-only age rules", () => {
    const result = evaluateOfferAgeEligibility({
      requiresBirthDate: true,
      minAgeYears: null,
      maxAgeYears: 25,
      birthDate: new Date("2026-11-10T00:00:00.000Z"),
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.code).toBe("AGE_NOT_ELIGIBLE");
  });

  it("enforces age bounds even if requiresBirthDate flag is absent", () => {
    const result = evaluateOfferAgeEligibility({
      requiresBirthDate: false,
      minAgeYears: 13,
      maxAgeYears: 25,
      birthDate: new Date("2020-01-01T00:00:00.000Z"),
      now: NOW,
    });
    expect(result.eligible).toBe(false);
  });

  it("does not affect offers without an age rule", () => {
    const result = evaluateOfferAgeEligibility({
      requiresBirthDate: false,
      minAgeYears: null,
      maxAgeYears: null,
      birthDate: null,
      now: NOW,
    });

    expect(result.eligible).toBe(true);
  });

  it("uses calendar-day age rather than hour-level age", () => {
    expect(
      getAgeYearsByCalendarDay(
        new Date("2013-10-10T23:59:59.000Z"),
        NOW,
      ),
    ).toBe(13);
  });
});