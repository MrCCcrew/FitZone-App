import { describe, expect, it } from "vitest";
import { parseAdminAnalyticsFilters, safeRate } from "@/lib/analytics/admin-filters";

describe("admin analytics filters", () => {
  it("uses a 30-day default range and the project timezone", () => {
    const filters = parseAdminAnalyticsFilters(new URLSearchParams());
    expect(filters.timezone).toBe("Africa/Cairo");
    expect(filters.to.getTime() - filters.from.getTime()).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
  });

  it("accepts valid filters and rejects invalid date ranges, timezone, event and entity", () => {
    const filters = parseAdminAnalyticsFilters(new URLSearchParams("from=2026-01-01&to=2026-01-31&timezone=UTC&eventName=checkout_started&entityType=order"));
    expect(filters.eventName).toBe("checkout_started");
    expect(() => parseAdminAnalyticsFilters(new URLSearchParams("from=2026-02-01&to=2026-01-01"))).toThrow("invalid_date_range");
    expect(() => parseAdminAnalyticsFilters(new URLSearchParams("timezone=Not/AZone"))).toThrow("invalid_timezone");
    expect(() => parseAdminAnalyticsFilters(new URLSearchParams("eventName=raw_payload"))).toThrow("invalid_filters");
    expect(() => parseAdminAnalyticsFilters(new URLSearchParams("entityType=user"))).toThrow("invalid_filters");
  });

  it("preserves a timezone supplied by an existing analytics link", () => {
    expect(parseAdminAnalyticsFilters(new URLSearchParams("timezone=Asia/Kuwait")).timezone).toBe("Asia/Kuwait");
  });

  it("never returns NaN or Infinity rates", () => {
    expect(safeRate(1, 0)).toBe(0);
    expect(safeRate(1, 4)).toBe(25);
  });
});
