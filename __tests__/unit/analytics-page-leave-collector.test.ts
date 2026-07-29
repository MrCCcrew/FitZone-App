import { beforeEach, describe, expect, it, vi } from "vitest";

const VISITOR_ID = "550e8400-e29b-41d4-a716-446655440000";
const now = new Date();
const cookieGet = vi.fn((name: string) => ({ value: name === "vid" ? VISITOR_ID : "session-id" }));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => ({ ok: true })), getClientIp: vi.fn(() => "test") }));
vi.mock("@/lib/analytics/privacy", () => ({ isAnalyticsBot: vi.fn(() => false), sanitizeAnalyticsPath: vi.fn((value: string) => value) }));
vi.mock("@/lib/analytics/visitor-session", () => ({
  ANALYTICS_VISITOR_COOKIE: { name: "vid" },
  ANALYTICS_SESSION_COOKIE: { name: "sid" },
  getOrCreateAnalyticsVisitor: vi.fn(),
  getOrCreateAnalyticsSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    analyticsVisitor: { findUnique: vi.fn() },
    analyticsSession: { findUnique: vi.fn(), update: vi.fn() },
    analyticsPageView: { findFirst: vi.fn(), updateMany: vi.fn() },
    analyticsEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { POST } from "@/app/api/analytics/collect/route";
import { db } from "@/lib/db";

const request = (body: Record<string, unknown> = {}) => new Request("http://localhost/api/analytics/collect", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ eventName: "page_leave", path: "/classes", ...body }),
});

describe("analytics page-leave collector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieGet.mockImplementation((name: string) => ({ value: name === "vid" ? VISITOR_ID : "session-id" }));
    vi.mocked(db.analyticsVisitor.findUnique).mockResolvedValue({ id: "visitor-db-id" } as never);
    vi.mocked(db.analyticsSession.findUnique).mockResolvedValue({
      id: "session-id", visitorId: "visitor-db-id", lastActivityAt: new Date(now.getTime() - 30_000),
    } as never);
    vi.mocked(db.analyticsPageView.findFirst).mockResolvedValue({ id: "page-view-id" } as never);
    vi.mocked(db.analyticsPageView.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.analyticsSession.update).mockResolvedValue({} as never);
    vi.mocked(db.$transaction).mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db) as never);
  });

  it("closes an open page view and adds the same server delta to it and its session", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.analyticsPageView.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "page-view-id", exitedAt: null },
      data: expect.objectContaining({ exitedAt: expect.any(Date), durationSeconds: { increment: expect.any(Number) } }),
    }));
    const updateManyCall = vi.mocked(db.analyticsPageView.updateMany).mock.calls[0];
    expect(updateManyCall).toBeDefined();
    const pageDelta = (updateManyCall![0] as { data: { durationSeconds: { increment: number } } }).data.durationSeconds.increment;
    expect(db.analyticsSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      durationSeconds: { increment: pageDelta }, exitPage: "/classes", lastActivityAt: expect.any(Date),
    }) }));
  });

  it("treats a lost atomic close race as a duplicate without updating the session", async () => {
    vi.mocked(db.analyticsPageView.updateMany).mockResolvedValue({ count: 0 } as never);
    const response = await POST(request());
    expect(await response.json()).toEqual({ ignored: true });
    expect(db.analyticsSession.update).not.toHaveBeenCalled();
  });

  it("ignores an absent or already-closed page view without writes", async () => {
    vi.mocked(db.analyticsPageView.findFirst).mockResolvedValue(null);
    expect(await (await POST(request())).json()).toEqual({ ignored: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.analyticsSession.update).not.toHaveBeenCalled();
  });

  it("ignores a foreign or expired session", async () => {
    vi.mocked(db.analyticsSession.findUnique)
      .mockResolvedValueOnce({ id: "session-id", visitorId: "other", lastActivityAt: new Date(now.getTime() - 30_000) } as never)
      .mockResolvedValueOnce({ id: "session-id", visitorId: "visitor-db-id", lastActivityAt: new Date(now.getTime() - 31 * 60_000) } as never);
    await POST(request());
    await POST(request());
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("ignores client IDs and durations, caps delta, and preserves unrelated session fields", async () => {
    vi.mocked(db.analyticsSession.findUnique).mockResolvedValue({
      id: "session-id", visitorId: "visitor-db-id", lastActivityAt: new Date(now.getTime() - 120_000),
    } as never);
    await POST(request({ durationSeconds: 9999, elapsedSeconds: 9999, userId: "bad", visitorId: "bad", sessionId: "bad", pageViewId: "bad" }));
    expect(db.analyticsPageView.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ durationSeconds: { increment: 60 } }) }));
    const update = vi.mocked(db.analyticsSession.update).mock.calls[0][0];
    expect(update.data).toMatchObject({ durationSeconds: { increment: 60 }, exitPage: "/classes" });
    expect(update.data).not.toHaveProperty("pageViewCount");
    expect(update.data).not.toHaveProperty("isBounce");
    expect(update.data).not.toHaveProperty("landingPage");
    expect(update.data).not.toHaveProperty("endedAt");
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });
});
