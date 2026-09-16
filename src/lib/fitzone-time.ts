/**
 * FitZone business timezone.
 *
 * IMPORTANT:
 * - Schedule.date is a calendar-date anchor stored at UTC midnight.
 * - Schedule.time is an Egypt local wall-clock time such as "16:00".
 * - Business/calendar decisions must never depend on the server timezone.
 */
export const FITZONE_TIMEZONE = "Africa/Cairo";

const CAIRO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: FITZONE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const CAIRO_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: FITZONE_TIMEZONE,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getCairoParts(date: Date) {
  const parts = CAIRO_PARTS_FORMATTER.formatToParts(date);

  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/**
 * Offset of Africa/Cairo from UTC at the supplied instant.
 * Handles Egypt DST through the runtime IANA timezone database.
 */
export function getCairoOffsetMs(instant: Date): number {
  const parts = getCairoParts(instant);

  const cairoFieldsAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return cairoFieldsAsUtc - instant.getTime();
}

/**
 * Schedule.date is stored as a DATE-LIKE value at UTC midnight.
 *
 * We deliberately extract its UTC YYYY-MM-DD fields instead of asking
 * JavaScript for the host/server-local calendar date.
 */
export function scheduleCalendarDateKey(scheduleDate: Date): string {
  const year = scheduleDate.getUTCFullYear();
  const month = String(scheduleDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(scheduleDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Convert a real instant into its Egypt calendar date.
 */
export function cairoCalendarDateKey(instant: Date): string {
  const parts = getCairoParts(instant);

  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

/**
 * Cairo weekday for a real instant.
 * 0=Sunday ... 6=Saturday
 */
export function cairoWeekday(instant: Date): number {
  const label = CAIRO_WEEKDAY_FORMATTER.format(instant);
  return WEEKDAY_INDEX[label] ?? 0;
}

/**
 * Weekday of Schedule.date's calendar date.
 *
 * Schedule.date itself is a date-only anchor, so this must not depend on
 * the machine timezone.
 */
export function scheduleWeekday(scheduleDate: Date): number {
  return new Date(
    Date.UTC(
      scheduleDate.getUTCFullYear(),
      scheduleDate.getUTCMonth(),
      scheduleDate.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  ).getUTCDay();
}

function parseScheduleTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());

  if (!match) {
    throw new Error(`Invalid FitZone schedule time: ${time}`);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    throw new Error(`Invalid FitZone schedule time: ${time}`);
  }

  return { hour, minute, second };
}

/**
 * Convert Schedule.date + Schedule.time, interpreted as Egypt local time,
 * into the true UTC instant.
 *
 * Iterating the timezone offset is important around DST boundaries.
 */
export function scheduleSlotInstant(
  scheduleDate: Date,
  time: string,
): Date {
  const year = scheduleDate.getUTCFullYear();
  const month = scheduleDate.getUTCMonth() + 1;
  const day = scheduleDate.getUTCDate();
  const { hour, minute, second } = parseScheduleTime(time);

  const wallClockAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    0,
  );

  // Initial approximation.
  let candidate = new Date(wallClockAsUtc);

  // Resolve the actual Africa/Cairo offset. Two/three iterations make this
  // independent of whether the initial guess falls on the other side of a
  // DST transition.
  for (let i = 0; i < 3; i += 1) {
    const offset = getCairoOffsetMs(candidate);
    const next = new Date(wallClockAsUtc - offset);

    if (next.getTime() === candidate.getTime()) {
      candidate = next;
      break;
    }

    candidate = next;
  }

  return candidate;
}

export function isScheduleAtOrAfter(
  scheduleDate: Date,
  time: string,
  instant: Date,
): boolean {
  return scheduleSlotInstant(scheduleDate, time).getTime() >= instant.getTime();
}

export function isScheduleAtOrBefore(
  scheduleDate: Date,
  time: string,
  instant: Date,
): boolean {
  return scheduleSlotInstant(scheduleDate, time).getTime() <= instant.getTime();
}

export function isScheduleBetween(
  scheduleDate: Date,
  time: string,
  start: Date,
  end: Date,
): boolean {
  const slot = scheduleSlotInstant(scheduleDate, time).getTime();

  return slot >= start.getTime() && slot <= end.getTime();
}

/**
 * Convert an Africa/Cairo wall-clock date/time into the corresponding instant.
 * Internal helper for business calendar operations.
 */
function cairoWallClockInstant(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  const wallClockAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );

  let candidate = new Date(wallClockAsUtc);

  for (let i = 0; i < 4; i += 1) {
    const offset = getCairoOffsetMs(candidate);
    const next = new Date(wallClockAsUtc - offset);

    if (next.getTime() === candidate.getTime()) {
      return next;
    }

    candidate = next;
  }

  return candidate;
}

/**
 * Start of a YYYY-MM-DD calendar date in Africa/Cairo.
 */
export function cairoDateStartInstant(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());

  if (!match) {
    throw new Error(`Invalid Cairo calendar date: ${dateKey}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const anchor = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    anchor.getUTCFullYear() !== year ||
    anchor.getUTCMonth() + 1 !== month ||
    anchor.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Cairo calendar date: ${dateKey}`);
  }

  return cairoWallClockInstant(year, month, day, 0, 0, 0, 0);
}

/**
 * Add business calendar days in Africa/Cairo while preserving the Cairo
 * wall-clock time. This is DST-safe and independent of the server timezone.
 */
export function addCairoCalendarDays(
  instant: Date,
  days: number,
): Date {
  if (!Number.isInteger(days)) {
    throw new Error(`Invalid Cairo calendar-day increment: ${days}`);
  }

  const parts = getCairoParts(instant);

  const targetDate = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + days,
      12,
      0,
      0,
      0,
    ),
  );

  return cairoWallClockInstant(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    parts.hour,
    parts.minute,
    parts.second,
    instant.getUTCMilliseconds(),
  );
}
