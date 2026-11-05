export type TranscriptionResult = { rawTranscript: string; normalizedTranscript: string; detectedLanguage: string | null; confidence: number | null; durationMs: number | null; needsConfirmation: boolean; warnings: string[] };
export type SpeechResult = { audio: ArrayBuffer; contentType: string };
export interface SpeechToTextProvider { transcribe(input: { audio: Blob; filename: string; localeHint?: string }): Promise<TranscriptionResult>; }
export interface TextToSpeechProvider { synthesize(input: { text: string; voice: string; speed: number }): Promise<SpeechResult>; }
export interface RealtimeVoiceProvider { createSession(input: { sessionId: string; lang: "ar" | "en"; voice?: string }): Promise<{ token: string; expiresAt: string; model: string; voice: string; fallbackUsed: boolean }>; }
