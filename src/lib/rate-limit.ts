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

    const payload = (await response.json()) as Array<{ result?: unknown }>;
    const count = Number(payload?.[0]?.result ?? 0);
    const ttlRaw = Number(payload?.[1]?.result ?? -1);
    const retryAfterMs = ttlRaw > 0 ? ttlRaw : windowMs;

    return {
      ok: count <= limit,
      remaining: Math.max(limit - count, 0),
      retryAfterMs,
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
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}
