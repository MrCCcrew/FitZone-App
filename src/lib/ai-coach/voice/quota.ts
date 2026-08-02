import { randomBytes } from "crypto";
import { db } from "@/lib/db";

export const REGISTERED_VOICE_ENTITLEMENT_SECONDS = 300;
export const ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS = 1800;
export const MAX_REALTIME_SESSION_SECONDS = 180;
export const HEARTBEAT_GRACE_SECONDS = 20;
export const HEARTBEAT_TIMEOUT_SECONDS = 45;
export const CONNECTION_START_GRACE_SECONDS = 30;

export type VoiceQuotaErrorCode =
  | "VOICE_LOGIN_REQUIRED"
  | "VOICE_SESSION_ALREADY_ACTIVE"
  | "VOICE_QUOTA_EXHAUSTED"
  | "VOICE_SESSION_NOT_FOUND"
  | "VOICE_SESSION_INACTIVE"
  | "VOICE_SESSION_EXPIRED";

export class VoiceQuotaError extends Error {
  constructor(public readonly code: VoiceQuotaErrorCode) {
    super(code);
  }
}

export function voiceQuotaEnabled() {
  return process.env.AI_COACH_VOICE_QUOTA_ENABLED === "true";
}

/** Cairo is the billing authority; UTC must never decide a monthly period. */
export function cairoPeriodKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}`;
}

export function remainingVoiceSeconds(quota: { entitlementSeconds: number; usedSeconds: number; reservedSeconds: number }) {
  return Math.max(0, quota.entitlementSeconds - quota.usedSeconds - quota.reservedSeconds);
}

export function effectiveEntitlement(currentEntitlement: number | null | undefined, activeMembership: boolean) {
  const targetEntitlement = activeMembership ? ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS : REGISTERED_VOICE_ENTITLEMENT_SECONDS;
  return Math.max(currentEntitlement ?? 0, targetEntitlement);
}

export function cappedHeartbeatIncrement(cursorAt: Date, now: Date, expiresAt: Date, billableSeconds: number, reservedSeconds: number) {
  const cappedNow = new Date(Math.min(now.getTime(), expiresAt.getTime()));
  const elapsed = Math.max(0, Math.floor((cappedNow.getTime() - cursorAt.getTime()) / 1000));
  return Math.max(0, Math.min(elapsed, HEARTBEAT_GRACE_SECONDS, reservedSeconds - billableSeconds));
}

export function finalAccrualIncrement(session: { connectedAt: Date | null; lastHeartbeatAt: Date | null; billingCursorAt: Date | null; expiresAt: Date; billableSeconds: number; reservedSeconds: number }, now: Date) {
  if (!session.connectedAt || !session.billingCursorAt || !session.lastHeartbeatAt) return 0;
  if (now.getTime() - session.lastHeartbeatAt.getTime() > HEARTBEAT_GRACE_SECONDS * 1000) return 0;
  return cappedHeartbeatIncrement(session.billingCursorAt, now, session.expiresAt, session.billableSeconds, session.reservedSeconds);
}

export function finalizeQuotaTransfer(quota: { usedSeconds: number; reservedSeconds: number }, session: { billableSeconds: number; reservedSeconds: number }) {
  const billableSeconds = Math.min(session.billableSeconds, session.reservedSeconds);
  return {
    billableSeconds,
    usedSeconds: quota.usedSeconds + billableSeconds,
    reservedSeconds: Math.max(0, quota.reservedSeconds - session.reservedSeconds),
  };
}

function opaqueVoiceSessionId() {
  return randomBytes(32).toString("hex");
}

async function hasActiveMembership(client: Pick<typeof db, "userMembership">, userId: string, now: Date) {
  return Boolean(await client.userMembership.findFirst({
    where: { userId, status: "active", startDate: { lte: now }, endDate: { gt: now } },
    select: { id: true },
  }));
}

type StartVoiceSessionInput = { userId: string; chatSessionId: string; now?: Date };

/**
 * Serializes all starts for a user/month by locking the unique quota row.  The
 * active-session lookup is locked in the same transaction, so a second click
 * cannot create another reservation or another active Realtime session.
 */
export async function startVoiceRealtimeSession({ userId, chatSessionId, now = new Date() }: StartVoiceSessionInput) {
  const periodKey = cairoPeriodKey(now);

  return db.$transaction(async (tx) => {
    const activeMembership = await hasActiveMembership(tx, userId, now);
    const targetEntitlement = activeMembership ? ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS : REGISTERED_VOICE_ENTITLEMENT_SECONDS;
    await tx.$executeRaw`
      INSERT INTO \`VoiceMonthlyQuota\` (\`id\`, \`userId\`, \`periodKey\`, \`entitlementSeconds\`, \`usedSeconds\`, \`reservedSeconds\`, \`createdAt\`, \`updatedAt\`)
      VALUES (${`vq_${randomBytes(18).toString("hex")}`}, ${userId}, ${periodKey}, ${targetEntitlement}, 0, 0, ${now}, ${now})
      ON DUPLICATE KEY UPDATE \`entitlementSeconds\` = GREATEST(\`entitlementSeconds\`, VALUES(\`entitlementSeconds\`)), \`updatedAt\` = VALUES(\`updatedAt\`)
    `;
    await tx.$queryRaw`SELECT \`id\` FROM \`VoiceMonthlyQuota\` WHERE \`userId\` = ${userId} AND \`periodKey\` = ${periodKey} FOR UPDATE`;
    await tx.$queryRaw`SELECT \`id\` FROM \`VoiceRealtimeSession\` WHERE \`userId\` = ${userId} AND \`status\` = 'active' FOR UPDATE`;

    const quota = await tx.voiceMonthlyQuota.findUniqueOrThrow({ where: { userId_periodKey: { userId, periodKey } } });
    const activeSession = await tx.voiceRealtimeSession.findFirst({ where: { userId, status: "active" }, select: { id: true } });
    if (activeSession) throw new VoiceQuotaError("VOICE_SESSION_ALREADY_ACTIVE");

    const remaining = remainingVoiceSeconds(quota);
    if (remaining <= 0) throw new VoiceQuotaError("VOICE_QUOTA_EXHAUSTED");
    const reservedSeconds = Math.min(MAX_REALTIME_SESSION_SECONDS, remaining);
    const expiresAt = new Date(now.getTime() + reservedSeconds * 1000);
    const voiceSessionId = opaqueVoiceSessionId();

    await tx.voiceMonthlyQuota.update({ where: { id: quota.id }, data: { entitlementSeconds: effectiveEntitlement(quota.entitlementSeconds, activeMembership), reservedSeconds: { increment: reservedSeconds } } });
    const session = await tx.voiceRealtimeSession.create({
      data: { voiceSessionId, userId, chatSessionId, quotaId: quota.id, reservedSeconds, expiresAt, lastActivityAt: now },
      select: { voiceSessionId: true, expiresAt: true, reservedSeconds: true },
    });
    return { ...session, entitlementSeconds: effectiveEntitlement(quota.entitlementSeconds, activeMembership), remainingSeconds: remaining - reservedSeconds };
  }, { isolationLevel: "Serializable" });
}

type VoiceSessionOwnership = { voiceSessionId: string; userId: string; chatSessionId?: string; now?: Date };

async function lockQuotaRow(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], quotaId: string) {
  await tx.$queryRaw`SELECT \`id\` FROM \`VoiceMonthlyQuota\` WHERE \`id\` = ${quotaId} FOR UPDATE`;
}

async function lockedVoiceSession(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], voiceSessionId: string) {
  await tx.$queryRaw`SELECT \`id\` FROM \`VoiceRealtimeSession\` WHERE \`voiceSessionId\` = ${voiceSessionId} FOR UPDATE`;
  return tx.voiceRealtimeSession.findUnique({ where: { voiceSessionId }, include: { quota: true } });
}

export async function heartbeatVoiceSession({ voiceSessionId, userId, chatSessionId, now = new Date() }: VoiceSessionOwnership) {
  return db.$transaction(async (tx) => {
    const session = await lockedVoiceSession(tx, voiceSessionId);
    if (!session || session.userId !== userId || (chatSessionId && session.chatSessionId !== chatSessionId)) throw new VoiceQuotaError("VOICE_SESSION_NOT_FOUND");
    if (session.status !== "active") throw new VoiceQuotaError("VOICE_SESSION_INACTIVE");
    if (now >= session.expiresAt) throw new VoiceQuotaError("VOICE_SESSION_EXPIRED");
    // Connection accounting begins only once session.updated has caused the
    // client to send its first heartbeat. That heartbeat establishes a cursor
    // and deliberately bills zero seconds.
    const firstHeartbeat = !session.connectedAt || !session.billingCursorAt;
    const cursorAt = session.billingCursorAt ?? now;
    const increment = firstHeartbeat ? 0 : cappedHeartbeatIncrement(cursorAt, now, session.expiresAt, session.billableSeconds, session.reservedSeconds);
    return tx.voiceRealtimeSession.update({
      where: { id: session.id },
      data: {
        connectedAt: session.connectedAt ?? now,
        lastHeartbeatAt: now,
        lastActivityAt: now,
        billingCursorAt: now,
        billableSeconds: { increment },
      },
      select: { voiceSessionId: true, billableSeconds: true, reservedSeconds: true, expiresAt: true },
    });
  }, { isolationLevel: "Serializable" });
}

/** Finalizing is idempotent: only the successful active -> finalized transition can charge quota. */
export async function finalizeVoiceSession({ voiceSessionId, userId, chatSessionId, reason, now = new Date() }: VoiceSessionOwnership & { reason: "user_ended" | "quota_exhausted" | "max_duration" | "expired" | "heartbeat_timeout" | "connection_failed" | "cleanup" | "authorization_failed" }) {
  // Preliminary read obtains the quota identity only.  Mutation occurs only
  // after locks are acquired in the global order: quota, then voice session.
  const preliminary = await db.voiceRealtimeSession.findUnique({ where: { voiceSessionId }, select: { quotaId: true } });
  if (!preliminary) throw new VoiceQuotaError("VOICE_SESSION_NOT_FOUND");
  return db.$transaction(async (tx) => {
    await lockQuotaRow(tx, preliminary.quotaId);
    const session = await lockedVoiceSession(tx, voiceSessionId);
    if (!session || session.userId !== userId || (chatSessionId && session.chatSessionId !== chatSessionId)) throw new VoiceQuotaError("VOICE_SESSION_NOT_FOUND");
    const finalIncrement = finalAccrualIncrement(session, now);
    const finalBillableSeconds = Math.min(session.reservedSeconds, session.billableSeconds + finalIncrement);
    const transitioned = await tx.voiceRealtimeSession.updateMany({
      where: { id: session.id, status: "active" },
      data: { status: "finalized", terminationReason: reason, finalizedAt: now, lastActivityAt: now, billingCursorAt: new Date(Math.min(now.getTime(), session.expiresAt.getTime())), billableSeconds: finalBillableSeconds },
    });
    if (transitioned.count === 0) return { finalized: false, billableSeconds: session.billableSeconds };
    const transfer = finalizeQuotaTransfer(session.quota, { ...session, billableSeconds: finalBillableSeconds });
    const billableSeconds = transfer.billableSeconds;
    await tx.voiceMonthlyQuota.update({
      where: { id: session.quotaId },
      data: { usedSeconds: { increment: billableSeconds }, reservedSeconds: { decrement: session.reservedSeconds } },
    });
    return { finalized: true, billableSeconds };
  }, { isolationLevel: "Serializable" });
}

export async function assertActiveVoiceToolSession({ voiceSessionId, userId, chatSessionId, now = new Date() }: VoiceSessionOwnership) {
  const session = await db.voiceRealtimeSession.findUnique({ where: { voiceSessionId }, include: { quota: true } });
  if (!session || session.userId !== userId || (chatSessionId && session.chatSessionId !== chatSessionId)) throw new VoiceQuotaError("VOICE_SESSION_NOT_FOUND");
  if (session.status !== "active") throw new VoiceQuotaError("VOICE_SESSION_INACTIVE");
  if (now >= session.expiresAt || session.billableSeconds >= session.reservedSeconds) throw new VoiceQuotaError("VOICE_SESSION_EXPIRED");
  return session;
}

export async function cleanupStaleVoiceSessions(now = new Date()) {
  const heartbeatCutoff = new Date(now.getTime() - HEARTBEAT_TIMEOUT_SECONDS * 1000);
  const connectionCutoff = new Date(now.getTime() - CONNECTION_START_GRACE_SECONDS * 1000);
  const stale = await db.voiceRealtimeSession.findMany({
    where: { status: "active", OR: [{ expiresAt: { lte: now } }, { lastHeartbeatAt: { lt: heartbeatCutoff } }, { lastHeartbeatAt: null, createdAt: { lte: connectionCutoff } }] },
    select: { voiceSessionId: true, userId: true, chatSessionId: true, expiresAt: true },
    take: 50,
  });
  const results: Array<{ finalized: boolean; billableSeconds: number }> = [];
  for (const session of stale) {
    const result = await finalizeVoiceSession({ voiceSessionId: session.voiceSessionId, userId: session.userId, ...(session.chatSessionId ? { chatSessionId: session.chatSessionId } : {}), reason: session.expiresAt <= now ? "expired" : "heartbeat_timeout", now })
      .catch((error) => error instanceof VoiceQuotaError && error.code === "VOICE_SESSION_NOT_FOUND" ? { finalized: false, billableSeconds: 0 } : Promise.reject(error));
    results.push(result);
  }
  return results;
}
