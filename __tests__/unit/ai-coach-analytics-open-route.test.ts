import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  applyRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/ai-coach/session-guard", () => ({
  ownsCoachSession: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@/lib/analytics/ai-coach-events", () => ({
  recordAiCoachEvent: vi.fn(() =>
    Promise.resolve({
      recorded: true,
      ignored: false,
      eventId: "event-open",
    }),
  ),
}));

vi.mock("@/lib/db", () => ({
  db: {
    chatSession: {
      findUnique: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/analytics/ai-coach/open/route";
import { db } from "@/lib/db";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { recordAiCoachEvent } from "@/lib/analytics/ai-coach-events";

const SESSION_ID = "ckanalyticschat123";

function request() {
  return new Request(
    "http://localhost/api/analytics/ai-coach/open",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    },
  );
}

describe("AI Coach open analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ownsCoachSession).mockResolvedValue(true);

    vi.mocked(db.chatSession.findUnique).mockResolvedValue({
      id: SESSION_ID,
      userId: "user-1",
    } as never);

    vi.mocked(recordAiCoachEvent).mockResolvedValue({
      recorded: true,
      ignored: false,
      eventId: "event-open",
    });
  });

  it("records an owned AI Coach open", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);

    expect(recordAiCoachEvent).toHaveBeenCalledWith({
      eventName: "ai_coach_open",
      chatSessionId: SESSION_ID,
      userId: "user-1",
    });
  });

  it("rejects a foreign chat session without recording", async () => {
    vi.mocked(ownsCoachSession).mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(recordAiCoachEvent).not.toHaveBeenCalled();
  });

  it("does not record a missing chat session", async () => {
    vi.mocked(db.chatSession.findUnique).mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(recordAiCoachEvent).not.toHaveBeenCalled();
  });
});
