import type { RecoveryCursor } from "./paymob-auto-recovery-cursor";
import type { RecoveryMaterializationCandidate } from "./paymob-auto-recovery-materializer";

export type RecoveryDiscoveryPage = {
  candidates: RecoveryMaterializationCandidate[];
  nextCursor: RecoveryCursor | null;
  hasMore: boolean;
};

export async function schedulePaymobRecoveryPages(
  input: {
    scan: (
      limit: number,
      cursor: RecoveryCursor | null,
    ) => Promise<RecoveryDiscoveryPage>;
    materialize: (
      candidates: readonly RecoveryMaterializationCandidate[],
    ) => Promise<unknown>;
    checkpoint?: (cursor: RecoveryCursor | null) => Promise<void>;
    pageSize?: number;
    maxPages?: number;
    initialCursor?: RecoveryCursor | null;
  },
): Promise<{
  pages: number;
  candidates: number;
  hasMore: boolean;
  nextCursor: RecoveryCursor | null;
}> {
  const pageSize = input.pageSize ?? 25;
  const maxPages = input.maxPages ?? 4;

  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 || pageSize > 100 ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 || maxPages > 20
  ) {
    throw new Error("INVALID_RECOVERY_SCHEDULE_LIMITS");
  }

  const initialCursor = input.initialCursor ?? null;
  if (initialCursor !== null && (
    !(initialCursor.createdAt instanceof Date) ||
    !Number.isFinite(initialCursor.createdAt.getTime()) ||
    !initialCursor.id.trim()
  )) {
    throw new Error("INVALID_RECOVERY_INITIAL_CURSOR");
  }

  let cursor: RecoveryCursor | null = initialCursor;
  let pages = 0;
  let candidates = 0;
  let hasMore = false;

  while (pages < maxPages) {
    const page = await input.scan(pageSize, cursor);

    if (
      !Array.isArray(page.candidates) ||
      page.candidates.length > pageSize ||
      typeof page.hasMore !== "boolean" ||
      (page.hasMore && !page.nextCursor)
    ) {
      throw new Error("INVALID_RECOVERY_SCAN_PAGE");
    }

    // Must persist this page before advancing its cursor.
    await input.materialize(page.candidates);
    // Never advance to another page until its progress is durable.
    if (input.checkpoint) {
      await input.checkpoint(page.nextCursor);
    }

    pages++;
    candidates += page.candidates.length;
    hasMore = page.hasMore;
    cursor = page.nextCursor;

    if (!hasMore) break;
  }

  return { pages, candidates, hasMore, nextCursor: cursor };
}
