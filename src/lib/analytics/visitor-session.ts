import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const ANALYTICS_VISITOR_COOKIE = {
  name: "fitzone_analytics_vid",
  maxAge: ONE_YEAR_SECONDS,
  httpOnly: false,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const ANALYTICS_SESSION_COOKIE = {
  name: "fitzone_analytics_sid",
  maxAge: 60 * 60,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function getOrCreateAnalyticsVisitor(visitorCookie: string | null | undefined, authenticatedUserId?: string | null) {
  const userId = authenticatedUserId ?? undefined;
  const anonymousId = isUuid(visitorCookie) ? visitorCookie : randomUUID();
  const existing = await db.analyticsVisitor.findUnique({ where: { anonymousId } });
  if (existing) {
    const visitor = await db.analyticsVisitor.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date(), ...(userId ? { userId } : {}) },
    });
    return { visitor, anonymousId, created: false };
  }
  const visitor = await db.analyticsVisitor.create({ data: { anonymousId, ...(userId ? { userId } : {}) } });
  return { visitor, anonymousId, created: true };
}

export async function getOrCreateAnalyticsSession(sessionCookie: string | null | undefined, visitorId: string, authenticatedUserId?: string | null, now = new Date()) {
  const userId = authenticatedUserId ?? undefined;
  const existing = sessionCookie ? await db.analyticsSession.findUnique({ where: { id: sessionCookie } }) : null;
  if (existing && existing.visitorId === visitorId && now.getTime() - existing.lastActivityAt.getTime() < THIRTY_MINUTES_MS) {
    const session = await db.analyticsSession.update({ where: { id: existing.id }, data: { lastActivityAt: now, ...(userId ? { userId } : {}) } });
    return { session, created: false };
  }
  const session = await db.analyticsSession.create({ data: { visitorId, lastActivityAt: now, ...(userId ? { userId } : {}) } });
  return { session, created: true };
}

export { THIRTY_MINUTES_MS };
