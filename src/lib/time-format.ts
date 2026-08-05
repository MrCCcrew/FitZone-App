/**
 * Centralized 12-hour time formatting for FitZone
 *
 * All times displayed to users must use 12-hour format with AM/PM (ص/م)
 * Storage format remains unchanged (HH:mm in database)
 */

export type TimeFormatOptions = {
  locale?: "ar-EG" | "en-US";
  timezone?: string;
  showSeconds?: boolean;
  /** Override meridiem format: "ar" for ص/م, "en" for AM/PM */
  meridiem?: "ar" | "en";
};

/**
 * Formats a time string (HH:mm or HH:mm:ss) to 12-hour format
 * Examples (default Arabic meridiem):
 * - "08:00" => "08:00 ص"
 * - "13:30" => "01:30 م"
 * - "00:00" => "12:00 ص"
 * - "12:00" => "12:00 م"
 * - "23:15" => "11:15 م"
 *
 * Examples (meridiem: "en"):
 * - "08:00" => "08:00 AM"
 * - "13:00" => "01:00 PM"
 * - "16:00" => "04:00 PM"
 * - "17:00" => "05:00 PM"
 */
export function formatTime12Hour(
  value: string | null | undefined,
  options: TimeFormatOptions = {}
): string {
  if (!value) return "";

  const { locale = "ar-EG", showSeconds = false, meridiem } = options;

  try {
    // Parse HH:mm or HH:mm:ss format
    const parts = value.split(":");
    if (parts.length < 2) return value;

    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const seconds = parts[2];

    if (isNaN(hours) || hours < 0 || hours > 23) return value;

    // Determine AM/PM
    const isPM = hours >= 12;
    // Allow explicit meridiem override or fallback to locale
    const meridiemFormat = meridiem ?? (locale === "ar-EG" ? "ar" : "en");
    const period = meridiemFormat === "ar" ? (isPM ? "م" : "ص") : (isPM ? "PM" : "AM");

    // Convert to 12-hour format
    // Special cases: 0 => 12, 12 stays 12, 13-23 => 1-11
    if (hours === 0) {
      hours = 12;
    } else if (hours > 12) {
      hours = hours - 12;
    }

    // Format with leading zeros
    const hoursStr = hours.toString().padStart(2, "0");
    const timeStr = showSeconds && seconds
      ? `${hoursStr}:${minutes}:${seconds}`
      : `${hoursStr}:${minutes}`;

    // Return formatted string with period
    return `${timeStr} ${period}`;
  } catch {
    return value;
  }
}

/**
 * Formats a Date object to 12-hour time
 * Handles timezone conversion if needed
 */
export function formatDateTime12Hour(
  value: Date | string | null | undefined,
  options: TimeFormatOptions = {}
): string {
  if (!value) return "";

  const { locale = "ar-EG", timezone = "Africa/Cairo", showSeconds = false } = options;

  try {
    const date = typeof value === "string" ? new Date(value) : value;
    if (isNaN(date.getTime())) return "";

    // Format using Intl with 12-hour format
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      ...(showSeconds ? { second: "2-digit" } : {}),
      hour12: true,
    });

    return formatter.format(date);
  } catch {
    return "";
  }
}

/**
 * Formats a time range in 12-hour format
 * Example: ("18:00", "19:30") => "06:00 م – 07:30 م"
 */
export function formatTimeRange12Hour(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  options: TimeFormatOptions = {}
): string {
  const start = formatTime12Hour(startTime, options);
  const end = formatTime12Hour(endTime, options);

  if (!start && !end) return "";
  if (!start) return end;
  if (!end) return start;

  const separator = " - ";
  return `${start}${separator}${end}`;
}

/**
 * Parses 12-hour time input back to 24-hour format for storage
 * This is for future use if we implement 12-hour input pickers
 * For now, we keep type="time" inputs as-is
 */
export function parse12HourTo24Hour(
  value: string,
  locale: "ar-EG" | "en-US" = "ar-EG"
): string {
  try {
    // Match patterns like "08:00 ص" or "01:30 PM"
    const arPattern = /(\d{1,2}):(\d{2})\s*([صم])/;
    const enPattern = /(\d{1,2}):(\d{2})\s*(AM|PM)/i;

    const match = locale === "ar-EG"
      ? value.match(arPattern)
      : value.match(enPattern);

    if (!match) return value;

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3];

    // Convert to 24-hour
    const isPM = period === "م" || period.toUpperCase() === "PM";

    if (isPM && hours !== 12) {
      hours += 12;
    } else if (!isPM && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  } catch {
    return value;
  }
}

/**
 * Validates that a time string is in valid HH:mm format
 */
export function isValidTimeFormat(value: string): boolean {
  const pattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return pattern.test(value);
}

/**
 * Gets current time in HH:mm format (for form defaults)
 */
export function getCurrentTime24Hour(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
