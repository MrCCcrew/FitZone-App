import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS,
  MAX_REALTIME_SESSION_SECONDS,
  VoiceQuotaError,
  cairoPeriodKey,
  cleanupStaleVoiceSessions,
  finalizeVoiceSession,
  heartbeatVoiceSession,
  startVoiceRealtimeSession,
} from "@/lib/ai-coach/voice/quota";
import { normalizedQuestionHash } from "@/lib/ai-coach/shared-knowledge-cache";

const tracked = { users: new Set<string>(), chats: new Set<string>(), memberships: new Set<string>(), knowledge: new Set<string>() };
let sequence = 0;
const unique = () => `voice-it-${Date.now()}-${++sequence}`;

async function identity(activeMember = false) {
  const key = unique();
  const user = await db.user.create({ data: { name: key, email: `${key}@test.local` }, select: { id: true } });
  const chat = await db.chatSession.create({ data: { userId: user.id, visitorName: key }, select: { id: true } });
  tracked.users.add(user.id); tracked.chats.add(chat.id);
  if (activeMember) {
    const membership = await db.membership.create({ data: { name: key, price: 1, duration: 30, features: "[]" }, select: { id: true } });
    tracked.memberships.add(membership.id);
    await db.userMembership.create({ data: { userId: user.id, membershipId: membership.id, startDate: new Date("2026-01-01T00:00:00.000Z"), endDate: new Date("2027-01-01T00:00:00.000Z"), status: "active" } });
  }
  return { userId: user.id, chatSessionId: chat.id };
}

async function quota(userId: string, periodKey: string, usedSeconds: number) {
  return db.voiceMonthlyQuota.create({ data: { userId, periodKey, entitlementSeconds: 300, usedSeconds, reservedSeconds: 0 } });
}

afterEach(async () => {
  for (const userId of tracked.users) {
    await db.voiceRealtimeSession.deleteMany({ where: { userId } });
    await db.voiceMonthlyQuota.deleteMany({ where: { userId } });
    await db.userMembership.deleteMany({ where: { userId } });
  }
  if (tracked.chats.size) await db.chatSession.deleteMany({ where: { id: { in: [...tracked.chats] } } });
  if (tracked.memberships.size) await db.membership.deleteMany({ where: { id: { in: [...tracked.memberships] } } });
  if (tracked.knowledge.size) {
    await db.chatKnowledgeAlias.deleteMany({ where: { knowledgeEntryId: { in: [...tracked.knowledge] } } });
    await db.chatKnowledgeEntry.deleteMany({ where: { id: { in: [...tracked.knowledge] } } });
  }
  if (tracked.users.size) await db.user.deleteMany({ where: { id: { in: [...tracked.users] } } });
  tracked.users.clear(); tracked.chats.clear(); tracked.memberships.clear(); tracked.knowledge.clear();
});

afterAll(async () => { await db.$disconnect(); });

describe("AI Coach voice quota — real MySQL integration", () => {
  it("reservation: reserves a successful session and caps it to remaining seconds", async () => {
    const owner = await identity(); const now = new Date("2026-08-02T10:00:00.000Z");
    await quota(owner.userId, cairoPeriodKey(now), 250);
    const session = await startVoiceRealtimeSession({ ...owner, now });
    const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { userId_periodKey: { userId: owner.userId, periodKey: cairoPeriodKey(now) } } });
    expect(session.reservedSeconds).toBe(50); expect(stored.reservedSeconds).toBe(50); expect(stored.usedSeconds + stored.reservedSeconds).toBeLessThanOrEqual(stored.entitlementSeconds);
  });

  it("concurrency: one of two simultaneous reservations wins across 20 iterations", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    for (let i = 0; i < 20; i++) {
      const owner = await identity(); await quota(owner.userId, cairoPeriodKey(now), 120);
      const results = await Promise.allSettled([startVoiceRealtimeSession({ ...owner, now }), startVoiceRealtimeSession({ ...owner, now })]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") expect(rejected.reason).toBeInstanceOf(VoiceQuotaError);
      const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { userId_periodKey: { userId: owner.userId, periodKey: cairoPeriodKey(now) } } });
      expect(stored.reservedSeconds).toBe(180); expect(stored.usedSeconds + stored.reservedSeconds).toBeLessThanOrEqual(stored.entitlementSeconds);
    }
  });

  it("heartbeat: bills each elapsed second once and updates the heartbeat cursor", async () => {
    const owner = await identity(); const now = new Date("2026-08-02T10:00:00.000Z");
    const started = await startVoiceRealtimeSession({ ...owner, now });
    await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now });
    const second = await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
    const repeated = await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
    expect(second.billableSeconds).toBe(10); expect(repeated.billableSeconds).toBe(10);
    const stored = await db.voiceRealtimeSession.findUniqueOrThrow({ where: { voiceSessionId: started.voiceSessionId } });
    expect(stored.lastHeartbeatAt?.getTime()).toBe(now.getTime() + 10_000);
  });

  it("finalize: accrues final usage, releases the reservation, and is idempotent", async () => {
    const owner = await identity(); const now = new Date("2026-08-02T10:00:00.000Z");
    const started = await startVoiceRealtimeSession({ ...owner, now });
    await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now });
    await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
    const first = await finalizeVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, reason: "user_ended", now: new Date(now.getTime() + 15_000) });
    const second = await finalizeVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, reason: "user_ended", now: new Date(now.getTime() + 16_000) });
    const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { userId_periodKey: { userId: owner.userId, periodKey: cairoPeriodKey(now) } } });
    expect(first).toEqual({ finalized: true, billableSeconds: 15 }); expect(second.finalized).toBe(false); expect(stored).toMatchObject({ usedSeconds: 15, reservedSeconds: 0 });
  });

  it("cleanup: finalizes an abandoned session and retains usage through the last heartbeat", async () => {
    const owner = await identity(); const now = new Date("2026-08-02T10:00:00.000Z");
    const started = await startVoiceRealtimeSession({ ...owner, now });
    await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now });
    await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
    const cleaned = await cleanupStaleVoiceSessions(new Date(now.getTime() + 60_000));
    const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { userId_periodKey: { userId: owner.userId, periodKey: cairoPeriodKey(now) } } });
    expect(cleaned.some((entry) => entry.finalized)).toBe(true); expect(stored).toMatchObject({ usedSeconds: 10, reservedSeconds: 0 });
  });

  it("monthly limits: registered is 300, active member is 1800, and every session caps at 180", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z"); const registered = await identity(); const member = await identity(true);
    const registeredSession = await startVoiceRealtimeSession({ ...registered, now });
    const memberSession = await startVoiceRealtimeSession({ ...member, now });
    expect(registeredSession.entitlementSeconds).toBe(300); expect(memberSession.entitlementSeconds).toBe(ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS);
    expect(registeredSession.reservedSeconds).toBe(MAX_REALTIME_SESSION_SECONDS); expect(memberSession.reservedSeconds).toBe(MAX_REALTIME_SESSION_SECONDS);
    expect(cairoPeriodKey(new Date("2026-07-31T22:30:00.000Z"))).toBe("2026-08");
  });

  it("foreign keys: ChatSession deletion sets null and a quota with a session is restricted", async () => {
    const owner = await identity(); const started = await startVoiceRealtimeSession({ ...owner });
    await db.chatSession.delete({ where: { id: owner.chatSessionId } }); tracked.chats.delete(owner.chatSessionId);
    const session = await db.voiceRealtimeSession.findUniqueOrThrow({ where: { voiceSessionId: started.voiceSessionId } });
    expect(session.chatSessionId).toBeNull();
    await expect(db.voiceMonthlyQuota.delete({ where: { id: session.quotaId } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("stress: concurrent heartbeats do not double-accrue across 20 iterations", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    for (let i = 0; i < 20; i++) {
      const owner = await identity(); const started = await startVoiceRealtimeSession({ ...owner, now });
      await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now });
      const at = new Date(now.getTime() + 10_000);
      const results = await Promise.all([heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: at }), heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: at })]);
      const session = await db.voiceRealtimeSession.findUniqueOrThrow({ where: { voiceSessionId: started.voiceSessionId } });
      const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { id: session.quotaId } });
      expect(results.map((result) => result.billableSeconds)).toContain(10); expect(session.billableSeconds).toBe(10); expect(session.lastHeartbeatAt?.getTime()).toBe(at.getTime()); expect(session.status).toBe("active"); expect(stored.reservedSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("stress: concurrent finalize is idempotent across 20 iterations", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    for (let i = 0; i < 20; i++) {
      const owner = await identity(); const started = await startVoiceRealtimeSession({ ...owner, now });
      await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now }); await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
      const results = await Promise.all([finalizeVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, reason: "user_ended", now: new Date(now.getTime() + 15_000) }), finalizeVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, reason: "user_ended", now: new Date(now.getTime() + 15_000) })]);
      const session = await db.voiceRealtimeSession.findUniqueOrThrow({ where: { voiceSessionId: started.voiceSessionId } }); const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { id: session.quotaId } });
      expect(results.filter((result) => result.finalized)).toHaveLength(1); expect(session.status).toBe("finalized"); expect(stored).toMatchObject({ usedSeconds: 15, reservedSeconds: 0 });
    }
  });

  it("stress: cleanup and finalize close an abandoned session once across 20 iterations", async () => {
    const now = new Date("2026-08-02T10:00:00.000Z");
    for (let i = 0; i < 20; i++) {
      const owner = await identity(); const started = await startVoiceRealtimeSession({ ...owner, now });
      await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now }); await heartbeatVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, now: new Date(now.getTime() + 10_000) });
      const staleAt = new Date(now.getTime() + 60_000);
      await Promise.all([cleanupStaleVoiceSessions(staleAt), finalizeVoiceSession({ ...owner, voiceSessionId: started.voiceSessionId, reason: "user_ended", now: staleAt })]);
      const session = await db.voiceRealtimeSession.findUniqueOrThrow({ where: { voiceSessionId: started.voiceSessionId } }); const stored = await db.voiceMonthlyQuota.findUniqueOrThrow({ where: { id: session.quotaId } });
      expect(session.status).toBe("finalized"); expect(stored).toMatchObject({ usedSeconds: 10, reservedSeconds: 0 }); expect(stored.usedSeconds + stored.reservedSeconds).toBeLessThanOrEqual(stored.entitlementSeconds);
    }
  });

  it("aliases: identical hash/language is unique while another language is allowed", async () => {
    const key = unique(); const entry = await db.chatKnowledgeEntry.create({ data: { title: key, keywords: key, answer: key, canonicalQuestion: key, language: "ar", privacyClass: "STATIC", approved: true } });
    tracked.knowledge.add(entry.id); const hash = normalizedQuestionHash(key);
    await db.chatKnowledgeAlias.create({ data: { knowledgeEntryId: entry.id, normalizedQuestion: key, normalizedQuestionHash: hash, language: "ar" } });
    await expect(db.chatKnowledgeAlias.create({ data: { knowledgeEntryId: entry.id, normalizedQuestion: key, normalizedQuestionHash: hash, language: "ar" } })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.chatKnowledgeAlias.create({ data: { knowledgeEntryId: entry.id, normalizedQuestion: key, normalizedQuestionHash: hash, language: "en" } })).resolves.toBeDefined();
  });
});
