import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ realtimeEnabled: false, quotaEnabled: true, user: null as { id: string } | null }));
const mocks = vi.hoisted(() => ({ start: vi.fn(), provider: vi.fn(), owns: vi.fn().mockResolvedValue(true) }));

vi.mock("@/lib/ai-coach/voice/config", () => ({ realtimeVoiceEnabled: () => state.realtimeEnabled, isCoachVoice: () => true, voiceDebugEnabled: () => false }));
vi.mock("@/lib/ai-coach/voice/quota", () => ({ voiceQuotaEnabled: () => state.quotaEnabled, startVoiceRealtimeSession: mocks.start, finalizeVoiceSession: vi.fn(), VoiceQuotaError: class VoiceQuotaError extends Error {} }));
vi.mock("@/lib/ai-coach/session-guard", () => ({ ownsCoachSession: mocks.owns }));
vi.mock("@/lib/ai-coach/voice/realtime-provider", () => ({ openAiRealtimeProvider: { createSession: mocks.provider } }));
vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: () => state.user }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => ({ ok: true }), getClientIp: () => "127.0.0.1" }));

import { POST } from "@/app/api/chat/voice/realtime/session/route";

const request = () => new Request("http://localhost/api/chat/voice/realtime/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: "session-12345678", lang: "ar" }) });

describe("realtime voice session guards", () => {
  beforeEach(() => { state.realtimeEnabled = false; state.quotaEnabled = true; state.user = null; vi.clearAllMocks(); mocks.owns.mockResolvedValue(true); });

  it("feature flag disables realtime before any provider or database session call", async () => {
    const response = await POST(request());
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ errorCode: "REALTIME_DISABLED" });
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });

  it("guest users are denied before an ephemeral OpenAI session can be created", async () => {
    state.realtimeEnabled = true;
    const response = await POST(request());
    expect(response.status).toBe(401); expect(await response.json()).toMatchObject({ errorCode: "VOICE_LOGIN_REQUIRED" });
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled();
  });
});
