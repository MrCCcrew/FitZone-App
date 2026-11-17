import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySensitiveRateLimit } from "@/lib/rate-limit";

const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "synthetic-offline-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
  if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
});

const response = (value: unknown) => ({ ok: true, json: async () => value });

describe("R19 Upstash pipeline strict result handling (simulated, no network)", () => {
  it("accepts a valid INCR/PTTL/EXPIRE pipeline response", async () => {
    const fetchMock = vi.fn(async () => response([
      { result: 1 }, { result: -1 }, { result: 1 },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await applySensitiveRateLimit("r19-valid", 1, 600_000);
    expect(result).toMatchObject({ source: "redis", ok: true, remaining: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [{ error: "WRONGTYPE" }, { result: -1 }, { result: 1 }],
    [{ result: null }, { result: -1 }, { result: 1 }],
    [{ result: 0 }, { result: -1 }, { result: 1 }],
    [{ result: 1 }, { error: "PTTL failed" }, { result: 1 }],
    [{ result: 1 }, { result: -1 }, { error: "EXPIRE failed" }],
    [{ result: 1 }, { result: -1 }],
  ].map((data) => [data]))("never represents malformed Redis pipeline output as redis-backed success", async (data) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(data)));
    const result = await applySensitiveRateLimit("r19-invalid-" + JSON.stringify(data), 1, 600_000);
    expect(result.source).toBe("memory");
  });

  it("returns one permitted claim under 24 concurrent requests with simulated atomic INCR", async () => {
    let count = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      // Stub models Redis's atomic INCR result, not a live Redis connection.
      const next = ++count;
      return response([{ result: next }, { result: 100_000 }, { result: 0 }]);
    }));
    const results = await Promise.all(Array.from({ length: 24 }, () =>
      applySensitiveRateLimit("r19-simulated-replay", 1, 600_000),
    ));
    expect(results.filter((r) => r.source === "redis" && r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.source === "redis" && !r.ok)).toHaveLength(23);
  });
});
