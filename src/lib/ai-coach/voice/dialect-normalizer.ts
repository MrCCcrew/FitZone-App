const REPLACEMENTS: Array<[RegExp, string]> = [[/\bعاوزه?\b/gi, "عايزة"], [/\bدلوجت[يى]?\b/gi, "دلوقتي"], [/\bدلوقيت[يى]?\b/gi, "دلوقتي"], [/\bامتي\b/gi, "إمتى"], [/\bميتين\b/gi, "إمتى"], [/\bفيت\s*زون\b/gi, "FitZone"], [/\bkick\s*boxing\b/gi, "kick boxing"], [/\bكيك\s*بوكس(?:ينج)?\b/gi, "كيك بوكس"]];
const SENSITIVE = /(?:مش|ما|لا|احذف|عدل|رصيد|نقاط|ادفع|مستخدم|بكره|بكرة|اليوم|حامل|دواء|وجع|الم|صدر|تنفس)|\d+/i;
export function normalizeEgyptianTranscript(raw: string) {
  let text = raw.replace(/\s+/g, " ").trim(); let changed = text !== raw.trim();
  for (const [pattern, replacement] of REPLACEMENTS) { const next = text.replace(pattern, replacement); changed ||= next !== text; text = next; }
  return { normalizedTranscript: text, changed, needsConfirmation: SENSITIVE.test(text), uncertainSegments: [] as string[] };
}
