import { z } from "zod";

const DAY = 24 * 60 * 60 * 1000;
export const ADMIN_ANALYTICS_EVENT_NAMES = [
  "subscription_viewed", "package_viewed", "offer_viewed", "checkout_started",
  "payment_succeeded", "payment_failed", "membership_activated",
  "ai_coach_open", "ai_coach_message", "ai_coach_response", "ai_coach_error",
] as const;
export const ADMIN_ANALYTICS_ENTITY_TYPES = [
  "subscription",
  "package",
  "offer",
  "order",
  "ai_coach",
] as const;

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

function localDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) throw new Error("invalid_timezone");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Returns the first UTC instant belonging to a local calendar date.
 *
 * We intentionally search by the local date itself instead of assuming a
 * fixed UTC offset. This keeps analytics boundaries correct across DST and
 * timezone offset changes.
 */
function startOfLocalDateUtc(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const center = Date.UTC(year!, month! - 1, day!);

  let low = center - 36 * 60 * 60 * 1000;
  let high = center + 36 * 60 * 60 * 1000;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (localDateKey(new Date(mid), timezone) >= date) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return new Date(low);
}

function localDateRange(date: string, timezone: string) {
  const from = startOfLocalDateUtc(date, timezone);
  const nextDay = startOfLocalDateUtc(shiftDateKey(date, 1), timezone);

  return {
    from,
    to: new Date(nextDay.getTime() - 1),
  };
}

export function parseAdminAnalyticsFilters(searchParams: URLSearchParams): AdminAnalyticsFilters {
  const parsed = schema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) throw new Error("invalid_filters");

  const timezone = parsed.data.timezone ?? "Africa/Cairo";
  if (!validTimeZone(timezone)) throw new Error("invalid_timezone");

  const todayLocal = localDateKey(new Date(), timezone);
  const defaultFromDate = shiftDateKey(todayLocal, -29);

  const requestedFrom = parsed.data.from ?? defaultFromDate;
  const requestedTo = parsed.data.to ?? todayLocal;

  const from = localDateRange(requestedFrom, timezone).from;
  const to = localDateRange(requestedTo, timezone).to;

  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from > to ||
    to.getTime() - from.getTime() > 366 * DAY
  ) {
    throw new Error("invalid_date_range");
  }

  const source = parsed.data.source?.trim();

  return {
    from,
    to,
    timezone,
    ...(source ? { source } : {}),
    eventName: parsed.data.eventName,
    entityType: parsed.data.entityType,
  };
}

export function localMonthUtcRange(
  year: number,
  month: number,
  timezone: string,
) {
  if (!validTimeZone(timezone)) throw new Error("invalid_timezone");

  const fromKey = [
    year,
    String(month).padStart(2, "0"),
    "01",
  ].join("-");

  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const toKey = [
    nextMonthDate.getUTCFullYear(),
    String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0"),
    "01",
  ].join("-");

  return {
    from: startOfLocalDateUtc(fromKey, timezone),
    to: startOfLocalDateUtc(toKey, timezone),
  };
}

export function dateRange(filters: AdminAnalyticsFilters) {
  return { gte: filters.from, lte: filters.to };
}

export function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}
