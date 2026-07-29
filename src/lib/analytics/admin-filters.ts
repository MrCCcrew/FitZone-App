import { z } from "zod";

const DAY = 24 * 60 * 60 * 1000;
export const ADMIN_ANALYTICS_EVENT_NAMES = [
  "subscription_viewed", "package_viewed", "offer_viewed", "checkout_started",
  "payment_succeeded", "payment_failed", "membership_activated",
] as const;
export const ADMIN_ANALYTICS_ENTITY_TYPES = ["subscription", "package", "offer", "order"] as const;

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezone: z.string().max(80).optional(),
  source: z.string().max(80).optional(),
  eventName: z.enum(ADMIN_ANALYTICS_EVENT_NAMES).optional(),
  entityType: z.enum(ADMIN_ANALYTICS_ENTITY_TYPES).optional(),
});

export type AdminAnalyticsFilters = {
  from: Date;
  to: Date;
  timezone: string;
  source?: string;
  eventName?: (typeof ADMIN_ANALYTICS_EVENT_NAMES)[number];
  entityType?: (typeof ADMIN_ANALYTICS_ENTITY_TYPES)[number];
};

function validTimeZone(value: string) {
  try { Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

export function parseAdminAnalyticsFilters(searchParams: URLSearchParams): AdminAnalyticsFilters {
  const parsed = schema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) throw new Error("invalid_filters");
  const timezone = parsed.data.timezone ?? "Africa/Cairo";
  if (!validTimeZone(timezone)) throw new Error("invalid_timezone");
  const today = new Date();
  const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));
  const defaultFrom = new Date(defaultTo.getTime() - 29 * DAY);
  const from = parsed.data.from ? new Date(`${parsed.data.from}T00:00:00.000Z`) : defaultFrom;
  const to = parsed.data.to ? new Date(`${parsed.data.to}T23:59:59.999Z`) : defaultTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to || to.getTime() - from.getTime() > 366 * DAY) {
    throw new Error("invalid_date_range");
  }
  return { from, to, timezone, source: parsed.data.source, eventName: parsed.data.eventName, entityType: parsed.data.entityType };
}

export function dateRange(filters: AdminAnalyticsFilters) {
  return { gte: filters.from, lte: filters.to };
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}
