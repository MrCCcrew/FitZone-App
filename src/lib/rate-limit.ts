type RateLimitEntry = {
  count: number;
  resetAt: number;
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

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}
