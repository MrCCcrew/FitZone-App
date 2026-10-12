import { cairoCalendarDateKey } from "@/lib/fitzone-time";

/**
 * A birth date is a calendar DATE, not a timestamp.
 * Only YYYY-MM-DD is accepted, to prevent client timezones shifting the day.
 * Store the validated date at UTC midnight for the existing DOB/age contract.
 */
export function parseProfileBirthDate(
  value: unknown,
  now = new Date(),
): { ok: true; birthDate: Date } | { ok: false; error: "INVALID_BIRTH_DATE" | "FUTURE_BIRTH_DATE" } {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "INVALID_BIRTH_DATE" };
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "INVALID_BIRTH_DATE" };
  }
  if (value > cairoCalendarDateKey(now)) {
    return { ok: false, error: "FUTURE_BIRTH_DATE" };
  }
  return { ok: true, birthDate: date };
}
