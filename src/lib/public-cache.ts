type PublicPayload = {
  categories: Array<{ key: string; label: string; sizeType: "none" | "clothing" | "shoes" }>;
  memberships: Array<unknown>;
  offers: Array<unknown>;
  classes: Array<unknown>;
  trainers: Array<unknown>;
  trainersPage: Record<string, unknown> | null;
  products: Array<unknown>;
  testimonials: Array<unknown>;
};

type CacheEntry = { expiresAt: number; payload: PublicPayload };

type PublicCacheState = {
  fitzonePublicApiCache?: Record<string, CacheEntry>;
};

const globalForPublicApiCache = globalThis as unknown as PublicCacheState;

export function getPublicApiCache(lang: string) {
  return globalForPublicApiCache.fitzonePublicApiCache?.[lang];
}

export function setPublicApiCache(lang: string, cache: CacheEntry) {
  if (!globalForPublicApiCache.fitzonePublicApiCache) {
    globalForPublicApiCache.fitzonePublicApiCache = {};
  }
  globalForPublicApiCache.fitzonePublicApiCache[lang] = cache;
}

export function clearPublicApiCache() {
  delete globalForPublicApiCache.fitzonePublicApiCache;
}
