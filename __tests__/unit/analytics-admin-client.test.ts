import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsDisplayNumber, analyticsEndpointNames, analyticsQuery, analyticsSectionErrorLabels, analyticsSections, loadAdminAnalytics, resolveAdminAnalyticsLoad } from "@/lib/analytics/admin-client";

const fulfilled = (value: unknown): PromiseFulfilledResult<unknown> => ({ status: "fulfilled", value });
const rejected = (reason: unknown): PromiseRejectedResult => ({ status: "rejected", reason });
const allSucceeded = () => ({ overview: fulfilled({}), traffic: fulfilled({}), events: fulfilled({}), conversions: fulfilled({}) });

describe("admin analytics client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serializes only supported non-sensitive filters", () => {
    expect(analyticsQuery({ from: "2026-01-01", to: "2026-01-31", timezone: "Africa/Cairo", source: "membership_checkout" })).toBe("from=2026-01-01&to=2026-01-31&timezone=Africa%2FCairo&source=membership_checkout");
  });

  it("fetches all sections with one shared filter set and uses the Safari-safe activity alias", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const results = await loadAdminAnalytics({ from: "2026-01-01", to: "2026-01-31", timezone: "UTC" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("from=2026-01-01");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/admin/analytics/activity?"))).toBe(true);
    expect(results.overview.status).toBe("fulfilled");
    expect(results.events.status).toBe("fulfilled");
  });

  it("keeps the internal events key while mapping its endpoint to activity", () => {
    expect(analyticsEndpointNames.events).toBe("activity");
    expect(analyticsSections).toContain("events");
  });

  it("keeps partial endpoint failures isolated", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes("traffic") ? Promise.resolve({ ok: false, status: 500 }) : Promise.resolve({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await loadAdminAnalytics({ from: "2026-01-01", to: "2026-01-31", timezone: "UTC" }, new AbortController().signal);
    expect(results.traffic.status).toBe("rejected");
    expect(results.overview.status).toBe("fulfilled");
  });

  it("clears retry state when all four analytics endpoints succeed", () => {
    const { payload, failedSections } = resolveAdminAnalyticsLoad(allSucceeded());
    expect(failedSections).toEqual([]);
    expect(payload).toEqual({ overview: {}, traffic: {}, events: {}, conversions: {} });
  });

  it("identifies only the failed section while preserving successful data", () => {
    const { payload, failedSections } = resolveAdminAnalyticsLoad({ ...allSucceeded(), traffic: rejected(new Error("offline")) });
    expect(failedSections).toEqual(["traffic"]);
    expect(analyticsSectionErrorLabels[failedSections[0]!]).toBe("تعذر تحميل بيانات الزيارات");
    expect(payload).toEqual({ overview: {}, events: {}, conversions: {} });
  });

  it("clears a previous section failure after a successful retry", () => {
    expect(resolveAdminAnalyticsLoad({ ...allSucceeded(), events: rejected(new Error("offline")) }).failedSections).toEqual(["events"]);
    expect(resolveAdminAnalyticsLoad(allSucceeded()).failedSections).toEqual([]);
  });

  it("does not surface AbortError as a visible section failure", () => {
    const abortError = Object.assign(new Error("request aborted"), { name: "AbortError" });
    const { payload, failedSections } = resolveAdminAnalyticsLoad({ ...allSucceeded(), conversions: rejected(abortError) });
    expect(failedSections).toEqual([]);
    expect(payload).toEqual({ overview: {}, traffic: {}, events: {} });
  });

  it("normalizes nullable revenue values to zero", () => {
    expect(analyticsDisplayNumber(null)).toBe(0);
    expect(analyticsDisplayNumber(undefined)).toBe(0);
    expect(analyticsDisplayNumber(0)).toBe(0);
  });
});
