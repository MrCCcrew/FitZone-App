import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { analyticsVisitor: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }, analyticsSession: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } } }));
import { db } from "@/lib/db";
import { getOrCreateAnalyticsSession, getOrCreateAnalyticsVisitor, THIRTY_MINUTES_MS } from "@/lib/analytics/visitor-session";

describe("analytics visitor/session", () => {
  beforeEach(() => vi.clearAllMocks());
  it("creates a visitor for a missing or invalid cookie", async () => { vi.mocked(db.analyticsVisitor.findUnique).mockResolvedValue(null); vi.mocked(db.analyticsVisitor.create).mockResolvedValue({ id: "v1" } as never); const result = await getOrCreateAnalyticsVisitor("bad"); expect(result.created).toBe(true); expect(result.anonymousId).toMatch(/^[0-9a-f-]{36}$/i); });
  it("reuses and links an existing visitor", async () => { const id = "123e4567-e89b-12d3-a456-426614174000"; vi.mocked(db.analyticsVisitor.findUnique).mockResolvedValue({ id: "v1" } as never); vi.mocked(db.analyticsVisitor.update).mockResolvedValue({ id: "v1", userId: "u1" } as never); const result = await getOrCreateAnalyticsVisitor(id, "u1"); expect(result.created).toBe(false); expect(db.analyticsVisitor.update).toHaveBeenCalled(); });
  it("creates or reuses sessions from database activity", async () => { const now = new Date(); vi.mocked(db.analyticsSession.findUnique).mockResolvedValue(null); vi.mocked(db.analyticsSession.create).mockResolvedValue({ id: "s1" } as never); expect((await getOrCreateAnalyticsSession(null, "v1", null, now)).created).toBe(true); vi.mocked(db.analyticsSession.findUnique).mockResolvedValue({ id: "s1", visitorId: "v1", lastActivityAt: new Date(now.getTime() - 1000) } as never); vi.mocked(db.analyticsSession.update).mockResolvedValue({ id: "s1" } as never); expect((await getOrCreateAnalyticsSession("s1", "v1", null, now)).created).toBe(false); });
  it("rejects expired or foreign sessions", async () => { const now = new Date(); vi.mocked(db.analyticsSession.findUnique).mockResolvedValueOnce({ id: "s", visitorId: "other", lastActivityAt: now } as never).mockResolvedValueOnce({ id: "s", visitorId: "v1", lastActivityAt: new Date(now.getTime() - THIRTY_MINUTES_MS) } as never); vi.mocked(db.analyticsSession.create).mockResolvedValue({ id: "new" } as never); expect((await getOrCreateAnalyticsSession("s", "v1", null, now)).created).toBe(true); expect((await getOrCreateAnalyticsSession("s", "v1", null, now)).created).toBe(true); });
});
