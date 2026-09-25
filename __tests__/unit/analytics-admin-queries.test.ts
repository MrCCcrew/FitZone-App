import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { pageViews, sessions, events, voiceSessions } = vi.hoisted(() => ({
  pageViews: vi.fn(),
  sessions: vi.fn(),
  events: vi.fn(),
  voiceSessions: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    analyticsPageView: { findMany: pageViews },
    analyticsSession: { findMany: sessions },
    analyticsEvent: { findMany: events },
    voiceRealtimeSession: { findMany: voiceSessions },
  },
}));

import { getAnalyticsConversions, getAnalyticsEvents, getAnalyticsOverview, getAnalyticsTraffic } from "@/lib/analytics/admin-queries";

const filters = { from: new Date("2026-01-01"), to: new Date("2026-01-31T23:59:59Z"), timezone: "UTC" };

describe("admin analytics aggregations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voiceSessions.mockResolvedValue([]);
    pageViews.mockResolvedValue([{
      visitorId: "v1",
      sessionId: "s1",
      path: "/plans?token=hidden",
      enteredAt: new Date("2026-01-02"),
      durationSeconds: 30,
      exitedAt: new Date(),
      visitor: {
        countryCode: "EG",
        countryName: "Egypt",
        deviceType: "mobile",
        browser: "Chrome",
      },
    }]);
    sessions.mockResolvedValue([{ id: "s1", visitorId: "v1", startedAt: new Date("2026-01-02"), durationSeconds: 60, pageViewCount: 1, isBounce: true, landingPage: "/plans", exitPage: "/plans", referrer: "https://example.test/?email=hidden" }]);
    events.mockResolvedValue([
      { eventName: "subscription_viewed", entityType: "subscription", entityId: "plan-1", entityName: "Gold", metadata: null, createdAt: new Date("2026-01-02") },
      { eventName: "checkout_started", entityType: "subscription", entityId: "plan-1", entityName: "Gold", metadata: { source: "membership_checkout" }, createdAt: new Date("2026-01-02") },
      { eventName: "payment_succeeded", entityType: "subscription", entityId: "plan-1", entityName: "Gold", metadata: { value: 200, currency: "EGP", paymentMethodType: "card", token: "never-return" }, createdAt: new Date("2026-01-02") },
      { eventName: "membership_activated", entityType: "subscription", entityId: "plan-1", entityName: "Gold", metadata: null, createdAt: new Date("2026-01-02") },
    ]);
  });

  it("returns accurate overview totals, safe rates and separate currencies", async () => {
    const result = await getAnalyticsOverview(filters);
    expect(result.traffic).toMatchObject({ visitors: 1, sessions: 1, pageViews: 1, bounceRate: 100 });
    expect(result.business).toMatchObject({ subscriptionViews: 1, checkoutStarted: 1, paymentSucceeded: 1, membershipActivated: 1 });
    expect(result.revenue.currencyBreakdown).toEqual([expect.objectContaining({ currency: "EGP", value: 200 })]);
    expect(result.conversion).toMatchObject({ viewToCheckoutRate: 100, checkoutToPaymentRate: 100, paymentToActivationRate: 100 });
  });

  it("returns server-derived realtime voice metrics without transcript data", async () => {
    voiceSessions.mockResolvedValue([
      {
        userId: "u1",
        startedAt: new Date("2026-01-03"),
        connectedAt: new Date("2026-01-03T00:00:05Z"),
        finalizedAt: new Date("2026-01-03T00:01:05Z"),
        billableSeconds: 60,
        terminationReason: "user_ended",
      },
      {
        userId: "u1",
        startedAt: new Date("2026-01-04"),
        connectedAt: new Date("2026-01-04T00:00:04Z"),
        finalizedAt: new Date("2026-01-04T00:00:34Z"),
        billableSeconds: 30,
        terminationReason: "quota_exhausted",
      },
      {
        userId: "u2",
        startedAt: new Date("2026-01-05"),
        connectedAt: null,
        finalizedAt: new Date("2026-01-05T00:00:10Z"),
        billableSeconds: 0,
        terminationReason: "connection_failed",
      },
    ]);

    const result = await getAnalyticsOverview(filters);

    expect(result.aiCoach.voice).toMatchObject({
      available: true,
      sessionsStarted: 3,
      sessionsConnected: 2,
      uniqueUsers: 2,
      sessionsFinalized: 3,
      totalBillableSeconds: 90,
      averageBillableSeconds: 30,
    });

    expect(result.aiCoach.voice.connectionRate).toBeCloseTo(66.67, 1);

    expect(result.aiCoach.voice.terminationReasons).toEqual([
      { reason: "user_ended", count: 1 },
      { reason: "quota_exhausted", count: 1 },
      { reason: "connection_failed", count: 1 },
    ]);

    expect(JSON.stringify(result.aiCoach.voice)).not.toContain("transcript");
  });

  it("returns sanitized traffic and event aggregates without raw metadata", async () => {
    const [traffic, eventResult] = await Promise.all([getAnalyticsTraffic(filters), getAnalyticsEvents(filters)]);
    expect(traffic.topPages[0]?.path).toBe("/plans");
    expect(JSON.stringify(traffic)).not.toContain("hidden");
    expect(eventResult.paymentMethodBreakdown).toEqual([{ paymentMethodType: "card", count: 1 }]);

    expect(traffic.deviceBreakdown).toEqual([
      { name: "mobile", visitors: 1 },
    ]);
    expect(traffic.browserBreakdown).toEqual([
      { name: "Chrome", visitors: 1 },
    ]);
    expect(traffic.countryBreakdown).toEqual([
      { name: "Egypt", visitors: 1 },
    ]);

    expect(JSON.stringify(eventResult)).not.toContain("never-return");
  });

  it("keeps the store funnel separate from membership activation", async () => {
    events.mockResolvedValue([{ eventName: "checkout_started", entityType: "order", entityId: "order-1", entityName: "Order", metadata: null, createdAt: new Date() }, { eventName: "payment_succeeded", entityType: "order", entityId: "order-1", entityName: "Order", metadata: null, createdAt: new Date() }]);
    const result = await getAnalyticsConversions(filters);
    expect(result.storeFunnel).toMatchObject({ checkoutStarted: 1, paymentSucceeded: 1, membershipActivated: 0 });
    expect(result.byEntityType.find((entry) => entry.entityType === "subscription")?.membershipActivated).toBe(0);
  });
});
