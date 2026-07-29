export type AnalyticsFilters = { from: string; to: string; timezone: string; source?: string };
export type AnalyticsPayloads = Record<"overview" | "traffic" | "events" | "conversions", unknown>;

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
  const names = ["overview", "traffic", "events", "conversions"] as const;
  const results = await Promise.allSettled(names.map((name) => getJson(`/api/admin/analytics/${name}?${query}`, signal)));
  return Object.fromEntries(results.map((result, index) => [names[index], result])) as Record<(typeof names)[number], PromiseSettledResult<unknown>>;
}
