import { beforeEach, describe, expect, it, vi } from "vitest";

const VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: (name: string) => ({ value: name === "vid" ? VISITOR_ID : "ckanalyticsession123" }) })) }));
vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: vi.fn(async () => ({ id: "server-user" })) }));
vi.mock("@/lib/analytics/visitor-session", () => ({ ANALYTICS_VISITOR_COOKIE: { name: "vid" }, ANALYTICS_SESSION_COOKIE: { name: "sid" } }));
vi.mock("@/lib/analytics/business-events", () => ({ recordBusinessAnalyticsEvent: vi.fn(async () => ({ recorded: true, ignored: false, eventId: "event" })) }));
vi.mock("@/lib/db", () => ({ db: { membership: { findUnique: vi.fn() }, offer: { findUnique: vi.fn() } } }));

import { POST } from "@/app/api/analytics/business-event/route";
import { db } from "@/lib/db";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

const request = (body: Record<string, unknown>) => new Request("http://localhost/api/analytics/business-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
describe("business view endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.membership.findUnique).mockResolvedValue({ id: "m1", name: "Plan", kind: "subscription", isActive: true } as never);
    vi.mocked(db.offer.findUnique).mockResolvedValue({ id: "o1", title: "Offer", isActive: true } as never);
  });
  it.each([
    ["subscription_viewed", "m1"],
    ["package_viewed", "m1"],
    ["offer_viewed", "o1"],
  ])("records valid %s with server-resolved values", async (eventName, entityId) => {
    if (eventName === "package_viewed") vi.mocked(db.membership.findUnique).mockResolvedValue({ id: "m1", name: "Package", kind: "package", isActive: true } as never);
    await POST(request({ eventName, entityId, userId: "body-user", visitorId: "body-visitor", sessionId: "body-session", entityName: "body-name" }));
    expect(recordBusinessAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({ entityId, userId: "server-user", visitorAnonymousId: VISITOR_ID }));
    expect(recordBusinessAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({ entityType: eventName.replace("_viewed", "") }));
    expect(recordBusinessAnalyticsEvent).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "body-user" }));
  });
  it("does not record missing entities or entity type mismatches", async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(null);
    expect((await POST(request({ eventName: "subscription_viewed", entityId: "missing" }))).status).toBe(404);
    vi.mocked(db.membership.findUnique).mockResolvedValue({ id: "m1", name: "Plan", kind: "package", isActive: true } as never);
    expect((await POST(request({ eventName: "subscription_viewed", entityId: "m1" }))).status).toBe(400);
    expect(recordBusinessAnalyticsEvent).not.toHaveBeenCalled();
  });
  it("rejects payment events and returns an ignored result when analytics context is absent", async () => {
    expect((await POST(request({ eventName: "payment_succeeded", entityId: "m1" }))).status).toBe(400);
    vi.mocked(recordBusinessAnalyticsEvent).mockResolvedValueOnce({ recorded: false, ignored: true, reason: "missing_analytics_context" });
    expect(await (await POST(request({ eventName: "subscription_viewed", entityId: "m1" }))).json()).toMatchObject({ ignored: true });
  });
  it("does not let analytics failures break the endpoint", async () => {
    vi.mocked(recordBusinessAnalyticsEvent).mockRejectedValueOnce(new Error("analytics failed"));
    expect(await (await POST(request({ eventName: "subscription_viewed", entityId: "m1" }))).json()).toMatchObject({ recorded: false, reason: "analytics_error" });
  });
});
