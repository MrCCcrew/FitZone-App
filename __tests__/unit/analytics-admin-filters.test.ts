import { describe, expect, it } from "vitest";
import { parseAdminAnalyticsFilters, safeRate,
  localMonthUtcRange,
} from "@/lib/analytics/admin-filters";

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

describe("analytics local-day UTC boundaries", () => {
  it("maps UTC local dates to exact UTC day boundaries", () => {
    const filters = parseAdminAnalyticsFilters(
      new URLSearchParams(
        "from=2026-01-01&to=2026-01-31&timezone=UTC",
      ),
    );

    expect(filters.from.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(filters.to.toISOString()).toBe(
      "2026-01-31T23:59:59.999Z",
    );
  });

  it("maps Kuwait calendar days to their real UTC boundaries", () => {
    const filters = parseAdminAnalyticsFilters(
      new URLSearchParams(
        "from=2026-01-01&to=2026-01-31&timezone=Asia/Kuwait",
      ),
    );

    expect(filters.from.toISOString()).toBe(
      "2025-12-31T21:00:00.000Z",
    );
    expect(filters.to.toISOString()).toBe(
      "2026-01-31T20:59:59.999Z",
    );
  });

  it("uses Cairo's real offset instead of UTC midnight", () => {
    const filters = parseAdminAnalyticsFilters(
      new URLSearchParams(
        "from=2026-08-01&to=2026-08-16&timezone=Africa/Cairo",
      ),
    );

    expect(filters.from.toISOString()).not.toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(filters.to.toISOString()).not.toBe(
      "2026-08-16T23:59:59.999Z",
    );

    expect(filters.to.getTime()).toBeGreaterThan(
      filters.from.getTime(),
    );
  });
});

describe("analytics local-month UTC boundaries", () => {
  it("maps Cairo August 2026 to exact UTC month boundaries", () => {
    const range = localMonthUtcRange(2026, 8, "Africa/Cairo");

    expect(range.from.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("maps Kuwait month boundaries without DST", () => {
    const range = localMonthUtcRange(2026, 8, "Asia/Kuwait");

    expect(range.from.toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });
});
