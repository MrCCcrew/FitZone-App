import { beforeEach, describe, expect, it, vi } from "vitest";

const VISITOR_ANONYMOUS_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION_ID = "ckanalyticsession123";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    analyticsVisitor: { findUnique: vi.fn() },
    analyticsSession: { findUnique: vi.fn(), update: vi.fn() },
    analyticsPageView: { update: vi.fn() },
    analyticsEvent: { create: vi.fn() },
  },
}));

import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";
import { db } from "@/lib/db";

const input = (eventName: string, overrides: Record<string, unknown> = {}) => ({
  eventName,
  visitorAnonymousId: VISITOR_ANONYMOUS_ID,
  sessionPublicId: SESSION_ID,
  entityType: "subscription",
  entityId: "membership-1",
  ...overrides,
});

describe("business analytics events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.analyticsVisitor.findUnique).mockResolvedValue({ id: "visitor-id" } as never);
    vi.mocked(db.analyticsSession.findUnique).mockResolvedValue({ id: SESSION_ID, visitorId: "visitor-id" } as never);
    vi.mocked(db.analyticsEvent.create).mockResolvedValue({ id: "event-id" } as never);
  });

  it.each([
    ["subscription_viewed", {}],
    ["package_viewed", { entityType: "package" }],
    ["offer_viewed", { entityType: "offer" }],
    ["checkout_started", { entityType: "order", value: 120, currency: "KWD" }],
    ["membership_activated", { entityType: "offer" }],
  ])("records valid %s events", async (eventName, overrides) => {
    const result = await recordBusinessAnalyticsEvent(input(eventName, overrides));
    expect(result).toMatchObject({ recorded: true, ignored: false, eventId: "event-id" });
  });

  it("forces payment success state and only preserves allowed payment metadata", async () => {
    const result = await recordBusinessAnalyticsEvent(input("payment_succeeded", { metadata: { paymentMethodType: "card", token: "secret" } }));
    expect(result.recorded).toBe(true);
    expect(db.analyticsEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { paymentMethodType: "card", success: true } }) }));
  });

  it("forces payment failure state and strips raw gateway details", async () => {
    const result = await recordBusinessAnalyticsEvent(input("payment_failed", { metadata: { failureCategory: "declined", rawError: "token=secret" } }));
    expect(result.recorded).toBe(true);
    expect(db.analyticsEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: { failureCategory: "declined", success: false } }) }));
  });

  it.each([
    [input("unknown_event")],
    [input("subscription_viewed", { entityId: undefined })],
    [input("checkout_started", { entityType: "bad" })],
    [input("checkout_started", { entityType: "order", value: -1 })],
    [input("checkout_started", { entityType: "order", currency: "kwd" })],
    [input("payment_succeeded", { success: false })],
    [input("payment_failed", { success: true })],
    [input("membership_activated", { success: false })],
  ])("rejects invalid event input", async (event) => {
    const result = await recordBusinessAnalyticsEvent(event as never);
    expect(result.recorded).toBe(false);
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it("does not use invalid IDs or a session that belongs to a different visitor", async () => {
    expect((await recordBusinessAnalyticsEvent(input("subscription_viewed", { visitorAnonymousId: "bad" }))).ignored).toBe(true);
    vi.mocked(db.analyticsSession.findUnique).mockResolvedValue({ id: SESSION_ID, visitorId: "other" } as never);
    expect((await recordBusinessAnalyticsEvent(input("subscription_viewed"))).ignored).toBe(true);
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it("records with trusted user context when visitor/session is unavailable", async () => {
    const result = await recordBusinessAnalyticsEvent(input("subscription_viewed", { visitorAnonymousId: undefined, userId: "trusted-user" }));
    expect(result).toMatchObject({ recorded: true, ignored: false });
  });

  it("uses only safe metadata and ignores client occurredAt", async () => {
    await recordBusinessAnalyticsEvent(input("checkout_started", {
      entityType: "order",
      entityName: "  Summer\nOffer  ",
      metadata: { source: "checkout", email: "member@example.com", messageLength: 99 },
      occurredAt: "2000-01-01T00:00:00.000Z",
    }));
    const data = vi.mocked(db.analyticsEvent.create).mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.entityName).toBe("Summer Offer");
    expect(data.metadata).toEqual({ source: "checkout" });
    expect(data).not.toHaveProperty("occurredAt");
  });

  it("does not update sessions or page views and safely absorbs Prisma failures", async () => {
    vi.mocked(db.analyticsEvent.create).mockRejectedValue(new Error("database unavailable"));
    const result = await recordBusinessAnalyticsEvent(input("subscription_viewed"));
    expect(result).toEqual({ recorded: false, ignored: false, reason: "analytics_error" });
    expect(db.analyticsSession.update).not.toHaveBeenCalled();
    expect(db.analyticsPageView.update).not.toHaveBeenCalled();
  });
});
