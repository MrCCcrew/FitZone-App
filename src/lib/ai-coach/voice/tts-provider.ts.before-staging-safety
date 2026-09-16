import type { TextToSpeechProvider } from "@/lib/ai-coach/voice/types";
import { configuredTtsModel, voiceDebugEnabled } from "@/lib/ai-coach/voice/config";
export const openAiTtsProvider: TextToSpeechProvider = { async synthesize({ text, voice, speed }) {
  const model = configuredTtsModel(); if (voiceDebugEnabled()) console.info("[VOICE_TTS]", { ttsModel: model, ttsVoice: voice, outputAudioFormat: "mp3", speed, instructionsConfigured: true });
  const response = await fetch("https://api.openai.com/v1/audio/speech", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, voice, speed, format: "mp3", input: text, instructions: "Speak in natural, warm Egyptian Arabic with short sentences and calm pacing. Do not read URLs, metadata, or imitate a real person." }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("tts_unavailable"); return { audio: await response.arrayBuffer(), contentType: "audio/mpeg" };
} };
