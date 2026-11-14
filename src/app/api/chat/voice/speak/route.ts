import { NextResponse } from "next/server";
import { selectVoiceText } from "@/lib/ai-coach/voice/route-helpers";
import { db } from "@/lib/db";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { configuredTtsVoice, configuredVoiceSpeed, ttsEnabled, voiceDebugEnabled } from "@/lib/ai-coach/voice/config";
import { openAiTtsProvider } from "@/lib/ai-coach/voice/tts-provider";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!ttsEnabled()) return NextResponse.json({ error: "Voice playback is unavailable.", ...(voiceDebugEnabled() ? { errorCode: "TTS_VOICE_NOT_CONFIGURED" } : {}) }, { status: 503 });
  if (!applyRateLimit(`voice-tts:${getClientIp(req)}`, 10, 60_000).ok) return NextResponse.json({ error: "Too many voice requests." }, { status: 429 });
  try {
    const body = await req.json(); const sessionId = String(body?.sessionId ?? ""); const messageId = String(body?.messageId ?? ""); const speed = Math.min(1.2, Math.max(.8, Number(body?.speed) || configuredVoiceSpeed()));
    if (!(await ownsCoachSession(sessionId))) return NextResponse.json({ error: "Session unavailable." }, { status: 403 });
    const message = await db.chatMessage.findFirst({ where: { id: messageId, sessionId, senderType: "bot" }, select: { content: true, metadata: true } });
    if (!message || message.content.length > 1200) return NextResponse.json({ error: "Message unavailable." }, { status: 404 });
    const voice = configuredTtsVoice();
    if (!voice) return NextResponse.json({ error: "Voice playback is unavailable.", ...(voiceDebugEnabled() ? { errorCode: "TTS_VOICE_NOT_CONFIGURED" } : {}) }, { status: 503 });
    const speech = await openAiTtsProvider.synthesize({ text: selectVoiceText(message.content, message.metadata), voice, speed });
    if (voiceDebugEnabled()) console.info("[AI_COACH_LISTEN]", { source: "openai-tts", requestedVoice: voice, contentType: speech.contentType });
    return new NextResponse(speech.audio, { headers: { "Content-Type": speech.contentType, "Cache-Control": "private, max-age=300", "X-AI-Coach-Audio-Source": "openai-tts" } });
  } catch { return NextResponse.json({ error: "الرد النصي جاهز، لكن تشغيل الصوت مش متاح دلوقتي." }, { status: 502 }); }
}
