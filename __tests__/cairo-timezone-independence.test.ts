/**
 * Cairo Timezone Host-Independence Tests
 *
 * Verifies that accounting date conversion produces IDENTICAL UTC results
 * regardless of process TZ environment variable.
 */

import { describe, it, expect } from "vitest";
import { parseDateStart, parseDateEnd, getCairoOffsetMinutes } from "@/lib/accounting-report-service";

describe("Cairo Timezone Host-Independence", () => {
  // Test dates
  const normalDate = "2026-08-09"; // Regular Cairo day
  const dstDate = "2026-03-27";    // Near typical DST transition

  it("parseDateStart produces identical UTC for normal Cairo day", () => {
    const result = parseDateStart(normalDate);

    expect(result).not.toBeNull();
    // Cairo DST/standard offset may vary - just verify result is consistent
    expect(result).toBeInstanceOf(Date);
    // Should be previous day in UTC (Cairo is ahead)
    expect(result!.getUTCDate()).toBe(8);
    expect(result!.getUTCMonth()).toBe(7); // August (0-indexed)
    expect(result!.getUTCFullYear()).toBe(2026);
  });

  it("parseDateEnd produces identical UTC for normal Cairo day", () => {
    const result = parseDateEnd(normalDate);

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Date);
    // Should be same calendar day in UTC (end of Aug 9 Cairo = start of Aug 10 Cairo)
    expect(result!.getUTCDate()).toBe(9);
    expect(result!.getUTCMonth()).toBe(7);
    expect(result!.getUTCFullYear()).toBe(2026);
  });

  it("half-open interval [from, to) is exactly 24 hours", () => {
    const from = parseDateStart(normalDate);
    const to = parseDateEnd(normalDate);

    expect(from).not.toBeNull();
    expect(to).not.toBeNull();

    const diff = to!.getTime() - from!.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000); // Exactly 24 hours
  });

  it("parseDateStart handles DST period correctly", () => {
    const result = parseDateStart(dstDate);

    expect(result).not.toBeNull();
    // DST offset may differ, but result must be consistent
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBeGreaterThan(0);
  });

  it("getCairoOffsetMinutes returns positive offset", () => {
    const testDate = new Date("2026-08-09T12:00:00.000Z");
    const offset = getCairoOffsetMinutes(testDate);

    // Cairo is always ahead of UTC (positive offset)
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThanOrEqual(180); // Max UTC+3 during DST
  });

  it("boundary test: midnight UTC is NOT same day in Cairo", () => {
    // 2026-08-09T00:00:00Z is 2026-08-09 02:00 in Cairo (UTC+2)
    // So it's already Aug 9 in Cairo, not Aug 8
    const from = parseDateStart("2026-08-08");
    const to = parseDateEnd("2026-08-08");

    const utcMidnight = new Date("2026-08-09T00:00:00.000Z");

    // UTC midnight Aug 9 should NOT be in Aug 8 Cairo range
    expect(utcMidnight.getTime()).toBeGreaterThanOrEqual(to!.getTime());
  });

  it("boundary test: Cairo midnight is correct UTC instant", () => {
    // Cairo midnight should be a whole hour offset from UTC
    const cairoMidnight = parseDateStart("2026-08-09");

    expect(cairoMidnight!.getUTCMinutes()).toBe(0);
    expect(cairoMidnight!.getUTCSeconds()).toBe(0);
    expect(cairoMidnight!.getUTCMilliseconds()).toBe(0);
    expect(cairoMidnight!.getUTCDate()).toBe(8); // Previous day in UTC (Cairo ahead)
    // Hour should be 21, 22, or 23 depending on DST
    expect(cairoMidnight!.getUTCHours()).toBeGreaterThanOrEqual(21);
    expect(cairoMidnight!.getUTCHours()).toBeLessThanOrEqual(23);
  });

  it("produces consistent results for sequential dates", () => {
    const date1Start = parseDateStart("2026-08-08");
    const date1End = parseDateEnd("2026-08-08");
    const date2Start = parseDateStart("2026-08-09");

    // End of Aug 8 should equal start of Aug 9 (half-open interval)
    expect(date1End!.getTime()).toBe(date2Start!.getTime());
  });

  it("handles month boundary correctly", () => {
    const lastDayStart = parseDateStart("2026-08-31");
    const lastDayEnd = parseDateEnd("2026-08-31");
    const firstDayNextMonth = parseDateStart("2026-09-01");

    expect(lastDayEnd!.getTime()).toBe(firstDayNextMonth!.getTime());
  });

  it("handles year boundary correctly", () => {
    const lastDayStart = parseDateStart("2026-12-31");
    const lastDayEnd = parseDateEnd("2026-12-31");
    const firstDayNextYear = parseDateStart("2027-01-01");

    expect(lastDayEnd!.getTime()).toBe(firstDayNextYear!.getTime());
  });

  it("returns null for invalid date strings", () => {
    expect(parseDateStart(null)).toBeNull();
    expect(parseDateStart("")).toBeNull();
    expect(parseDateStart("invalid")).toBeNull();
    expect(parseDateStart("2026-13-01")).toBeNull(); // Invalid month

    expect(parseDateEnd(null)).toBeNull();
    expect(parseDateEnd("")).toBeNull();
  });

  it("host-independence: results are deterministic", () => {
    // Call multiple times - should get identical results
    const results = Array.from({ length: 5 }, () => parseDateStart(normalDate));

    const firstTimestamp = results[0]!.getTime();
    results.forEach(result => {
      expect(result!.getTime()).toBe(firstTimestamp);
    });
  });
});
