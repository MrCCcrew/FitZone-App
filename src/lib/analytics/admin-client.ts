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

const isAbortError = (reason: unknown) => reason instanceof Error && reason.name === "AbortError";

export function resolveAdminAnalyticsLoad(results: Record<AnalyticsSection, PromiseSettledResult<unknown>>) {
  const payload: Partial<AnalyticsPayloads> = {};
  const failedSections: AnalyticsSection[] = [];

  for (const section of analyticsSections) {
    const result = results[section];
    if (result.status === "fulfilled") payload[section] = result.value;
    else if (!isAbortError(result.reason)) failedSections.push(section);
  }

  return { payload, failedSections };
}

export function analyticsQuery(filters: AnalyticsFilters) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to, timezone: filters.timezone });
  if (filters.source) params.set("source", filters.source);
  return params.toString();
}

async function getJson(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
  return response.json();
}

export async function loadAdminAnalytics(filters: AnalyticsFilters, signal: AbortSignal) {
  const query = analyticsQuery(filters);
  const results = await Promise.allSettled(analyticsSections.map((name) => getJson(`/api/admin/analytics/${name}?${query}`, signal)));
  return Object.fromEntries(results.map((result, index) => [analyticsSections[index], result])) as Record<AnalyticsSection, PromiseSettledResult<unknown>>;
}
