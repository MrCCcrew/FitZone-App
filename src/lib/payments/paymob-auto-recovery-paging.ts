/**
 * Deterministic, bounded candidate paging.
 *
 * Pure calculation only: no database or provider access.
 * Callers must provide a stable snapshot count and fixed ordering.
 */
export function selectPaymobRecoveryPage(
  candidateCount: number,
  nowMs: number,
  pageSize = 25,
  intervalMs = 300_000,
): { skip: number; take: number; page: number; pages: number } {
  if (
    !Number.isSafeInteger(candidateCount) ||
    candidateCount < 0 ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < 1
  ) {
    throw new Error("INVALID_PAYMOB_RECOVERY_PAGING_INPUT");
  }

  const pages = Math.max(1, Math.ceil(candidateCount / pageSize));
  const page = Math.floor(nowMs / intervalMs) % pages;

  return {
    skip: page * pageSize,
    take: pageSize,
    page,
    pages,
  };
}
