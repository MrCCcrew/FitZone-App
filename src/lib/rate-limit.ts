type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  source: "memory" | "redis";
};

const globalForRateLimit = globalThis as unknown as {
  fitzoneRateLimits?: Map<string, RateLimitEntry>;
};

const store = globalForRateLimit.fitzoneRateLimits ?? new Map<string, RateLimitEntry>();
globalForRateLimit.fitzoneRateLimits = store;

function cleanup(now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function applyRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  cleanup(now);

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterMs: windowMs };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(current.resetAt - now, 0),
    };
  }

  current.count += 1;
  store.set(key, current);

  return {
    ok: true,
    remaining: Math.max(limit - current.count, 0),
    retryAfterMs: Math.max(current.resetAt - now, 0),
  };
}

function getRedisRestConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) return null;
  return { url, token };
}

async function applyRedisRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const config = getRedisRestConfig();
  if (!config) return null;

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify([
        ["INCR", key],
        ["PTTL", key],
        ["EXPIRE", key, Math.max(Math.ceil(windowMs / 1000), 1), "NX"],
      ]),
    });

    if (!response.ok) {
      console.warn("[RATE_LIMIT_REDIS_HTTP]", response.status);
      return null;
    }

    // Upstash can return HTTP 200 while an individual pipeline command failed.
    // Never turn missing/error results into count=0 (which would fail open).
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length !== 3) return null;
    const entries = payload as Array<{ result?: unknown; error?: unknown } | null>;
    if (entries.some((entry) => !entry || typeof entry !== "object" || "error" in entry || !("result" in entry))) {
      return null;
    }

    const rawCount = entries[0]?.result;
    const rawTtl = entries[1]?.result;
    const rawExpire = entries[2]?.result;
    const count = Number(rawCount);
    const ttlRaw = Number(rawTtl);

    // INCR returns a positive integer; PTTL returns -1 on the first call
    // because EXPIRE NX is applied afterwards in the same pipeline.
    if (
      (typeof rawCount !== "number" && typeof rawCount !== "string") ||
      !Number.isSafeInteger(count) || count < 1 ||
      (typeof rawTtl !== "number" && typeof rawTtl !== "string") ||
      !Number.isSafeInteger(ttlRaw) || ttlRaw < -1 ||
      ![0, 1, "0", "1"].includes(rawExpire as number | string) ||
      (ttlRaw === -1 && (rawExpire === 0 || rawExpire === "0"))
    ) return null;

    return {
      ok: count <= limit,
      remaining: Math.max(limit - count, 0),
      retryAfterMs: ttlRaw > 0 ? ttlRaw : windowMs,
      source: "redis",
    };
  } catch (error) {
    console.warn("[RATE_LIMIT_REDIS_FALLBACK]", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export async function applySensitiveRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redisResult = await applyRedisRateLimit(key, limit, windowMs);
  if (redisResult) return redisResult;

  const memoryResult = applyRateLimit(key, limit, windowMs);
  return {
    ...memoryResult,
    source: "memory",
  };
}

export function getClientIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return "unknown";
}
