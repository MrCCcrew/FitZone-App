import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    analyticsPageView: { findMany: vi.fn() },
    analyticsSession: { findMany: vi.fn() },
    analyticsEvent: { findMany: vi.fn() },
    voiceRealtimeSession: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { getAnalyticsOverview } from "@/lib/analytics/admin-queries";

describe("AI Coach analytics overview", () => {
  beforeEach(() => {
    vi.mocked(db.voiceRealtimeSession.findMany).mockResolvedValue([]);
    vi.clearAllMocks();

    vi.mocked(db.analyticsPageView.findMany).mockResolvedValue([]);
    vi.mocked(db.analyticsSession.findMany).mockResolvedValue([]);

    vi.mocked(db.analyticsEvent.findMany).mockResolvedValue([
      {
        eventName: "ai_coach_open",
        entityType: "ai_coach",
        entityId: "chat-1",
        entityName: "AI Coach",
        metadata: null,
        createdAt: new Date("2026-08-16T10:00:00Z"),
        visitorId: "visitor-1",
        userId: null,
      },
      {
        eventName: "ai_coach_open",
        entityType: "ai_coach",
        entityId: "chat-1",
        entityName: "AI Coach",
        metadata: null,
        createdAt: new Date("2026-08-16T10:01:00Z"),
        visitorId: "visitor-1",
        userId: null,
      },
      {
        eventName: "ai_coach_message",
        entityType: "ai_coach",
        entityId: "chat-1",
        entityName: "AI Coach",
        metadata: {
          messageLength: 25,
          inputMode: "typed",
        },
        createdAt: new Date("2026-08-16T10:02:00Z"),
        visitorId: "visitor-1",
        userId: null,
      },
      {
        eventName: "ai_coach_response",
        entityType: "ai_coach",
        entityId: "chat-1",
        entityName: "AI Coach",
        metadata: {
          responseTimeMs: 400,
          success: true,
        },
        createdAt: new Date("2026-08-16T10:02:01Z"),
        visitorId: "visitor-1",
        userId: null,
      },
      {
        eventName: "ai_coach_open",
        entityType: "ai_coach",
        entityId: "chat-2",
        entityName: "AI Coach",
        metadata: null,
        createdAt: new Date("2026-08-16T11:00:00Z"),
        visitorId: null,
        userId: "user-2",
      },
    ] as never);
  });

  it("separates opens, unique openers and real message users", async () => {
    const result = await getAnalyticsOverview({
      from: new Date("2026-08-15T21:00:00Z"),
      to: new Date("2026-08-16T20:59:59.999Z"),
      timezone: "Asia/Kuwait",
    });

    expect(result.aiCoach).toEqual({
      opens: 3,
      uniqueVisitorsOpened: 2,
      messages: 1,
      uniqueVisitorsMessaged: 1,
      responses: 1,
      errors: 0,
      responseSuccessRate: 100,
      voice: {
        available: true,
        sessionsStarted: 0,
        sessionsConnected: 0,
        uniqueUsers: 0,
        sessionsFinalized: 0,
        totalBillableSeconds: 0,
        averageBillableSeconds: 0,
        connectionRate: 0,
        terminationReasons: [],
      },
    });
  });
});
