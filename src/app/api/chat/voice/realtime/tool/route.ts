import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ownsCoachSession } from "@/lib/ai-coach/session-guard";
import { handleCoachMessage } from "@/lib/ai-coach/engine";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";
import { getNutritionDoctorInteractive, getSiteOverviewInteractive, searchGoalsInteractive, searchMembershipsInteractive, searchOffersInteractive, searchPackagesInteractive, searchSchedulesInteractive, searchTrainersInteractive, searchTrialClassesInteractive } from "@/lib/ai-coach/interactive-tools";

const names = ["searchMemberships", "searchPackages", "searchOffers", "searchProducts", "searchClassSchedule", "getAccountSummary", "getPageLink", "searchTrainers", "searchGoals", "searchTrialClasses", "getNutritionDoctor", "getSiteOverview"] as const;
const schema = z.object({ sessionId: z.string().min(8).max(128), name: z.enum(names), arguments: z.object({ query: z.string().trim().max(1800).optional(), pageId: z.string().trim().max(64).optional() }).strict(), lang: z.enum(["ar", "en"]).default("ar") });
export const isForbiddenRealtimeToolRequest = (query: string) => /(?:غي[ّ]?ر(?:ي)?|عد[ّ]?ل|احذف|امسح|ادفع|نف[ّ]?ذ|change|edit|delete|remove|pay|execute)/i.test(query) && /(?:رصيدي|رصيد|نقاطي|نقاط|اشتراكي|اشتراك|عضويتي|عضوية|price|balance|points|membership|sql)/i.test(query);

export function realtimeVoiceSummary(content: string, metadata: string | null) {
  try {
    const parsed = metadata ? JSON.parse(metadata) as { structured?: { voiceSummary?: unknown } } : null;
    if (typeof parsed?.structured?.voiceSummary === "string" && parsed.structured.voiceSummary.trim()) return parsed.structured.voiceSummary.trim().slice(0, 520);
  } catch { /* use a bounded plain-text summary */ }
  const lines = content.replace(/https?:\/\/\S+/g, "").split(/\n+/).filter(Boolean).slice(0, 3).join(" ");
  return lines.length <= 520 ? lines : `${lines.slice(0, 500).replace(/\s+\S*$/, "")}…`;
}

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(await ownsCoachSession(parsed.data.sessionId))) return NextResponse.json({ error: "Tool unavailable." }, { status: 403 });
  const query = parsed.data.arguments.query || (parsed.data.name === "getPageLink" ? `افتح ${parsed.data.arguments.pageId ?? ""}` : "");
  if (!query && !["getNutritionDoctor", "getSiteOverview"].includes(parsed.data.name)) return NextResponse.json({ error: "Tool arguments invalid." }, { status: 400 });
  if (isForbiddenRealtimeToolRequest(query)) return NextResponse.json({ result: { allowed: false, answer: "مش هقدر أنفذ تعديل أو عملية حساسة من المحادثة." } });
  if (query) {
    const safety = await understandCoachMessage(query, parsed.data.lang);
    if (safety.safetyFlags.length || safety.intent === "privacy_guard" || safety.intent === "forbidden_write_action") return NextResponse.json({ result: { allowed: false, answer: "مش هقدر أساعد في طلب فيه بيانات خاصة أو تعديل." } });
  }
  if (parsed.data.name === "searchOffers") return NextResponse.json({ result: await searchOffersInteractive(query) });
  if (parsed.data.name === "searchMemberships") return NextResponse.json({ result: await searchMembershipsInteractive(query) });
  if (parsed.data.name === "searchPackages") return NextResponse.json({ result: await searchPackagesInteractive(query) });
  if (parsed.data.name === "searchClassSchedule") return NextResponse.json({ result: await searchSchedulesInteractive(query) });
  if (parsed.data.name === "searchTrainers") return NextResponse.json({ result: await searchTrainersInteractive(query) });
  if (parsed.data.name === "searchGoals") return NextResponse.json({ result: await searchGoalsInteractive(query) });
  if (parsed.data.name === "searchTrialClasses") return NextResponse.json({ result: await searchTrialClassesInteractive(query) });
  if (parsed.data.name === "getNutritionDoctor") return NextResponse.json({ result: await getNutritionDoctorInteractive() });
  if (parsed.data.name === "getSiteOverview") return NextResponse.json({ result: await getSiteOverviewInteractive() });
  const understanding = await understandCoachMessage(query, parsed.data.lang);
  const expected: Record<(typeof names)[number], string[]> = { searchMemberships: ["memberships"], searchPackages: ["packages"], searchOffers: ["offers"], searchProducts: ["products"], searchClassSchedule: ["classes"], getAccountSummary: ["account"], getPageLink: ["site"], searchTrainers: [], searchGoals: [], searchTrialClasses: [], getNutritionDoctor: [], getSiteOverview: [] };
  if (!expected[parsed.data.name].includes(understanding.domain ?? "")) return NextResponse.json({ result: { allowed: false, answer: "استخدمي الأداة المناسبة للسؤال فقط." } });
  await handleCoachMessage(parsed.data.sessionId, query, parsed.data.lang);
  const message = await db.chatMessage.findFirst({ where: { sessionId: parsed.data.sessionId, senderType: "bot" }, orderBy: { createdAt: "desc" }, select: { content: true, metadata: true } });
  return NextResponse.json({ result: { allowed: true, answer: message ? realtimeVoiceSummary(message.content, message.metadata) : "معلش، مش متاح دلوقتي." } });
}
