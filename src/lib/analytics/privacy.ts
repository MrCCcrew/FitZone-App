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

export type AnalyticsRequestContext = {
  countryCode?: string;
  countryName?: string;
  region?: string;
  city?: string;
  deviceType?: string;
  browser?: string;
  operatingSystem?: string;
};

function cleanHeader(value: string | null, max = 80) {
  const cleaned = value
    ?.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

  return cleaned || undefined;
}

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = cleanHeader(headers.get(name));
    if (value) return value;
  }
  return undefined;
}

export function parseAnalyticsUserAgent(
  userAgent: string | null,
): Pick<
  AnalyticsRequestContext,
  "deviceType" | "browser" | "operatingSystem"
> {
  const ua = userAgent ?? "";

  let deviceType = "desktop";
  if (/ipad|tablet|kindle|silk/i.test(ua)) {
    deviceType = "tablet";
  } else if (
    /mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)
  ) {
    deviceType = "mobile";
  }

  let browser = "Other";
  if (/EdgA?\/|EdgiOS\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera\//i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/CriOS\/|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/FxiOS\/|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/i.test(ua)) {
    browser = "Safari";
  }

  let operatingSystem = "Other";
  if (/Windows NT/i.test(ua)) operatingSystem = "Windows";
  else if (/Android/i.test(ua)) operatingSystem = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) operatingSystem = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) operatingSystem = "macOS";
  else if (/Linux/i.test(ua)) operatingSystem = "Linux";

  return { deviceType, browser, operatingSystem };
}

export function getAnalyticsRequestContext(
  headers: Headers,
): AnalyticsRequestContext {
  const trustProxyGeo =
    process.env.ANALYTICS_TRUST_PROXY_GEO === "true";

  let countryCode: string | undefined;
  let countryName: string | undefined;
  let region: string | undefined;
  let city: string | undefined;

  if (trustProxyGeo) {
    // Only infrastructure-controlled headers may be used here.
    // Never trust arbitrary x-country/x-city headers from public clients.
    const countryCodeRaw = firstHeader(headers, [
      "cf-ipcountry",
      "x-vercel-ip-country",
    ]);

    countryCode =
      countryCodeRaw && /^[A-Za-z]{2}$/.test(countryCodeRaw)
        ? countryCodeRaw.toUpperCase()
        : undefined;

    countryName = firstHeader(headers, [
      "x-vercel-ip-country-name",
    ]);

    region = firstHeader(headers, [
      "x-vercel-ip-country-region",
    ]);

    const cityRaw = firstHeader(headers, [
      "x-vercel-ip-city",
    ]);

    if (cityRaw) {
      try {
        city = cleanHeader(decodeURIComponent(cityRaw));
      } catch {
        city = cleanHeader(cityRaw);
      }
    }
  }

  return {
    ...(countryCode ? { countryCode } : {}),
    ...(countryName ? { countryName } : {}),
    ...(region ? { region } : {}),
    ...(city ? { city } : {}),
    ...parseAnalyticsUserAgent(headers.get("user-agent")),
  };
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
