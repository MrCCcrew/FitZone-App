import { createHash } from "crypto";
import { db } from "@/lib/db";

export function sharedKnowledgeCacheEnabled() {
  return process.env.AI_COACH_SHARED_KNOWLEDGE_CACHE_ENABLED === "true";
}

export function normalizeKnowledgeQuestion(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedQuestionHash(question: string) {
  return createHash("sha256").update(normalizeKnowledgeQuestion(question), "utf8").digest("hex");
}

const staticWhere = (now: Date, language: string) => ({
  approved: true,
  isActive: true,
  privacyClass: "STATIC" as const,
  language,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export async function findExactApprovedStaticKnowledge(question: string, language: "ar" | "en", now = new Date()) {
  if (!sharedKnowledgeCacheEnabled()) return null;
  const alias = await db.chatKnowledgeAlias.findUnique({
    where: { normalizedQuestionHash_language: { normalizedQuestionHash: normalizedQuestionHash(question), language } },
    include: { knowledgeEntry: true },
  });
  if (!alias || !matchesStaticPolicy(alias.knowledgeEntry, language, now)) return null;
  await db.chatKnowledgeEntry.update({ where: { id: alias.knowledgeEntryId }, data: { usageCount: { increment: 1 }, lastUsedAt: now } });
  return alias.knowledgeEntry;
}

function matchesStaticPolicy(entry: { approved: boolean; isActive: boolean; privacyClass: string | null; language: string; expiresAt: Date | null }, language: string, now: Date) {
  return entry.approved && entry.isActive && entry.privacyClass === "STATIC" && entry.language === language && (!entry.expiresAt || entry.expiresAt > now);
}

function tokenSimilarity(a: string, b: string) {
  const left = new Set(normalizeKnowledgeQuestion(a).split(" ").filter((token) => token.length > 1));
  const right = new Set(normalizeKnowledgeQuestion(b).split(" ").filter((token) => token.length > 1));
  const union = new Set([...left, ...right]).size;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return union ? intersection / union : 0;
}

/** Conservative local-only semantic fallback for STATIC information only. */
export async function findConservativeSemanticStaticKnowledge(question: string, language: "ar" | "en", now = new Date()) {
  if (!sharedKnowledgeCacheEnabled()) return null;
  const candidates = await db.chatKnowledgeEntry.findMany({ where: staticWhere(now, language), include: { aliases: true }, take: 100 });
  const match = candidates
    .map((entry) => ({ entry, score: Math.max(tokenSimilarity(question, entry.canonicalQuestion ?? entry.title), ...entry.aliases.map((alias) => tokenSimilarity(question, alias.normalizedQuestion))) }))
    .filter(({ score }) => score >= 0.88)
    .sort((a, b) => b.score - a.score)[0];
  if (!match) return null;
  await db.chatKnowledgeEntry.update({ where: { id: match.entry.id }, data: { usageCount: { increment: 1 }, lastUsedAt: now } });
  return match.entry;
}

export async function invalidateKnowledgeSource(sourceType: string, sourceReference: string, sourceVersion: string) {
  if (!sharedKnowledgeCacheEnabled()) return;
  await db.$transaction([
    db.coachKnowledgeSourceVersion.upsert({ where: { sourceType_sourceReference: { sourceType, sourceReference } }, create: { sourceType, sourceReference, sourceVersion }, update: { sourceVersion } }),
    db.chatKnowledgeEntry.updateMany({ where: { sourceType, sourceReference, privacyClass: "DYNAMIC" }, data: { expiresAt: new Date() } }),
  ]);
}
