import { describe, it, expect } from "vitest";
import {
  formatTime12Hour,
  formatDateTime12Hour,
  formatTimeRange12Hour,
  parse12HourTo24Hour,
  isValidTimeFormat,
} from "@/lib/time-format";

describe("formatTime12Hour", () => {
  it("formats midnight correctly", () => {
    expect(formatTime12Hour("00:00")).toBe("12:00 ص");
    expect(formatTime12Hour("00:00", { locale: "en-US" })).toBe("12:00 AM");
  });

  it("formats morning times correctly", () => {
    expect(formatTime12Hour("08:00")).toBe("08:00 ص");
    expect(formatTime12Hour("08:30")).toBe("08:30 ص");
    expect(formatTime12Hour("11:45")).toBe("11:45 ص");
  });

  it("formats noon correctly", () => {
    expect(formatTime12Hour("12:00")).toBe("12:00 م");
    expect(formatTime12Hour("12:30")).toBe("12:30 م");
  });

  it("formats afternoon/evening times correctly", () => {
    expect(formatTime12Hour("13:00")).toBe("01:00 م");
    expect(formatTime12Hour("13:30")).toBe("01:30 م");
    expect(formatTime12Hour("18:00")).toBe("06:00 م");
    expect(formatTime12Hour("18:30")).toBe("06:30 م");
    expect(formatTime12Hour("23:15")).toBe("11:15 م");
    expect(formatTime12Hour("23:59")).toBe("11:59 م");
  });

  it("handles seconds when showSeconds is true", () => {
    expect(formatTime12Hour("08:30:45", { showSeconds: true })).toBe("08:30:45 ص");
    expect(formatTime12Hour("13:30:15", { showSeconds: true })).toBe("01:30:15 م");
  });

  it("ignores seconds when showSeconds is false (default)", () => {
    expect(formatTime12Hour("08:30:45")).toBe("08:30 ص");
    expect(formatTime12Hour("13:30:15")).toBe("01:30 م");
  });

  it("handles English locale", () => {
    expect(formatTime12Hour("08:00", { locale: "en-US" })).toBe("08:00 AM");
    expect(formatTime12Hour("13:30", { locale: "en-US" })).toBe("01:30 PM");
    expect(formatTime12Hour("00:00", { locale: "en-US" })).toBe("12:00 AM");
    expect(formatTime12Hour("12:00", { locale: "en-US" })).toBe("12:00 PM");
  });

  it("handles null/undefined gracefully", () => {
    expect(formatTime12Hour(null)).toBe("");
    expect(formatTime12Hour(undefined)).toBe("");
    expect(formatTime12Hour("")).toBe("");
  });

  it("handles invalid formats gracefully", () => {
    expect(formatTime12Hour("invalid")).toBe("invalid");
    expect(formatTime12Hour("25:00")).toBe("25:00");
    expect(formatTime12Hour("12")).toBe("12");
  });
});

describe("formatDateTime12Hour", () => {
  it("formats Date objects correctly", () => {
    // Create a date at 8:30 AM Cairo time
    const date = new Date("2026-08-04T06:30:00.000Z"); // UTC, which is 8:30 AM in Cairo (UTC+2)
    const result = formatDateTime12Hour(date);

    // Check that it contains AM/PM indicator (ص or م)
    expect(result).toMatch(/[صم]|AM|PM/);
  });

  it("formats ISO strings correctly", () => {
    const isoString = "2026-08-04T06:30:00.000Z";
    const result = formatDateTime12Hour(isoString);

    expect(result).toMatch(/[صم]|AM|PM/);
  });

  it("handles null/undefined gracefully", () => {
    expect(formatDateTime12Hour(null)).toBe("");
    expect(formatDateTime12Hour(undefined)).toBe("");
  });

  it("handles invalid dates gracefully", () => {
    expect(formatDateTime12Hour("invalid")).toBe("");
    expect(formatDateTime12Hour(new Date("invalid"))).toBe("");
  });
});

describe("formatTimeRange12Hour", () => {
  it("formats time ranges correctly", () => {
    expect(formatTimeRange12Hour("18:00", "19:30")).toBe("06:00 م - 07:30 م");
    expect(formatTimeRange12Hour("08:00", "09:30")).toBe("08:00 ص - 09:30 ص");
    expect(formatTimeRange12Hour("11:00", "13:00")).toBe("11:00 ص - 01:00 م");
  });

  it("handles English locale", () => {
    expect(formatTimeRange12Hour("18:00", "19:30", { locale: "en-US" })).toBe("06:00 PM - 07:30 PM");
  });

  it("handles partial ranges", () => {
    expect(formatTimeRange12Hour("18:00", null)).toBe("06:00 م");
    expect(formatTimeRange12Hour(null, "19:30")).toBe("07:30 م");
    expect(formatTimeRange12Hour(null, null)).toBe("");
  });
});

describe("parse12HourTo24Hour", () => {
  it("parses Arabic AM times correctly", () => {
    expect(parse12HourTo24Hour("08:00 ص")).toBe("08:00");
    expect(parse12HourTo24Hour("12:00 ص")).toBe("00:00");
    expect(parse12HourTo24Hour("11:45 ص")).toBe("11:45");
  });

  it("parses Arabic PM times correctly", () => {
    expect(parse12HourTo24Hour("12:00 م")).toBe("12:00");
    expect(parse12HourTo24Hour("01:30 م")).toBe("13:30");
    expect(parse12HourTo24Hour("06:00 م")).toBe("18:00");
    expect(parse12HourTo24Hour("11:15 م")).toBe("23:15");
  });

  it("parses English AM times correctly", () => {
    expect(parse12HourTo24Hour("08:00 AM", "en-US")).toBe("08:00");
    expect(parse12HourTo24Hour("12:00 AM", "en-US")).toBe("00:00");
  });

  it("parses English PM times correctly", () => {
    expect(parse12HourTo24Hour("12:00 PM", "en-US")).toBe("12:00");
    expect(parse12HourTo24Hour("01:30 PM", "en-US")).toBe("13:30");
    expect(parse12HourTo24Hour("11:15 PM", "en-US")).toBe("23:15");
  });

  it("handles invalid formats gracefully", () => {
    expect(parse12HourTo24Hour("invalid")).toBe("invalid");
    expect(parse12HourTo24Hour("25:00 ص")).toBe("25:00"); // Invalid hour, returns "25:00"
  });
});

describe("isValidTimeFormat", () => {
  it("validates correct HH:mm format", () => {
    expect(isValidTimeFormat("00:00")).toBe(true);
    expect(isValidTimeFormat("08:30")).toBe(true);
    expect(isValidTimeFormat("12:00")).toBe(true);
    expect(isValidTimeFormat("23:59")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidTimeFormat("24:00")).toBe(false);
    expect(isValidTimeFormat("08:60")).toBe(false);
    expect(isValidTimeFormat("8:30")).toBe(true); // Single digit hour is valid
    expect(isValidTimeFormat("invalid")).toBe(false);
    expect(isValidTimeFormat("12:00:00")).toBe(false);
  });
});

describe("Time format regression tests", () => {
  it("should never display 24-hour format in user-facing strings", () => {
    const times = ["00:00", "08:00", "12:00", "13:30", "18:00", "23:15"];

    times.forEach((time) => {
      const formatted = formatTime12Hour(time);

      // Should not contain hour >= 13 without AM/PM
      expect(formatted).toMatch(/[صم]|AM|PM/);

      // Should not have 24-hour indicators like "13:", "14:", etc. without conversion
      if (formatted.includes("13") || formatted.includes("14") || formatted.includes("18") || formatted.includes("23")) {
        // These should be converted to 01, 02, 06, 11
        expect(formatted).not.toMatch(/^13:|^14:|^18:|^23:/);
      }
    });
  });

  it("matches the exact format shown in requirements", () => {
    // Requirements examples:
    // - 08:00 ص
    // - 01:30 م

    expect(formatTime12Hour("08:00")).toBe("08:00 ص");
    expect(formatTime12Hour("13:30")).toBe("01:30 م");
  });

  it("supports explicit meridiem override for English AM/PM", () => {
    // Production requirement: display times with English AM/PM regardless of locale
    expect(formatTime12Hour("00:00", { meridiem: "en" })).toBe("12:00 AM");
    expect(formatTime12Hour("08:00", { meridiem: "en" })).toBe("08:00 AM");
    expect(formatTime12Hour("12:00", { meridiem: "en" })).toBe("12:00 PM");
    expect(formatTime12Hour("13:00", { meridiem: "en" })).toBe("01:00 PM");
    expect(formatTime12Hour("16:00", { meridiem: "en" })).toBe("04:00 PM");
    expect(formatTime12Hour("17:00", { meridiem: "en" })).toBe("05:00 PM");
    expect(formatTime12Hour("23:15", { meridiem: "en" })).toBe("11:15 PM");
  });

  it("supports explicit meridiem override for Arabic ص/م", () => {
    expect(formatTime12Hour("08:00", { meridiem: "ar" })).toBe("08:00 ص");
    expect(formatTime12Hour("13:00", { meridiem: "ar" })).toBe("01:00 م");
    expect(formatTime12Hour("16:00", { meridiem: "ar" })).toBe("04:00 م");
  });
});
