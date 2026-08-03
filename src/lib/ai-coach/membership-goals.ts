import { normalizeArabicIntent } from "@/lib/ai-coach/intents";

export type MembershipGoal = "weight_loss" | "fitness" | "muscle_strength" | "beginners" | "kids" | "karate" | "gymnastics" | "kickboxing" | "belly_dance";

const goals: Array<[MembershipGoal, RegExp]> = [
  ["weight_loss", /تخسيس|انقاص وزن|اخس|رشاق/], ["fitness", /لياق|نشاط|تحمل/], ["muscle_strength", /عضلات|قوه/], ["beginners", /مبتدئ|بداي/], ["kids", /اطفال|طفل/], ["karate", /كاراتيه/], ["gymnastics", /جمباز/], ["kickboxing", /كيك بوكس|kick.?box/], ["belly_dance", /رقص شرقي|belly dance/],
];

export function extractMembershipGoal(message: string): MembershipGoal | null { const text = normalizeArabicIntent(message).replace(/ة/g, "ه"); return goals.find(([, pattern]) => pattern.test(text))?.[0] ?? null; }
export function goalSearchTerms(goal: MembershipGoal) { return ({ weight_loss: "تخسيس رشاقة", fitness: "لياقة نشاط", muscle_strength: "عضلات قوة", beginners: "مبتدئ بداية", kids: "أطفال", karate: "كاراتيه", gymnastics: "جمباز", kickboxing: "كيك بوكس", belly_dance: "رقص شرقي" } as const)[goal]; }
