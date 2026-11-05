import { afterEach, describe, expect, it, vi } from "vitest";
import { trackBusinessView } from "@/lib/analytics/client-events";

describe("business view client helper", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends one minimal event while the same detail opening is pending", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("window", { location: { pathname: "/" } }); vi.stubGlobal("fetch", fetchMock);
    trackBusinessView("subscription_viewed", "m1"); trackBusinessView("subscription_viewed", "m1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/business-event", expect.objectContaining({ body: JSON.stringify({ eventName: "subscription_viewed", entityId: "m1" }) }));
  });
  it("allows a different entity, skips admin, and absorbs fetch errors", async () => {
    const fetchMock = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("window", { location: { pathname: "/" } }); vi.stubGlobal("fetch", fetchMock);
    trackBusinessView("offer_viewed", "o1"); trackBusinessView("offer_viewed", "o2");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.stubGlobal("window", { location: { pathname: "/admin" } }); trackBusinessView("offer_viewed", "o3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
