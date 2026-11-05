import type { CoachLang, CoachSafetyFlags } from "@/lib/ai-coach/types";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSafetyFlags(message: string): CoachSafetyFlags {
  const text = normalize(message);
  const hasUrgentSymptom = /(chest pain|faint|fainted|shortness of breath|severe pain|difficulty breathing)/.test(text);
  const mentionsInjury = /(اصابه|injury|التواء|تمزق|fracture)/.test(text);
  const mentionsPregnancy = /(حامل|pregnan|رضاعه|breastfeeding)/.test(text);
  const mentionsChronicCondition = /(سكر|ضغط|القلب|thyroid|chronic|مزمن|ربو|asthma)/.test(text);
  const mentionsPain = /(الم|وجع|pain|hurt|injured)/.test(text);

  return {
    hasRisk: mentionsInjury || mentionsPregnancy || mentionsChronicCondition || mentionsPain,
    hasUrgentSymptom,
    mentionsInjury,
    mentionsPregnancy,
    mentionsChronicCondition,
    mentionsPain,
  };
}

export function buildSafetyNote(flags: CoachSafetyFlags, lang: CoachLang) {
  if (!flags.hasRisk) return null;

  return lang === "en"
    ? "Because you mentioned pain, injury, pregnancy, or a medical condition, keep training conservative and consult a qualified professional before changing exercise or nutrition significantly."
    : "بما أنك ذكرتِ ألمًا أو إصابة أو حملًا أو حالة صحية، فالأفضل يكون التمرين والتغذية بشكل محافظ ومع مراجعة مختص قبل أي تغيير كبير.";
}
