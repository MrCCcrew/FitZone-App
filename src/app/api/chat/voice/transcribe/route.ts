import { NextResponse } from "next/server";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { sttEnabled } from "@/lib/ai-coach/voice/config";
import { validateVoiceAudio } from "@/lib/ai-coach/voice/audio-validation";
import { openAiSttProvider, SttProviderError } from "@/lib/ai-coach/voice/stt-provider";
import { voiceDebugEnabled } from "@/lib/ai-coach/voice/config";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!sttEnabled()) return NextResponse.json({ error: "Voice transcription is unavailable." }, { status: 503 });
  if (!applyRateLimit(`voice-stt:${getClientIp(req)}`, 6, 60_000).ok) return NextResponse.json({ error: "Too many voice requests." }, { status: 429 });
  try {
    const form = await req.formData(); const sessionId = String(form.get("sessionId") ?? ""); const audio = form.get("audio"); const durationMs = Number(form.get("durationMs") ?? 0) || null;
    if (!(audio instanceof File) || !(await ownsCoachSession(sessionId))) return NextResponse.json({ error: "Session unavailable." }, { status: 403 });
    const validation = await validateVoiceAudio(audio, durationMs); if (!validation.ok) return NextResponse.json({ errorCode: "INVALID_AUDIO", error: validation.error === "empty" ? "الصوت مش واضح أو مفيش كلام اتسجل. جربي تاني وقربي من الميكروفون." : "التسجيل نفسه غير صالح. جربي تاني." }, { status: 400 });
    if (voiceDebugEnabled()) console.info("[VOICE_STT]", { validationPassed: true, normalizedMime: audio.type.toLowerCase().split(";", 1)[0], blobSize: audio.size, declaredDurationMs: durationMs, providerConfigured: Boolean(process.env.OPENAI_API_KEY), sttEnabled: sttEnabled(), providerRequestStarted: true });
    const result = await openAiSttProvider.transcribe({ audio, filename: audio.name || "voice.webm", localeHint: String(form.get("localeHint") ?? "ar") });
    if (!result.normalizedTranscript) return NextResponse.json({ errorCode: "EMPTY_TRANSCRIPT", error: "الصوت اتسجل، لكن الكلام مش واضح. جربي تتكلمي بصوت أعلى وقربي من الميكروفون." }, { status: 422 });
    if (voiceDebugEnabled()) console.info("[VOICE_STT]", { providerStatus: 200, rawTranscriptLength: result.rawTranscript.length, normalizedTranscriptLength: result.normalizedTranscript.length, needsConfirmation: result.needsConfirmation });
    return NextResponse.json({ ...result, durationMs });
  } catch (error) {
    const code = error instanceof SttProviderError ? error.code : "STT_PROVIDER_ERROR";
    const messages: Record<string, string> = { STT_NOT_CONFIGURED: "تحويل الصوت للنص مش متفعّل على السيرفر حاليًا.", STT_MODEL_INVALID: "إعداد تحويل الصوت للنص محتاج مراجعة على السيرفر.", STT_PROVIDER_CONFIGURATION_ERROR: "إعداد تحويل الصوت للنص محتاج مراجعة على السيرفر.", PROVIDER_REJECTED_AUDIO: "صيغة التسجيل ما اتقبلتش. جربي تسجلي مرة تانية.", STT_BAD_REQUEST: "طلب تحويل الصوت ما اتقبلش. جربي تسجلي مرة تانية.", STT_AUTH_ERROR: "خدمة تحويل الصوت مش متاحة حاليًا.", STT_FILE_TOO_LARGE: "التسجيل طويل أو كبير زيادة. جربي رسالة أقصر.", STT_UNSUPPORTED_MEDIA: "صيغة التسجيل ما اتقبلتش. جربي تسجلي مرة تانية.", STT_RATE_LIMITED: "استخدمي التسجيل بعد دقيقة من فضلك.", STT_TIMEOUT: "فهم التسجيل أخد وقت أطول من المتوقع. جربي تاني.", STT_NETWORK_ERROR: "في مشكلة مؤقتة في الاتصال. التسجيل ما اتبعتش بنجاح.", STT_PROVIDER_ERROR: "معرفتش أفهم التسجيل المرة دي. تقدري تعيدي التسجيل أو تكتبي سؤالك." };
    if (voiceDebugEnabled()) console.info("[VOICE_STT]", { providerErrorType: code, providerConfigured: Boolean(process.env.OPENAI_API_KEY) });
    return NextResponse.json({ errorCode: code, error: messages[code] }, { status: code === "STT_NOT_CONFIGURED" ? 503 : 502 });
  }
}
