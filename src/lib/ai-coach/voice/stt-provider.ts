import { normalizeEgyptianTranscript } from "@/lib/ai-coach/voice/dialect-normalizer";
import { voiceDebugEnabled } from "@/lib/ai-coach/voice/config";
import type { SpeechToTextProvider } from "@/lib/ai-coach/voice/types";

export type SttErrorCode = "STT_NOT_CONFIGURED" | "STT_MODEL_INVALID" | "STT_PROVIDER_CONFIGURATION_ERROR" | "STT_BAD_REQUEST" | "PROVIDER_REJECTED_AUDIO" | "STT_AUTH_ERROR" | "STT_FILE_TOO_LARGE" | "STT_UNSUPPORTED_MEDIA" | "STT_RATE_LIMITED" | "STT_TIMEOUT" | "STT_NETWORK_ERROR" | "STT_PROVIDER_ERROR";
export class SttProviderError extends Error { constructor(public readonly code: SttErrorCode) { super(code); } }

function configuredModel() {
  const model = (process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe").trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,100}$/i.test(model)) throw new SttProviderError("STT_PROVIDER_CONFIGURATION_ERROR");
  return model;
}

export function classifySttProviderStatus(status: number): SttErrorCode {
  if (status === 400) return "STT_BAD_REQUEST";
  if (status === 401 || status === 403) return "STT_AUTH_ERROR";
  if (status === 404) return "STT_MODEL_INVALID";
  if (status === 413) return "STT_FILE_TOO_LARGE";
  if (status === 415) return "STT_UNSUPPORTED_MEDIA";
  if (status === 429) return "STT_RATE_LIMITED";
  return status >= 500 ? "STT_PROVIDER_ERROR" : "PROVIDER_REJECTED_AUDIO";
}

export function createSttProviderFile(audioBuffer: ArrayBuffer, filename: string) {
  const outgoingName = filename.toLowerCase().endsWith(".webm") ? filename : "recording.webm";
  return new File([audioBuffer], outgoingName, { type: "audio/webm" });
}

function sanitizeProviderError(body: unknown) {
  const error = body && typeof body === "object" && "error" in body ? (body as { error?: unknown }).error : body;
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return {
    providerErrorType: typeof value.type === "string" ? value.type.slice(0, 80) : null,
    providerErrorCode: typeof value.code === "string" ? value.code.slice(0, 80) : null,
    providerErrorParam: typeof value.param === "string" ? value.param.slice(0, 80) : null,
    providerErrorMessageSanitized: typeof value.message === "string" ? value.message.replace(/[\r\n]/g, " ").slice(0, 180) : null,
  };
}

export const openAiSttProvider: SpeechToTextProvider = { async transcribe({ audio, filename, localeHint }) {
  if (!process.env.OPENAI_API_KEY) throw new SttProviderError("STT_NOT_CONFIGURED");
  const model = configuredModel();
  const audioBuffer = await audio.arrayBuffer();
  const providerFile = createSttProviderFile(audioBuffer, filename);
  const firstBytes = new Uint8Array(audioBuffer.slice(0, 4));
  const isEbml = firstBytes[0] === 0x1a && firstBytes[1] === 0x45 && firstBytes[2] === 0xdf && firstBytes[3] === 0xa3;
  if (voiceDebugEnabled()) console.info("[VOICE_STT_PROVIDER]", { requestModelConfigured: Boolean(model), modelNameValidFormat: true, outgoingFileName: providerFile.name, outgoingMime: providerFile.type, outgoingFileSize: providerFile.size, outgoingSignatureType: isEbml ? "ebml_webm" : "unknown", requestEndpointKind: "audio_transcriptions" });
  const form = new FormData(); form.set("file", providerFile); form.set("model", model); if (localeHint === "en" || localeHint === "ar") form.set("language", localeHint);
  let response: Response;
  try { response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(Number(process.env.AI_COACH_STT_TIMEOUT_MS ?? 15_000)) }); }
  catch (error) { throw new SttProviderError(error instanceof DOMException && error.name === "TimeoutError" ? "STT_TIMEOUT" : "STT_NETWORK_ERROR"); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (voiceDebugEnabled()) console.info("[VOICE_STT_PROVIDER]", { providerHttpStatus: response.status, ...sanitizeProviderError(body), requestModelConfigured: Boolean(model), outgoingFileName: providerFile.name, outgoingMime: providerFile.type, outgoingFileSize: providerFile.size, requestEndpointKind: "audio_transcriptions" });
    throw new SttProviderError(classifySttProviderStatus(response.status));
  }
  const data = await response.json().catch(() => null) as { text?: unknown; language?: unknown } | null;
  if (!data || typeof data.text !== "string") throw new SttProviderError("STT_PROVIDER_ERROR");
  const rawTranscript = data.text.trim(); const normalized = normalizeEgyptianTranscript(rawTranscript);
  return { rawTranscript, normalizedTranscript: normalized.normalizedTranscript, detectedLanguage: typeof data.language === "string" ? data.language : null, confidence: null, durationMs: null, needsConfirmation: normalized.needsConfirmation, warnings: normalized.uncertainSegments };
} };
