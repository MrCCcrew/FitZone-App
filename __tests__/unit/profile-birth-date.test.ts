import { describe, expect, it } from "vitest";
import { parseProfileBirthDate } from "@/lib/profile-birth-date";

describe("profile birth-date calendar validation", () => {
  const now = new Date("2026-10-12T21:30:00.000Z"); // Oct 13 in Cairo
  it("allows the current Cairo calendar day and canonical UTC midnight storage", () => {
    const result = parseProfileBirthDate("2026-10-13", now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.birthDate.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });
  it("rejects the next Cairo day even if the UTC clock day is earlier", () => {
    expect(parseProfileBirthDate("2026-10-14", now)).toEqual({ ok: false, error: "FUTURE_BIRTH_DATE" });
  });
  it("rejects timestamp input rather than implicitly shifting the civil birth date", () => {
    expect(parseProfileBirthDate("2026-10-14T00:01:00+03:00", now))
      .toEqual({ ok: false, error: "INVALID_BIRTH_DATE" });
  });
  it("rejects invalid calendar dates, non-leap dates and malformed inputs", () => {
    for (const value of ["2026-02-30", "2025-02-29", "13/10/2026", "", null]) {
      expect(parseProfileBirthDate(value, now)).toEqual({ ok: false, error: "INVALID_BIRTH_DATE" });
    }
    expect(parseProfileBirthDate("2024-02-29", now).ok).toBe(true);
  });
});
