export type AnalyticsFilters = { from: string; to: string; timezone: string; source?: string };
export type AnalyticsPayloads = Record<"overview" | "traffic" | "events" | "conversions", unknown>;
export const analyticsSections = ["overview", "traffic", "events", "conversions"] as const;
export type AnalyticsSection = (typeof analyticsSections)[number];
export const analyticsSectionErrorLabels: Record<AnalyticsSection, string> = {
  overview: "تعذر تحميل الملخص",
  traffic: "تعذر تحميل بيانات الزيارات",
  events: "تعذر تحميل الأحداث",
  conversions: "تعذر تحميل التحويلات",
};

export const analyticsDisplayNumber = (value: number | null | undefined) => value ?? 0;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = "Africa/Cairo";

export function normalizeAnalyticsFilters(filters: AnalyticsFilters): AnalyticsFilters {
  const from = DATE.test(filters.from) ? filters.from : "";
  const to = DATE.test(filters.to) ? filters.to : "";
  const timezone = /^[A-Za-z_]+\/[A-Za-z_]+$|^UTC$/.test(filters.timezone) ? filters.timezone : DEFAULT_TIMEZONE;
  const source = filters.source?.trim();
  return { from, to, timezone, ...(source ? { source } : {}) };
}

const isAbortError = (reason: unknown) => reason instanceof Error && reason.name === "AbortError";

export function resolveAdminAnalyticsLoad(results: Record<AnalyticsSection, PromiseSettledResult<unknown>>) {
  const payload: Partial<AnalyticsPayloads> = {};
  const failedSections: AnalyticsSection[] = [];

  for (const section of analyticsSections) {
    const result = results[section];
    if (result.status === "fulfilled") payload[section] = result.value;
    else if (!isAbortError(result.reason)) {
      if (process.env.NODE_ENV === "development") console.error("[ADMIN_ANALYTICS_LOAD]", { section, reason: result.reason });
      failedSections.push(section);
    }
  }

  return { payload, failedSections };
}

export function analyticsQuery(filters: AnalyticsFilters) {
  const normalized = normalizeAnalyticsFilters(filters);
  const params = new URLSearchParams({ from: normalized.from, to: normalized.to, timezone: normalized.timezone });
  if (normalized.source) params.set("source", normalized.source);
  return params.toString();
}

async function getJson(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    const error = new Error(`request_failed_${response.status}`) as Error & { status?: number; endpoint?: string };
    error.status = response.status; error.endpoint = path; throw error;
  }
  return response.json();
}

export async function loadAdminAnalytics(filters: AnalyticsFilters, signal: AbortSignal) {
  const query = analyticsQuery(normalizeAnalyticsFilters(filters));
  const results = await Promise.allSettled(analyticsSections.map((name) => getJson(`/api/admin/analytics/${name}?${query}`, signal)));
  return Object.fromEntries(results.map((result, index) => [analyticsSections[index], result])) as Record<AnalyticsSection, PromiseSettledResult<unknown>>;
}
