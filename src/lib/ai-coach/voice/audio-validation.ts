import { maxVoiceBytes, maxVoiceSeconds } from "@/lib/ai-coach/voice/config";
const ALLOWED = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/wav", "audio/x-wav"]);
export async function validateVoiceAudio(file: File, declaredDurationMs?: number | null) {
  if (!file.size) return { ok: false as const, error: "empty" };
  if (file.size > maxVoiceBytes()) return { ok: false as const, error: "too_large" };
  const mime = file.type.toLowerCase().split(";", 1)[0].trim();
  if (!ALLOWED.has(mime)) return { ok: false as const, error: "type" };
  if (declaredDurationMs && (declaredDurationMs < 250 || declaredDurationMs > maxVoiceSeconds() * 1000)) return { ok: false as const, error: "duration" };
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = String.fromCharCode(...bytes);
  const isEbml = bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const recognized = isEbml || text.startsWith("RIFF") || text.includes("ftyp") || text.includes("OggS");
  return recognized ? { ok: true as const } : { ok: false as const, error: "signature" };
}
