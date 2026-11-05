import { db } from "@/lib/db";
import { COACH_PAGES } from "@/lib/ai-coach/page-registry";

export type CoachSiteIndexEntry = { id: string; title: string; text: string; kind: "page" | "site_content" | "class" | "trainer" };

let cache: { expiresAt: number; entries: CoachSiteIndexEntry[] } | null = null;

/** Read-only, process-local index of slow-moving public content. Live prices, stock, schedules, offers, and account data are intentionally excluded. */
export async function getCoachSiteIndex() {
  if (cache && cache.expiresAt > Date.now()) return cache.entries;
  const [content, classes, trainers] = await Promise.all([
    db.siteContent.findMany({ where: { section: { in: ["contact", "trainersPage", "blog", "trial_class_settings"] } }, select: { section: true, content: true } }),
    db.class.findMany({ where: { isActive: true }, select: { id: true, name: true, nameEn: true, description: true, descriptionEn: true, category: true, type: true } }),
    db.trainer.findMany({ where: { isActive: true }, select: { id: true, name: true, nameEn: true, specialty: true, specialtyEn: true, bio: true, bioEn: true } }),
  ]);
  const entries: CoachSiteIndexEntry[] = [
    ...COACH_PAGES.map((page) => ({ id: `page:${page.id}`, title: page.id, text: `${page.description} ${page.aliases.join(" ")}`, kind: "page" as const })),
    ...content.map((item) => ({ id: `content:${item.section}`, title: item.section, text: item.content.slice(0, 6000), kind: "site_content" as const })),
    ...classes.map((item) => ({ id: `class:${item.id}`, title: item.name, text: [item.name, item.nameEn, item.description, item.descriptionEn, item.category, item.type].filter(Boolean).join(" "), kind: "class" as const })),
    ...trainers.map((item) => ({ id: `trainer:${item.id}`, title: item.name, text: [item.name, item.nameEn, item.specialty, item.specialtyEn, item.bio, item.bioEn].filter(Boolean).join(" "), kind: "trainer" as const })),
  ];
  cache = { entries, expiresAt: Date.now() + 5 * 60_000 };
  return entries;
}

export function invalidateCoachSiteIndex() { cache = null; }
