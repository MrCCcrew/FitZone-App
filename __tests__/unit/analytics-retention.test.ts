import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { visitor, session, pageView, event } = vi.hoisted(() => {
  const makeModel = () => ({ count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() });
  return { visitor: makeModel(), session: makeModel(), pageView: makeModel(), event: makeModel() };
});
vi.mock("@/lib/db", () => ({ db: { analyticsVisitor: visitor, analyticsSession: session, analyticsPageView: pageView, analyticsEvent: event } }));

import { runAnalyticsRetentionCleanup } from "@/lib/analytics/retention";
import { parseAnalyticsRetentionArgs } from "@/lib/analytics/retention-cli";

describe("analytics retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of [visitor, session, pageView, event]) { model.count.mockResolvedValue(0); model.findMany.mockResolvedValue([]); model.deleteMany.mockResolvedValue({ count: 0 }); }
  });

  it("defaults to dry-run and never deletes records", async () => {
    pageView.count.mockResolvedValue(4); event.count.mockResolvedValue(2); session.count.mockResolvedValue(3); visitor.count.mockResolvedValue(1);
    const report = await runAnalyticsRetentionCleanup({ now: new Date("2027-01-01") });
    expect(report).toMatchObject({ dryRun: true, pageViewsMatched: 4, eventsMatched: 2, sessionsMatched: 3, visitorsMatched: 1, pageViewsDeleted: 0 });
    expect(pageView.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes old page views in bounded batches only when explicitly executing", async () => {
    pageView.count.mockResolvedValue(3); pageView.findMany.mockResolvedValueOnce([{ id: "pv1" }, { id: "pv2" }]).mockResolvedValueOnce([{ id: "pv3" }]); pageView.deleteMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    const report = await runAnalyticsRetentionCleanup({ dryRun: false, batchSize: 2, now: new Date("2027-01-01") });
    expect(report.pageViewsDeleted).toBe(3); expect(pageView.deleteMany).toHaveBeenCalledTimes(2);
    expect(pageView.findMany.mock.calls[0]?.[0]).toMatchObject({ take: 2, orderBy: { createdAt: "asc" } });
  });

  it("uses the longer business-event retention and never targets payment transactions", async () => {
    await runAnalyticsRetentionCleanup({ now: new Date("2027-01-01") });
    const where = event.count.mock.calls[0]?.[0].where;
    expect(where.OR[0].eventName.in).toContain("payment_succeeded");
    expect(where.OR[0].createdAt.lt.getTime()).toBeLessThan(where.OR[1].createdAt.lt.getTime());
  });

  it("retains sessions with events and deletes only fully orphaned inactive visitors", async () => {
    await runAnalyticsRetentionCleanup({ now: new Date("2027-01-01") });
    expect(session.count.mock.calls[0]?.[0].where).toMatchObject({ events: { none: {} } });
    expect(visitor.count.mock.calls[0]?.[0].where).toMatchObject({ sessions: { none: {} }, pageViews: { none: {} }, events: { none: {} } });
  });

  it("rejects invalid batch sizes and requires --execute for destructive mode", async () => {
    await expect(runAnalyticsRetentionCleanup({ batchSize: 0 })).rejects.toThrow("invalid_batch_size");
    expect(parseAnalyticsRetentionArgs([])).toEqual({ dryRun: true, batchSize: undefined });
    expect(parseAnalyticsRetentionArgs(["--execute", "--batch-size=500"])).toEqual({ dryRun: false, batchSize: 500 });
    expect(() => parseAnalyticsRetentionArgs(["--remove-everything"])).toThrow("unknown_argument");
  });
});
