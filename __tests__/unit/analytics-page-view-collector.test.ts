import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn(), })) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => ({ ok: true })), getClientIp: vi.fn(() => "test") }));
vi.mock("@/lib/analytics/privacy", () => ({ isAnalyticsBot: vi.fn(() => false), sanitizeAnalyticsPath: vi.fn((value: string) => value.startsWith("/admin") ? null : value.split("?")[0]) }));
vi.mock("@/lib/analytics/visitor-session", () => ({ ANALYTICS_VISITOR_COOKIE: { name: "vid" }, ANALYTICS_SESSION_COOKIE: { name: "sid", httpOnly: true }, getOrCreateAnalyticsVisitor: vi.fn(), getOrCreateAnalyticsSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { analyticsPageView: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }, analyticsSession: { update: vi.fn() } } }));
import { POST } from "@/app/api/analytics/collect/route";
import { db } from "@/lib/db";
import { getOrCreateAnalyticsSession, getOrCreateAnalyticsVisitor } from "@/lib/analytics/visitor-session";
import { isAnalyticsBot, sanitizeAnalyticsPath } from "@/lib/analytics/privacy";
import { applyRateLimit } from "@/lib/rate-limit";

const request = (path: string) => new Request("http://localhost/api/analytics/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventName: "page_view", path }) });
describe("analytics page-view collector", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(isAnalyticsBot).mockReturnValue(false); vi.mocked(applyRateLimit).mockReturnValue({ ok: true } as never); vi.mocked(getOrCreateAnalyticsVisitor).mockResolvedValue({ visitor: { id: "v" }, anonymousId: "id", created: true } as never); vi.mocked(getOrCreateAnalyticsSession).mockResolvedValue({ session: { id: "s", landingPage: null, pageViewCount: 0 }, created: true } as never); vi.mocked(db.analyticsPageView.findFirst).mockResolvedValue(null); });
  it("creates visitor, session and first page view", async () => { await POST(request("/")); expect(getOrCreateAnalyticsVisitor).toHaveBeenCalled(); expect(getOrCreateAnalyticsSession).toHaveBeenCalled(); expect(db.analyticsPageView.create).toHaveBeenCalled(); expect(db.analyticsSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isBounce: true }) })); });
  it("reuses strict-mode duplicate without increment", async () => { vi.mocked(db.analyticsPageView.findFirst).mockResolvedValue({ id: "p", path: "/", enteredAt: new Date() } as never); await POST(request("/")); expect(db.analyticsPageView.create).not.toHaveBeenCalled(); expect(db.analyticsSession.update).not.toHaveBeenCalled(); });
  it("closes previous path and opens next page", async () => { vi.mocked(getOrCreateAnalyticsSession).mockResolvedValue({ session: { id: "s", landingPage: "/", pageViewCount: 1 }, created: false } as never); vi.mocked(db.analyticsPageView.findFirst).mockResolvedValue({ id: "p", path: "/", enteredAt: new Date() } as never); await POST(request("/offers")); expect(db.analyticsPageView.update).toHaveBeenCalled(); expect(db.analyticsPageView.create).toHaveBeenCalled(); expect(db.analyticsSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isBounce: false, exitPage: "/offers" }) })); });
  it("ignores admin paths and bots", async () => { await POST(request("/admin")); expect(db.analyticsPageView.create).not.toHaveBeenCalled(); vi.mocked(isAnalyticsBot).mockReturnValue(true); await POST(request("/")); expect(db.analyticsPageView.create).not.toHaveBeenCalled(); });
  it("uses a fresh session after database inactivity", async () => { vi.mocked(getOrCreateAnalyticsSession).mockResolvedValue({ session: { id: "new", landingPage: null, pageViewCount: 0 }, created: true } as never); await POST(request("/")); expect(getOrCreateAnalyticsSession).toHaveBeenCalled(); });
  it("ignores untrusted body IDs", async () => { const req = new Request("http://localhost/api/analytics/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventName: "page_view", path: "/", userId: "bad", visitorId: "bad", sessionId: "bad" }) }); await POST(req); expect(getOrCreateAnalyticsVisitor).toHaveBeenCalledWith(undefined); });
  it("strips sensitive URL values", () => { expect(sanitizeAnalyticsPath("/x?token=a&email=b&payment=c&key=d&session=e&ok=1")).toBe("/x"); });
  it("uses the defined cookie policy", async () => { await POST(request("/")); expect((await POST(request("/"))).headers.get("set-cookie")).toContain("HttpOnly"); });
  it("does not create analytics events for page views", async () => { await POST(request("/")); expect((db as any).analyticsEvent).toBeUndefined(); });
  it("rejects rate-limited requests without writes", async () => { vi.mocked(applyRateLimit).mockReturnValue({ ok: false } as never); const response = await POST(request("/")); expect(response.status).toBe(429); expect(db.analyticsPageView.create).not.toHaveBeenCalled(); });
});
