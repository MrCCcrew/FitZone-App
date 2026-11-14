import { describe, expect, it } from "vitest";
import { resolveOfferBoxEntitlementTerms, prepareConfirmedOfferBoxActivation } from "@/lib/offer-box/entitlement-contract";

describe("Deferred independent Offer Box entitlement", () => {
  const frozen = () => ({
    membershipTemplate: {
      durationDays: 30,
      sessionsCount: 12 as number | null,
    },
    eligibilitySnapshot: {
      classTypes: ["gym", "fitness"],
      classTypeIds: ["type-1"],
    },
  });

  it("preserves purchased terms without starting activation", () => {
    const result = resolveOfferBoxEntitlementTerms(frozen());
    expect(result.durationDays).toBe(30);
    expect(result.totalSessions).toBe(12);
    expect(result).not.toHaveProperty("startDate");
    expect(result).not.toHaveProperty("endDate");
    expect(result).not.toHaveProperty("scheduleIds");
  });

  it("preserves null sessions without inventing a limit", () => {
    const input = frozen();
    input.membershipTemplate.sessionsCount = null;
    expect(resolveOfferBoxEntitlementTerms(input).totalSessions).toBeNull();
  });

  it("preserves frozen eligibility", () => {
    const result = resolveOfferBoxEntitlementTerms(frozen());
    expect(JSON.parse(result.eligibilitySnapshot)).toEqual(
      frozen().eligibilitySnapshot,
    );
    expect(JSON.parse(result.allowedClassTypesSnapshot!)).toEqual(
      ["gym", "fitness"],
    );
  });

  it("rejects invalid durations", () => {
    const input = frozen();
    input.membershipTemplate.durationDays = 0;
    expect(() => resolveOfferBoxEntitlementTerms(input))
      .toThrow("OFFER_BOX_INVALID_FROZEN_DURATION");
  });

  it("rejects fractional sessions", () => {
    const input = frozen();
    input.membershipTemplate.sessionsCount = 3.5;
    expect(() => resolveOfferBoxEntitlementTerms(input))
      .toThrow("OFFER_BOX_INVALID_FROZEN_SESSION_COUNT");
  });

  it("does not depend on later source changes", () => {
    const input = frozen();
    const result = resolveOfferBoxEntitlementTerms(input);
    input.membershipTemplate.sessionsCount = 99;
    input.eligibilitySnapshot.classTypes.push("changed");
    expect(result.totalSessions).toBe(12);
    expect(JSON.parse(result.allowedClassTypesSnapshot!))
      .toEqual(["gym", "fitness"]);
  });

  it("rejects invalid frozen eligibility", () => {
    const input = { ...frozen(), eligibilitySnapshot: null };
    expect(() => resolveOfferBoxEntitlementTerms(input as never))
      .toThrow("OFFER_BOX_INVALID_FROZEN_ELIGIBILITY");
  });
});

describe("Confirmed Offer Box activation preparation", () => {
  const purchased = {
    membershipTemplate: {
      durationDays: 30,
      sessionsCount: 12 as number | null,
    },
    eligibilitySnapshot: {
      classTypes: ["fitness"],
    },
  };

  const serverNow = new Date("2026-11-07T17:00:00.000Z");

  it("requires explicit confirmation", () => {
    expect(() =>
      prepareConfirmedOfferBoxActivation(
        purchased, false, ["schedule-1"], serverNow,
      ),
    ).toThrow("OFFER_BOX_ACTIVATION_CONFIRMATION_REQUIRED");
  });

  it("starts the period at server confirmation time", () => {
    const result = prepareConfirmedOfferBoxActivation(
      purchased, true, ["schedule-1"], serverNow,
    );

    expect(result.startDate.toISOString())
      .toBe(serverNow.toISOString());
    expect(result.endDate.getTime())
      .toBeGreaterThan(serverNow.getTime());
    expect(result.selectedScheduleIds).toEqual(["schedule-1"]);
  });

  it("rejects duplicate schedule selections", () => {
    expect(() =>
      prepareConfirmedOfferBoxActivation(
        purchased, true, ["schedule-1", "schedule-1"], serverNow,
      ),
    ).toThrow("OFFER_BOX_DUPLICATE_SELECTED_SCHEDULE");
  });

  it("rejects invalid and excessive schedules", () => {
    expect(() =>
      prepareConfirmedOfferBoxActivation(
        purchased, true, [" "], serverNow,
      ),
    ).toThrow("OFFER_BOX_INVALID_SELECTED_SCHEDULES");

    expect(() =>
      prepareConfirmedOfferBoxActivation(
        purchased, true,
        Array.from({ length: 21 }, (_, i) => `schedule-${i}`),
        serverNow,
      ),
    ).toThrow("OFFER_BOX_INVALID_SELECTED_SCHEDULES");
  });

  it("rejects invalid server time", () => {
    expect(() =>
      prepareConfirmedOfferBoxActivation(
        purchased, true, [], new Date(NaN),
      ),
    ).toThrow("OFFER_BOX_INVALID_SERVER_ACTIVATION_TIME");
  });

  it("preserves nullable sessions", () => {
    const result = prepareConfirmedOfferBoxActivation(
      {
        ...purchased,
        membershipTemplate: {
          durationDays: 30,
          sessionsCount: null,
        },
      },
      true, [], serverNow,
    );

    expect(result.totalSessions).toBeNull();
  });
});
