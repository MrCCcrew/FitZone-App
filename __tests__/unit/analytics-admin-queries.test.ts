import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { pageViews, sessions, events } = vi.hoisted(() => ({ pageViews: vi.fn(), sessions: vi.fn(), events: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { analyticsPageView: { findMany: pageViews }, analyticsSession: { findMany: sessions }, analyticsEvent: { findMany: events } } }));

import { getAnalyticsConversions, getAnalyticsEvents, getAnalyticsOverview, getAnalyticsTraffic } from "@/lib/analytics/admin-queries";

const filters = { from: new Date("2026-01-01"), to: new Date("2026-01-31T23:59:59Z"), timezone: "UTC" };

describe("admin analytics aggregations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pageViews.mockResolvedValue([{ visitorId: "v1", sessionId: "s1", path: "/plans?token=hidden", enteredAt: new Date("2026-01-02"), durationSeconds: 30, exitedAt: new Date() }]);
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

  it("returns sanitized traffic and event aggregates without raw metadata", async () => {
    const [traffic, eventResult] = await Promise.all([getAnalyticsTraffic(filters), getAnalyticsEvents(filters)]);
    expect(traffic.topPages[0]?.path).toBe("/plans");
    expect(JSON.stringify(traffic)).not.toContain("hidden");
    expect(eventResult.paymentMethodBreakdown).toEqual([{ paymentMethodType: "card", count: 1 }]);
    expect(JSON.stringify(eventResult)).not.toContain("never-return");
  });

  it("keeps the store funnel separate from membership activation", async () => {
    events.mockResolvedValue([{ eventName: "checkout_started", entityType: "order", entityId: "order-1", entityName: "Order", metadata: null, createdAt: new Date() }, { eventName: "payment_succeeded", entityType: "order", entityId: "order-1", entityName: "Order", metadata: null, createdAt: new Date() }]);
    const result = await getAnalyticsConversions(filters);
    expect(result.storeFunnel).toMatchObject({ checkoutStarted: 1, paymentSucceeded: 1, membershipActivated: 0 });
    expect(result.byEntityType.find((entry) => entry.entityType === "subscription")?.membershipActivated).toBe(0);
  });
});
