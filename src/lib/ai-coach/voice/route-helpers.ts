// Pure voice route helpers; no API route exports.

export const isForbiddenRealtimeToolRequest = (query: string) => /(?:غي[ّ]?ر(?:ي)?|عد[ّ]?ل|احذف|امسح|ادفع|نف[ّ]?ذ|change|edit|delete|remove|pay|execute)/i.test(query) && /(?:رصيدي|رصيد|نقاطي|نقاط|اشتراكي|اشتراك|عضويتي|عضوية|price|balance|points|membership|sql)/i.test(query);

export function realtimeVoiceSummary(content: string, metadata: string | null) {
  try {
    const parsed = metadata ? JSON.parse(metadata) as { structured?: { voiceSummary?: unknown } } : null;
    if (typeof parsed?.structured?.voiceSummary === "string" && parsed.structured.voiceSummary.trim()) return parsed.structured.voiceSummary.trim().slice(0, 520);
  } catch { /* use a bounded plain-text summary */ }
  const lines = content.replace(/https?:\/\/\S+/g, "").split(/\n+/).filter(Boolean).slice(0, 3).join(" ");
  return lines.length <= 520 ? lines : `${lines.slice(0, 500).replace(/\s+\S*$/, "")}…`;
}


export function selectVoiceText(content: string, metadata: string | null) {
  try {
    const parsed = metadata ? JSON.parse(metadata) as { structured?: { voiceSummary?: unknown } } : null;
    if (typeof parsed?.structured?.voiceSummary === "string" && parsed.structured.voiceSummary.trim()) return parsed.structured.voiceSummary.trim().replace(/https?:\/\/\S+/g, "");
  } catch { /* fall back to safe plain text */ }
  const withoutUrls = content.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return withoutUrls.length <= 500 ? withoutUrls : `${withoutUrls.slice(0, 470).replace(/\s+\S*$/, "")}…`;
}
