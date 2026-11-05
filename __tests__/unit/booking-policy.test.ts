import { describe, expect, it } from "vitest";
import {
  getFrozenMaxSessionsPerDay,
  getFrozenRequireDistinctClassesPerDay,
  resolveBookingPolicy,
} from "@/lib/booking/booking-policy";

describe("resolveBookingPolicy", () => {
  it("preserves regular membership max 2/day", () => {
    expect(
      resolveBookingPolicy({
        kind: "subscription",
        sessionsCount: 12,
        durationDays: 30,
      }),
    ).toMatchObject({
      maxSessionsPerDay: 2,
      minSessionsPerWeek: 3,
      requireSingleCalendarDay: false,
    });
  });

  it("treats one-day 3-session Day Use as 3 sessions on one day", () => {
    expect(
      resolveBookingPolicy({
        kind: "subscription",
        sessionsCount: 3,
        durationDays: 1,
      }),
    ).toEqual({
      maxSessionsPerDay: 3,
      minRequiredSelection: 3,
      minSessionsPerWeek: null,
      requireSingleCalendarDay: true,
      requireDistinctClassesPerDay: true,
    });
  });

  it("keeps one-day trial at one session", () => {
    expect(
      resolveBookingPolicy({
        kind: "trial",
        sessionsCount: 1,
        durationDays: 1,
      }),
    ).toMatchObject({
      maxSessionsPerDay: 1,
      requireSingleCalendarDay: true,
    });
  });

  it("reads the frozen daily limit and preserves legacy fallback", () => {
    expect(
      getFrozenMaxSessionsPerDay(
        JSON.stringify({ policy: { maxSessionsPerDay: 3 } }),
      ),
    ).toBe(3);
    expect(getFrozenMaxSessionsPerDay(null)).toBe(2);
    expect(getFrozenMaxSessionsPerDay("not-json")).toBe(2);
    expect(
      getFrozenRequireDistinctClassesPerDay(
        JSON.stringify({ policy: { requireDistinctClassesPerDay: true } }),
      ),
    ).toBe(true);
    expect(getFrozenRequireDistinctClassesPerDay(null)).toBe(false);
  });
});
