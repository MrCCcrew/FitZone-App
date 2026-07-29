const SENSITIVE_QUERY_KEYS = /token|email|phone|password|payment|card|secret|key/i;

export function sanitizeAnalyticsPath(value: string) {
  try {
    const url = new URL(value, "https://fitzone.local");
    if (url.pathname.startsWith("/admin")) return null;
    const query = new URLSearchParams();
    url.searchParams.forEach((entry, key) => {
      if (!SENSITIVE_QUERY_KEYS.test(key) && entry.length <= 80) query.set(key, entry);
    });
    return `${url.pathname}${query.size ? `?${query}` : ""}`.slice(0, 500);
  } catch {
    return null;
  }
}

export function isAnalyticsBot(userAgent: string | null) {
  return /bot|crawler|spider|slurp|facebookexternalhit|preview/i.test(userAgent ?? "");
}

export function sanitizeAnalyticsMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = new Set(["messageLength", "responseTimeMs", "inputMode", "success"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key, entry]) =>
      allowed.has(key) && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"),
    ),
  );
}
