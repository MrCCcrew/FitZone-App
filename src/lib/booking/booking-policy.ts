export type BookingPolicyInput = {
  kind: string;
  sessionsCount: number | null;
  durationDays: number;
};

export type ResolvedBookingPolicy = {
  maxSessionsPerDay: number;
  minRequiredSelection: number | null;
  minSessionsPerWeek: number | null;
  requireSingleCalendarDay: boolean;
  requireDistinctClassesPerDay: boolean;
};

export function resolveBookingPolicy(input: BookingPolicyInput): ResolvedBookingPolicy {
  const durationDays = Math.max(1, Math.trunc(input.durationDays || 0));
  const sessionsCount =
    input.sessionsCount == null || input.sessionsCount <= 0
      ? null
      : Math.trunc(input.sessionsCount);

  if (input.kind === "trial") {
    return {
      maxSessionsPerDay: 1,
      minRequiredSelection: sessionsCount ?? 1,
      minSessionsPerWeek: null,
      requireSingleCalendarDay: durationDays === 1,
      requireDistinctClassesPerDay: false,
    };
  }

  // One-day products are not weekly subscriptions. Their entire entitlement
  // belongs to one Cairo calendar day, so the daily cap equals the entitlement.
  if (durationDays === 1) {
    const oneDaySessions = sessionsCount ?? 1;
    return {
      maxSessionsPerDay: oneDaySessions,
      minRequiredSelection: oneDaySessions,
      minSessionsPerWeek: null,
      requireSingleCalendarDay: true,
      requireDistinctClassesPerDay: oneDaySessions > 1,
    };
  }

  const minSessionsPerWeek = sessionsCount
    ? Math.ceil((sessionsCount * 7) / durationDays)
    : null;

  return {
    maxSessionsPerDay: 2,
    minRequiredSelection: minSessionsPerWeek,
    minSessionsPerWeek,
    requireSingleCalendarDay: false,
    requireDistinctClassesPerDay: false,
  };
}

export function getFrozenMaxSessionsPerDay(
  bookingPatternSnapshot: string | null | undefined,
  fallback = 2,
): number {
  if (!bookingPatternSnapshot) return fallback;
  try {
    const parsed = JSON.parse(bookingPatternSnapshot) as {
      policy?: { maxSessionsPerDay?: unknown };
    };
    const value = parsed?.policy?.maxSessionsPerDay;
    if (Number.isInteger(value) && Number(value) > 0 && Number(value) <= 12) {
      return Number(value);
    }
  } catch {
    // Legacy/invalid snapshot: preserve historical fallback.
  }
  return fallback;
}

export function getFrozenRequireDistinctClassesPerDay(
  bookingPatternSnapshot: string | null | undefined,
): boolean {
  if (!bookingPatternSnapshot) return false;
  try {
    const parsed = JSON.parse(bookingPatternSnapshot) as {
      policy?: { requireDistinctClassesPerDay?: unknown };
    };
    return parsed?.policy?.requireDistinctClassesPerDay === true;
  } catch {
    return false;
  }
}
