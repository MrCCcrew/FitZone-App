import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsQuery, loadAdminAnalytics } from "@/lib/analytics/admin-client";

describe("admin analytics client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("serializes only supported non-sensitive filters", () => {
    expect(analyticsQuery({ from: "2026-01-01", to: "2026-01-31", timezone: "Asia/Kuwait", source: "membership_checkout" })).toBe("from=2026-01-01&to=2026-01-31&timezone=Asia%2FKuwait&source=membership_checkout");
  });

  it("fetches all sections with one shared filter set and forwards AbortSignal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const results = await loadAdminAnalytics({ from: "2026-01-01", to: "2026-01-31", timezone: "UTC" }, controller.signal);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("from=2026-01-01");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
    expect(results.overview.status).toBe("fulfilled");
  });

  it("keeps partial endpoint failures isolated", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url.includes("traffic") ? Promise.resolve({ ok: false, status: 500 }) : Promise.resolve({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await loadAdminAnalytics({ from: "2026-01-01", to: "2026-01-31", timezone: "UTC" }, new AbortController().signal);
    expect(results.traffic.status).toBe("rejected");
    expect(results.overview.status).toBe("fulfilled");
  });
});
