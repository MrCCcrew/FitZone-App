import { NextResponse } from "next/server";
import { z } from "zod";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { realtimeVoiceEnabled } from "@/lib/ai-coach/voice/config";
import { isCoachVoice, voiceDebugEnabled } from "@/lib/ai-coach/voice/config";
import { openAiRealtimeProvider } from "@/lib/ai-coach/voice/realtime-provider";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { getCurrentAppUser } from "@/lib/app-session";
import { finalizeVoiceSession, startVoiceRealtimeSession, voiceQuotaEnabled, VoiceQuotaError } from "@/lib/ai-coach/voice/quota";

const schema = z.object({ sessionId: z.string().min(8).max(128), lang: z.enum(["ar", "en"]).default("ar"), voice: z.string().optional() });

export async function POST(req: Request) {
  if (!realtimeVoiceEnabled()) return NextResponse.json({ errorCode: "REALTIME_DISABLED" }, { status: 503 });
  if (!applyRateLimit(`voice-realtime:${getClientIp(req)}`, 4, 60_000).ok) return NextResponse.json({ errorCode: "REALTIME_RATE_LIMITED" }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await ownsCoachSession(parsed.data.sessionId))) return NextResponse.json({ errorCode: "SESSION_UNAVAILABLE" }, { status: 403 });
  if (parsed.data.voice && !isCoachVoice(parsed.data.voice)) return NextResponse.json({ errorCode: "REALTIME_VOICE_INVALID" }, { status: 400 });
  const quotaEnabled = voiceQuotaEnabled();
  const user = quotaEnabled ? await getCurrentAppUser() : null;
  if (quotaEnabled && !user) return NextResponse.json({ errorCode: "VOICE_LOGIN_REQUIRED" }, { status: 401 });
  let voiceSession: Awaited<ReturnType<typeof startVoiceRealtimeSession>> | null = null;
  try {
    if (quotaEnabled && user) {
      const chatSession = await (await import("@/lib/db")).db.chatSession.findUnique({ where: { id: parsed.data.sessionId }, select: { userId: true } });
      if (!chatSession || chatSession.userId !== user.id) return NextResponse.json({ errorCode: "SESSION_UNAVAILABLE" }, { status: 403 });
      voiceSession = await startVoiceRealtimeSession({ userId: user.id, chatSessionId: parsed.data.sessionId });
    }
    const session = await openAiRealtimeProvider.createSession(parsed.data);
    if (voiceDebugEnabled()) console.info("[VOICE_REALTIME_SESSION]", { realtimeModel: session.model, realtimeVoice: session.voice, outputAudioFormat: "realtime_remote_audio", speed: 1, instructionsConfigured: true, fallbackUsed: session.fallbackUsed });
    return NextResponse.json({ clientSecret: session.token, expiresAt: voiceSession?.expiresAt.toISOString() ?? session.expiresAt, model: session.model, voice: session.voice, voiceSessionId: voiceSession?.voiceSessionId });
  } catch (error) {
    if (voiceSession && user) await finalizeVoiceSession({ voiceSessionId: voiceSession.voiceSessionId, userId: user.id, chatSessionId: parsed.data.sessionId, reason: "connection_failed" }).catch(() => {});
    if (error instanceof VoiceQuotaError) return NextResponse.json({ errorCode: error.code }, { status: error.code === "VOICE_QUOTA_EXHAUSTED" ? 429 : 409 });
    const code = error instanceof Error ? error.message : "REALTIME_PROVIDER_ERROR";
    return NextResponse.json({ errorCode: code === "REALTIME_NOT_CONFIGURED" ? code : "REALTIME_UNAVAILABLE" }, { status: 503 });
  }
}
