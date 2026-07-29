import { describe, expect, it, vi } from "vitest";
import { createPageLeaveGuard, getAnalyticsPath, sendAnalyticsPageLeave } from "@/components/analytics/AnalyticsTracker";

describe("analytics tracker", () => {
  it("keeps safe navigation paths and removes sensitive query values", () => {
    expect(getAnalyticsPath("/offers", "token=x&email=a@b.com&page=2")).toBe("/offers?page=2");
    expect(getAnalyticsPath("/offers", "page=3")).toBe("/offers?page=3");
  });

  it("sends each page leave once, so duplicate pagehide and cleanup calls cannot duplicate it", async () => {
    const sender = vi.fn(async () => undefined);
    const guard = createPageLeaveGuard(sender);
    await guard.send("/classes", true);
    await guard.send("/classes", true);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith("/classes", true);
  });

  it("resets the leave guard only after a new page cycle", async () => {
    const sender = vi.fn(async () => undefined);
    const guard = createPageLeaveGuard(sender);
    await guard.send("/classes");
    guard.resetForNewPage();
    await guard.send("/classes");
    expect(sender).toHaveBeenCalledTimes(2);
  });

  it("sends pagehide through a JSON beacon without identifiers or client duration", async () => {
    const beacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: beacon } });
    await sendAnalyticsPageLeave("/classes", true);
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/analytics/collect");
    const blob = beacon.mock.calls[0]![1] as Blob;
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe(JSON.stringify({ eventName: "page_leave", path: "/classes" }));
  });

  it("uses keepalive fetch when sendBeacon is unavailable or rejects the request", async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: vi.fn(() => false) } });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAnalyticsPageLeave("/classes", true);
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/collect", expect.objectContaining({ keepalive: true }));
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  });

  it("uses ordinary fetch for route changes and keeps the payload limited to event name and path", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAnalyticsPageLeave("/classes");
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/collect", expect.objectContaining({
      body: JSON.stringify({ eventName: "page_leave", path: "/classes" }),
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/analytics/collect", expect.not.objectContaining({ keepalive: true }));
    vi.unstubAllGlobals();
  });

  it("does not use sendBeacon for ordinary route changes", async () => {
    const beacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: beacon } });
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAnalyticsPageLeave("/classes");
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
