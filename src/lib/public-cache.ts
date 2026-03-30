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

type PublicCacheState = {
  fitzonePublicApiCache?: { expiresAt: number; payload: PublicPayload };
};

const globalForPublicApiCache = globalThis as unknown as PublicCacheState;

export function getPublicApiCache() {
  return globalForPublicApiCache.fitzonePublicApiCache;
}

export function setPublicApiCache(cache: { expiresAt: number; payload: PublicPayload }) {
  globalForPublicApiCache.fitzonePublicApiCache = cache;
}

export function clearPublicApiCache() {
  delete globalForPublicApiCache.fitzonePublicApiCache;
}
