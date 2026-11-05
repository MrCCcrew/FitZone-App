import "server-only";

import { db } from "@/lib/db";

export const ANALYTICS_RETENTION = {
  pageViewsDays: 365,
  sessionsDays: 365,
  pageEventsDays: 365,
  businessEventsDays: 730,
  visitorsInactiveDays: 365,
  defaultBatchSize: 500,
  maxBatchSize: 1_000,
} as const;

const BUSINESS_EVENT_NAMES = ["checkout_started", "payment_succeeded", "payment_failed", "membership_activated"];

export type AnalyticsRetentionOptions = { dryRun?: boolean; batchSize?: number; now?: Date };
export type AnalyticsRetentionReport = {
  dryRun: boolean;
  pageViewsMatched: number; sessionsMatched: number; eventsMatched: number; visitorsMatched: number;
  pageViewsDeleted: number; sessionsDeleted: number; eventsDeleted: number; visitorsDeleted: number;
  durationMs: number;
};

function cutoff(now: Date, days: number) { return new Date(now.getTime() - days * 24 * 60 * 60 * 1000); }
function batchSize(value: number | undefined) {
  const resolved = value ?? ANALYTICS_RETENTION.defaultBatchSize;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > ANALYTICS_RETENTION.maxBatchSize) throw new Error("invalid_batch_size");
  return resolved;
}

async function deleteBatches(model: { findMany: Function; deleteMany: Function }, where: unknown, size: number, dryRun: boolean) {
  if (dryRun) return 0;
  let deleted = 0;
  while (true) {
    const rows = await model.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" }, take: size });
    if (!rows.length) return deleted;
    const result = await model.deleteMany({ where: { id: { in: rows.map((row: { id: string }) => row.id) } } });
    deleted += result.count;
    if (rows.length < size) return deleted;
  }
}

/**
 * Server-only retention cleanup. It never runs on import and defaults to dry-run.
 * PaymentTransaction, User, and UserMembership are intentionally never targeted.
 */
export async function runAnalyticsRetentionCleanup(options: AnalyticsRetentionOptions = {}): Promise<AnalyticsRetentionReport> {
  const startedAt = Date.now();
  const dryRun = options.dryRun ?? true;
  const size = batchSize(options.batchSize);
  const now = options.now ?? new Date();
  const pageViewsWhere = { enteredAt: { lt: cutoff(now, ANALYTICS_RETENTION.pageViewsDays) } };
  const eventsWhere = { OR: [
    { eventName: { in: BUSINESS_EVENT_NAMES }, createdAt: { lt: cutoff(now, ANALYTICS_RETENTION.businessEventsDays) } },
    { eventName: { notIn: BUSINESS_EVENT_NAMES }, createdAt: { lt: cutoff(now, ANALYTICS_RETENTION.pageEventsDays) } },
  ] };
  // Sessions with remaining events are retained: their FK is ON DELETE CASCADE.
  const sessionsWhere = { lastActivityAt: { lt: cutoff(now, ANALYTICS_RETENTION.sessionsDays) }, events: { none: {} } };
  const visitorsWhere = { lastSeenAt: { lt: cutoff(now, ANALYTICS_RETENTION.visitorsInactiveDays) }, sessions: { none: {} }, pageViews: { none: {} }, events: { none: {} } };

  const [pageViewsMatched, eventsMatched, sessionsMatched, visitorsMatched] = await Promise.all([
    db.analyticsPageView.count({ where: pageViewsWhere }), db.analyticsEvent.count({ where: eventsWhere }),
    db.analyticsSession.count({ where: sessionsWhere }), db.analyticsVisitor.count({ where: visitorsWhere }),
  ]);
  const pageViewsDeleted = await deleteBatches(db.analyticsPageView, pageViewsWhere, size, dryRun);
  const eventsDeleted = await deleteBatches(db.analyticsEvent, eventsWhere, size, dryRun);
  const sessionsDeleted = await deleteBatches(db.analyticsSession, sessionsWhere, size, dryRun);
  const visitorsDeleted = await deleteBatches(db.analyticsVisitor, visitorsWhere, size, dryRun);
  const report = { dryRun, pageViewsMatched, sessionsMatched, eventsMatched, visitorsMatched, pageViewsDeleted, sessionsDeleted, eventsDeleted, visitorsDeleted, durationMs: Date.now() - startedAt };
  console.info("[ANALYTICS_RETENTION]", { dryRun: report.dryRun, pageViewsDeleted: report.pageViewsDeleted, eventsDeleted: report.eventsDeleted, sessionsDeleted: report.sessionsDeleted, visitorsDeleted: report.visitorsDeleted, durationMs: report.durationMs });
  return report;
}
