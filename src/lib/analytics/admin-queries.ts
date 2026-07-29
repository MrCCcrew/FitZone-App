import "server-only";
import { db } from "@/lib/db";
import { sanitizeAnalyticsPath } from "@/lib/analytics/privacy";
import { dateRange, safeRate, type AdminAnalyticsFilters } from "@/lib/analytics/admin-filters";

const TOP_LIMIT = 20;
const VIEW_EVENTS = new Set(["subscription_viewed", "package_viewed", "offer_viewed"]);
const ACTIVE_EVENTS = ["subscription_viewed", "package_viewed", "offer_viewed", "checkout_started", "payment_succeeded", "payment_failed", "membership_activated"];
type Metadata = Record<string, unknown> | null;

function numeric(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function day(value: Date, timezone: string) { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function metadataValue(metadata: Metadata, key: string) { const value = metadata?.[key]; return typeof value === "string" ? value.slice(0, 80) : undefined; }
function add(map: Map<string, number>, key: string, value = 1) { map.set(key, (map.get(key) ?? 0) + value); }
function ordered(map: Map<string, number>) { return [...map].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT); }

async function loadBase(filters: AdminAnalyticsFilters) {
  const range = dateRange(filters);
  const eventWhere = { createdAt: range, ...(filters.eventName ? { eventName: filters.eventName } : {}), ...(filters.entityType ? { entityType: filters.entityType } : {}) };
  const [pageViews, sessions, events] = await Promise.all([
    db.analyticsPageView.findMany({ where: { enteredAt: range }, select: { visitorId: true, sessionId: true, path: true, enteredAt: true, durationSeconds: true, exitedAt: true } }),
    db.analyticsSession.findMany({ where: { OR: [{ startedAt: range }, { lastActivityAt: range }] }, select: { id: true, startedAt: true, durationSeconds: true, pageViewCount: true, isBounce: true, landingPage: true, exitPage: true, referrer: true, visitorId: true } }),
    db.analyticsEvent.findMany({ where: eventWhere, select: { eventName: true, entityType: true, entityId: true, entityName: true, metadata: true, createdAt: true } }),
  ]);
  const filteredEvents = filters.source ? events.filter((event) => metadataValue(event.metadata as Metadata, "source") === filters.source) : events;
  return { pageViews, sessions, events: filteredEvents };
}

export async function getAnalyticsOverview(filters: AdminAnalyticsFilters) {
  const { pageViews, sessions, events } = await loadBase(filters);
  const count = (name: string) => events.filter((event) => event.eventName === name).length;
  const views = events.filter((event) => VIEW_EVENTS.has(event.eventName)).length;
  const succeeded = count("payment_succeeded");
  const activated = count("membership_activated");
  const checkout = count("checkout_started");
  const currencies = new Map<string, { currency: string; value: number; payments: number }>();
  for (const event of events.filter((entry) => entry.eventName === "payment_succeeded")) {
    const metadata = event.metadata as Metadata;
    const currency = metadataValue(metadata, "currency") ?? "UNKNOWN";
    const current = currencies.get(currency) ?? { currency, value: 0, payments: 0 };
    current.value += numeric(metadata?.value); current.payments += 1; currencies.set(currency, current);
  }
  const currencyBreakdown = [...currencies.values()].map((entry) => ({ ...entry, averageValue: entry.payments ? entry.value / entry.payments : 0 }));
  return {
    traffic: { visitors: new Set(pageViews.map((entry) => entry.visitorId)).size, sessions: sessions.length, pageViews: pageViews.length, uniquePageViews: new Set(pageViews.map((entry) => `${entry.visitorId}:${entry.path}`)).size, averageSessionDuration: sessions.length ? sessions.reduce((sum, entry) => sum + entry.durationSeconds, 0) / sessions.length : 0, averagePageViewDuration: pageViews.length ? pageViews.reduce((sum, entry) => sum + entry.durationSeconds, 0) / pageViews.length : 0, bounceRate: safeRate(sessions.filter((entry) => entry.isBounce).length, sessions.length) },
    business: { subscriptionViews: count("subscription_viewed"), packageViews: count("package_viewed"), offerViews: count("offer_viewed"), checkoutStarted: checkout, paymentSucceeded: succeeded, paymentFailed: count("payment_failed"), membershipActivated: activated },
    revenue: { successfulPaymentValue: currencyBreakdown.length === 1 ? currencyBreakdown[0]!.value : null, currencyBreakdown, averageSuccessfulPaymentValue: currencyBreakdown.length === 1 ? currencyBreakdown[0]!.averageValue : null },
    conversion: { viewToCheckoutRate: safeRate(checkout, views), checkoutToPaymentRate: safeRate(succeeded, checkout), paymentToActivationRate: safeRate(activated, succeeded), overallViewToActivationRate: safeRate(activated, views) },
  };
}

export async function getAnalyticsTraffic(filters: AdminAnalyticsFilters) {
  const { pageViews, sessions } = await loadBase(filters);
  const daily = new Map<string, { date: string; visitors: Set<string>; sessions: number; pageViews: number; duration: number; bounces: number }>();
  for (const entry of pageViews) { const key = day(entry.enteredAt, filters.timezone); const bucket = daily.get(key) ?? { date: key, visitors: new Set(), sessions: 0, pageViews: 0, duration: 0, bounces: 0 }; bucket.visitors.add(entry.visitorId); bucket.pageViews++; bucket.duration += entry.durationSeconds; daily.set(key, bucket); }
  for (const entry of sessions) { const key = day(entry.startedAt, filters.timezone); const bucket = daily.get(key) ?? { date: key, visitors: new Set(), sessions: 0, pageViews: 0, duration: 0, bounces: 0 }; bucket.sessions++; bucket.bounces += entry.isBounce ? 1 : 0; daily.set(key, bucket); }
  const pages = new Map<string, { path: string; views: number; visitors: Set<string>; duration: number; exits: number }>();
  for (const entry of pageViews) { const path = sanitizeAnalyticsPath(entry.path) ?? "/"; const item = pages.get(path) ?? { path, views: 0, visitors: new Set(), duration: 0, exits: 0 }; item.views++; item.visitors.add(entry.visitorId); item.duration += entry.durationSeconds; item.exits += entry.exitedAt ? 1 : 0; pages.set(path, item); }
  const top = [...pages.values()].map((item) => ({ path: item.path, views: item.views, uniqueVisitors: item.visitors.size, averageDuration: item.views ? item.duration / item.views : 0, exits: item.exits })).sort((a, b) => b.views - a.views).slice(0, TOP_LIMIT);
  const landing = new Map<string, number>(), exit = new Map<string, number>(), referrer = new Map<string, number>();
  for (const entry of sessions) { if (entry.landingPage) add(landing, sanitizeAnalyticsPath(entry.landingPage) ?? "/"); if (entry.exitPage) add(exit, sanitizeAnalyticsPath(entry.exitPage) ?? "/"); if (entry.referrer) add(referrer, sanitizeAnalyticsPath(entry.referrer) ?? "external"); }
  return { daily: [...daily.values()].map((entry) => ({ date: entry.date, visitors: entry.visitors.size, sessions: entry.sessions, pageViews: entry.pageViews, averageDuration: entry.pageViews ? entry.duration / entry.pageViews : 0, bounceRate: safeRate(entry.bounces, entry.sessions) })).sort((a, b) => a.date.localeCompare(b.date)), topPages: top, landingPages: ordered(landing).map(({ key, count }) => ({ path: key, count })), exitPages: ordered(exit).map(({ key, count }) => ({ path: key, count })), topReferrers: ordered(referrer).map(({ key, count }) => ({ referrer: key, count })), deviceBreakdown: [], browserBreakdown: [], countryBreakdown: [] };
}

export async function getAnalyticsEvents(filters: AdminAnalyticsFilters) {
  const { events } = await loadBase(filters);
  const totals = new Map<string, number>(), daily = new Map<string, number>(), entities = new Map<string, { entityType: string | null; entityId: string | null; entityName: string | null; count: number; successfulValue: number }>(), methods = new Map<string, number>(), failures = new Map<string, number>();
  for (const event of events) { add(totals, event.eventName); add(daily, day(event.createdAt, filters.timezone)); const metadata = event.metadata as Metadata; const key = `${event.entityType ?? "unknown"}:${event.entityId ?? ""}:${event.entityName ?? ""}`; const entity = entities.get(key) ?? { entityType: event.entityType, entityId: event.entityId, entityName: event.entityName, count: 0, successfulValue: 0 }; entity.count++; if (event.eventName === "payment_succeeded") entity.successfulValue += numeric(metadata?.value); entities.set(key, entity); const method = metadataValue(metadata, "paymentMethodType"); const failure = metadataValue(metadata, "failureCategory"); if (method) add(methods, method); if (failure) add(failures, failure); }
  return { totalsByEventName: ordered(totals).map(({ key, count }) => ({ eventName: key, count })), dailySeries: [...daily].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)), topEntities: [...entities.values()].sort((a, b) => b.count - a.count).slice(0, TOP_LIMIT), successFailure: { success: events.filter((event) => event.eventName === "payment_succeeded").length, failure: events.filter((event) => event.eventName === "payment_failed").length }, paymentMethodBreakdown: ordered(methods).map(({ key, count }) => ({ paymentMethodType: key, count })), failureCategoryBreakdown: ordered(failures).map(({ key, count }) => ({ failureCategory: key, count })) };
}

export async function getAnalyticsConversions(filters: AdminAnalyticsFilters) {
  const { events } = await loadBase(filters);
  const funnel = (entityType?: string, includeOrders = false) => { const subset = events.filter((entry) => !entityType || entry.entityType === entityType); const views = subset.filter((entry) => VIEW_EVENTS.has(entry.eventName)).length; const checkoutStarted = subset.filter((entry) => entry.eventName === "checkout_started").length; const paymentSucceeded = subset.filter((entry) => entry.eventName === "payment_succeeded").length; const membershipActivated = includeOrders ? 0 : subset.filter((entry) => entry.eventName === "membership_activated").length; return { views, checkoutStarted, paymentSucceeded, membershipActivated, viewToCheckoutRate: safeRate(checkoutStarted, views), checkoutToPaymentRate: safeRate(paymentSucceeded, checkoutStarted), paymentToActivationRate: includeOrders ? 0 : safeRate(membershipActivated, paymentSucceeded), totalRate: includeOrders ? safeRate(paymentSucceeded, checkoutStarted) : safeRate(membershipActivated, views) }; };
  return { definition: "event-based", membershipFunnel: funnel(), byEntityType: ["subscription", "package", "offer"].map((entityType) => ({ entityType, ...funnel(entityType) })), storeFunnel: { entityType: "order", ...funnel("order", true) } };
}
