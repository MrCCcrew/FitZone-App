export const voiceEnabled = () => process.env.AI_COACH_VOICE_ENABLED === "true";
export const sttEnabled = () => voiceEnabled() && process.env.AI_COACH_STT_ENABLED === "true";
export const ttsEnabled = () => voiceEnabled() && process.env.AI_COACH_TTS_ENABLED === "true";
export const realtimeVoiceEnabled = () => voiceEnabled() && process.env.AI_COACH_REALTIME_VOICE_ENABLED === "true";
export const voiceDebugEnabled = () => process.env.NODE_ENV === "development" && process.env.AI_COACH_VOICE_DEBUG_ENABLED === "true";
export const maxVoiceSeconds = () => Math.min(Math.max(Number(process.env.AI_COACH_VOICE_MAX_SECONDS ?? 60) || 60, 5), 120);
export const maxVoiceBytes = () => Math.min(Math.max(Number(process.env.AI_COACH_VOICE_MAX_BYTES ?? 8_000_000) || 8_000_000, 100_000), 12_000_000);

export const VOICE_OPTIONS = ["marin", "cedar"] as const;
export type CoachVoice = (typeof VOICE_OPTIONS)[number];
export const isCoachVoice = (value: unknown): value is CoachVoice => typeof value === "string" && (VOICE_OPTIONS as readonly string[]).includes(value);
export const configuredCoachVoice = (requested?: unknown): CoachVoice => isCoachVoice(requested) ? requested : isCoachVoice(process.env.AI_COACH_REALTIME_VOICE) ? process.env.AI_COACH_REALTIME_VOICE : "marin";
export const configuredTtsVoice = (): CoachVoice => isCoachVoice(process.env.AI_COACH_TTS_VOICE) ? process.env.AI_COACH_TTS_VOICE : configuredCoachVoice();
export const configuredVoiceSpeed = () => Math.min(1.2, Math.max(0.8, Number(process.env.AI_COACH_VOICE_SPEED) || 1));
export const configuredRealtimeModel = () => process.env.AI_COACH_REALTIME_MODEL?.trim() || "gpt-realtime-2";
export const configuredRealtimeFallbackModel = () => process.env.AI_COACH_REALTIME_FALLBACK_MODEL?.trim() || "gpt-realtime-mini";
export const configuredTtsModel = () => process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
