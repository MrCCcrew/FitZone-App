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
      eventId: "event-1",
    }),
  ),
}));

vi.mock("@/lib/chatbot", () => ({
  generateBotReply: vi.fn(() => Promise.resolve()),
  serializeChatSession: vi.fn(async (session) => session),
}));

vi.mock("@/lib/db", () => ({
  db: {
    chatSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    chatMessage: {
      create: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/chat/message/route";
import { db } from "@/lib/db";
import {
  generateBotReply,
  serializeChatSession,
} from "@/lib/chatbot";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { recordAiCoachEvent } from "@/lib/analytics/ai-coach-events";

const SESSION_ID = "ckanalyticschat123";

function request(
  content = "عايز أعرف مواعيد التمرين",
  inputMode: "typed" | "stt" = "typed",
) {
  return new Request("http://localhost/api/chat/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      content,
      lang: "ar",
      inputMode,
    }),
  });
}

const session = {
  id: SESSION_ID,
  userId: "user-1",
  visitorName: null,
  visitorPhone: null,
  mode: "bot",
};

describe("AI Coach message analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(ownsCoachSession).mockResolvedValue(true);

    vi.mocked(db.chatSession.update).mockResolvedValue({} as never);

    vi.mocked(db.chatMessage.create).mockResolvedValue({
      id: "user-message-1",
      sessionId: SESSION_ID,
      senderType: "user",
      senderName: "العميل",
      content: "عايز أعرف مواعيد التمرين",
      metadata: null,
      createdAt: new Date("2026-08-16T18:00:00.000Z"),
    } as never);

    vi.mocked(generateBotReply).mockResolvedValue(undefined as never);

    vi.mocked(recordAiCoachEvent).mockResolvedValue({
      recorded: true,
      ignored: false,
      eventId: "event-1",
    });
  });

  it("records a real user message and successful bot response", async () => {
    vi.mocked(db.chatSession.findUnique)
      .mockResolvedValueOnce(session as never)
      .mockResolvedValueOnce({ ...session, mode: "bot" } as never)
      .mockResolvedValueOnce({
        ...session,
        messages: [
          {
            id: "user-message-1",
            senderType: "user",
            content: "عايز أعرف مواعيد التمرين",
            metadata: null,
            createdAt: new Date("2026-08-16T18:00:00.000Z"),
          },
          {
            id: "bot-message-1",
            senderType: "bot",
            content: "أكيد",
            metadata: null,
            createdAt: new Date("2026-08-16T18:00:01.000Z"),
          },
        ],
        recommendedMembership: null,
        assignedTo: null,
      } as never);

    const response = await POST(request());

    expect(response.status).toBe(200);

    expect(recordAiCoachEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_message",
        chatSessionId: SESSION_ID,
        userId: "user-1",
        metadata: {
          messageLength: "عايز أعرف مواعيد التمرين".length,
          inputMode: "typed",
        },
      }),
    );

    expect(recordAiCoachEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_response",
        chatSessionId: SESSION_ID,
        metadata: expect.objectContaining({
          success: true,
          responseTimeMs: expect.any(Number),
        }),
      }),
    );

    expect(recordAiCoachEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_error",
      }),
    );
  });

  it("records the user message but not an AI response in live-support mode", async () => {
    vi.mocked(db.chatSession.findUnique)
      .mockResolvedValueOnce(session as never)
      .mockResolvedValueOnce({ ...session, mode: "live" } as never)
      .mockResolvedValueOnce({
        ...session,
        mode: "live",
        messages: [],
        recommendedMembership: null,
        assignedTo: null,
      } as never);

    const response = await POST(request());

    expect(response.status).toBe(200);

    expect(generateBotReply).not.toHaveBeenCalled();

    expect(recordAiCoachEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_message",
      }),
    );

    expect(recordAiCoachEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_response",
      }),
    );
  });

  it("records AI error when bot generation fails", async () => {
    vi.mocked(db.chatSession.findUnique)
      .mockResolvedValueOnce(session as never)
      .mockResolvedValueOnce({ ...session, mode: "bot" } as never);

    vi.mocked(generateBotReply).mockRejectedValue(
      new Error("AI unavailable"),
    );

    const response = await POST(request("اختبار صوت", "stt"));

    expect(response.status).toBe(500);

    expect(recordAiCoachEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_message",
        metadata: expect.objectContaining({
          inputMode: "stt",
        }),
      }),
    );

    expect(recordAiCoachEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_error",
        metadata: {
          inputMode: "stt",
          success: false,
        },
      }),
    );

    expect(recordAiCoachEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ai_coach_response",
      }),
    );
  });

  it("does not record analytics for a rejected foreign session", async () => {
    vi.mocked(ownsCoachSession).mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(db.chatMessage.create).not.toHaveBeenCalled();
    expect(recordAiCoachEvent).not.toHaveBeenCalled();
  });

  it("does not break chat when analytics recording fails", async () => {
    vi.mocked(db.chatSession.findUnique)
      .mockResolvedValueOnce(session as never)
      .mockResolvedValueOnce({ ...session, mode: "bot" } as never)
      .mockResolvedValueOnce({
        ...session,
        messages: [
          {
            id: "bot-message-1",
            senderType: "bot",
            content: "رد",
            metadata: null,
            createdAt: new Date("2026-08-16T18:00:01.000Z"),
          },
        ],
        recommendedMembership: null,
        assignedTo: null,
      } as never);

    vi.mocked(recordAiCoachEvent).mockRejectedValue(
      new Error("analytics unavailable"),
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(serializeChatSession).toHaveBeenCalled();
  });
});
