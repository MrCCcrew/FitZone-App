import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { isAnalyticsBot, sanitizeAnalyticsPath } from "@/lib/analytics/privacy";
import { ANALYTICS_SESSION_COOKIE, ANALYTICS_VISITOR_COOKIE, getOrCreateAnalyticsSession, getOrCreateAnalyticsVisitor } from "@/lib/analytics/visitor-session";

const bodySchema = z.object({ eventName: z.enum(["page_view", "heartbeat", "page_leave"]), path: z.string().max(600), pageTitle: z.string().max(160).optional(), referrer: z.string().max(600).optional() });
const STRICT_WINDOW_MS = 5_000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const MAX_ACTIVE_DELTA_SECONDS = 60;
const MIN_ACTIVE_DELTA_SECONDS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!applyRateLimit(`analytics:${getClientIp(req)}`, 60, 60_000).ok) return new NextResponse(null, { status: 429 });
  if (isAnalyticsBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const path = sanitizeAnalyticsPath(parsed.data.path);
  if (!path) return new NextResponse(null, { status: 204 });
  const store = await cookies(); const now = new Date();
  if (parsed.data.eventName === "page_leave") {
    const anonymousId = store.get(ANALYTICS_VISITOR_COOKIE.name)?.value;
    const sessionId = store.get(ANALYTICS_SESSION_COOKIE.name)?.value;
    if (!anonymousId || !UUID_PATTERN.test(anonymousId) || !sessionId) return NextResponse.json({ ignored: true });

    const visitor = await db.analyticsVisitor.findUnique({ where: { anonymousId } });
    const session = visitor ? await db.analyticsSession.findUnique({ where: { id: sessionId } }) : null;
    if (!visitor || !session || session.visitorId !== visitor.id || now.getTime() - session.lastActivityAt.getTime() >= THIRTY_MINUTES_MS) {
      return NextResponse.json({ ignored: true });
    }

    const pageView = await db.analyticsPageView.findFirst({ where: { sessionId: session.id, path, exitedAt: null } });
    if (!pageView) return NextResponse.json({ ignored: true });

    const elapsedSeconds = Math.floor((now.getTime() - session.lastActivityAt.getTime()) / 1000);
    const delta = elapsedSeconds >= MIN_ACTIVE_DELTA_SECONDS
      ? Math.min(Math.max(elapsedSeconds, 0), MAX_ACTIVE_DELTA_SECONDS)
      : 0;

    const closed = await db.$transaction(async (tx) => {
      const result = await tx.analyticsPageView.updateMany({
        where: { id: pageView.id, exitedAt: null },
        data: { durationSeconds: { increment: delta }, exitedAt: now },
      });
      if (result.count === 0) return false;
      await tx.analyticsSession.update({
        where: { id: session.id },
        data: {
          durationSeconds: { increment: delta },
          lastActivityAt: now,
          exitPage: path,
        },
      });
      return true;
    });
    return NextResponse.json(closed ? { ok: true } : { ignored: true });
  }
  if (parsed.data.eventName === "heartbeat") {
    const anonymousId = store.get(ANALYTICS_VISITOR_COOKIE.name)?.value;
    const sessionId = store.get(ANALYTICS_SESSION_COOKIE.name)?.value;
    if (!anonymousId || !sessionId) return NextResponse.json({ ignored: true });
    const visitor = await db.analyticsVisitor.findUnique({ where: { anonymousId } });
    const session = visitor ? await db.analyticsSession.findUnique({ where: { id: sessionId } }) : null;
    if (!visitor || !session || session.visitorId !== visitor.id || now.getTime() - session.lastActivityAt.getTime() >= THIRTY_MINUTES_MS) return NextResponse.json({ ignored: true });
    const delta = Math.floor((now.getTime() - session.lastActivityAt.getTime()) / 1000);
    const pageView = await db.analyticsPageView.findFirst({ where: { sessionId: session.id, path, exitedAt: null } });
    if (!pageView || delta < MIN_ACTIVE_DELTA_SECONDS) return NextResponse.json({ ignored: true });
    const accepted = Math.min(delta, MAX_ACTIVE_DELTA_SECONDS);
    await db.$transaction([
      db.analyticsSession.update({ where: { id: session.id }, data: { durationSeconds: { increment: accepted }, lastActivityAt: now } }),
      db.analyticsPageView.update({ where: { id: pageView.id }, data: { durationSeconds: { increment: accepted } } }),
    ]);
    return NextResponse.json({ ok: true });
  }
  const visitorResult = await getOrCreateAnalyticsVisitor(store.get(ANALYTICS_VISITOR_COOKIE.name)?.value);
  const sessionResult = await getOrCreateAnalyticsSession(store.get(ANALYTICS_SESSION_COOKIE.name)?.value, visitorResult.visitor.id, undefined, now);
  const open = await db.analyticsPageView.findFirst({ where: { sessionId: sessionResult.session.id, exitedAt: null }, orderBy: { enteredAt: "desc" } });
  let reused = false;
  if (open?.path === path && now.getTime() - open.enteredAt.getTime() < STRICT_WINDOW_MS) reused = true;
  else {
    if (open) await db.analyticsPageView.update({ where: { id: open.id }, data: { exitedAt: now } });
    await db.analyticsPageView.create({ data: { sessionId: sessionResult.session.id, visitorId: visitorResult.visitor.id, path, pageTitle: parsed.data.pageTitle?.slice(0, 160), referrerPath: sanitizeAnalyticsPath(parsed.data.referrer ?? "") ?? undefined } });
  }
  if (!reused) await db.analyticsSession.update({ where: { id: sessionResult.session.id }, data: { lastActivityAt: now, landingPage: sessionResult.session.landingPage ?? path, exitPage: path, pageViewCount: { increment: 1 }, isBounce: sessionResult.session.pageViewCount === 0 } });
  const response = new NextResponse(null, { status: 204 });
  if (visitorResult.created) response.cookies.set(ANALYTICS_VISITOR_COOKIE.name, visitorResult.anonymousId, ANALYTICS_VISITOR_COOKIE);
  response.cookies.set(ANALYTICS_SESSION_COOKIE.name, sessionResult.session.id, ANALYTICS_SESSION_COOKIE);
  return response;
}
