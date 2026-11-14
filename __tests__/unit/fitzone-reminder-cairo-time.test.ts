import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  scheduleSlotInstant,
  scheduleWeekday,
} from "../../src/lib/fitzone-time";

const anchor = (date: string) =>
  new Date(`${date}T00:00:00.000Z`);

describe("FitZone Cairo reminder scheduling", () => {
  it("uses UTC+2 during Egyptian winter", () => {
    expect(
      scheduleSlotInstant(anchor("2026-01-15"), "18:00").toISOString(),
    ).toBe("2026-01-15T16:00:00.000Z");
  });

  it("uses UTC+3 during Egyptian summer", () => {
    expect(
      scheduleSlotInstant(anchor("2026-07-15"), "18:00").toISOString(),
    ).toBe("2026-07-15T15:00:00.000Z");
  });

  it("calculates a five-hour reminder before the real session", () => {
    const slot = scheduleSlotInstant(anchor("2026-07-15"), "18:00");
    const reminder = new Date(slot.getTime() - 5 * 60 * 60 * 1000);
    expect(reminder.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("handles Cairo sessions near midnight", () => {
    expect(
      scheduleSlotInstant(anchor("2026-11-15"), "00:30").toISOString(),
    ).toBe("2026-11-14T22:30:00.000Z");
  });

  it("preserves weekday from the schedule calendar anchor", () => {
    expect(scheduleWeekday(anchor("2026-11-15"))).toBe(0);
    expect(scheduleWeekday(anchor("2026-11-14"))).toBe(6);
  });

  it.each([
    ["2026-04-23", "2026-04-23T16:00:00.000Z"],
    ["2026-04-24", "2026-04-24T15:00:00.000Z"],
    ["2026-10-29", "2026-10-29T15:00:00.000Z"],
    ["2026-10-30", "2026-10-30T16:00:00.000Z"],
  ])(
    "handles Egypt DST start/end for %s",
    (date, expected) => {
      expect(
        scheduleSlotInstant(anchor(date), "18:00").toISOString(),
      ).toBe(expected);
    },
  );
  it("wires the reminder route to the existing Cairo helpers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/cron/send-reminders/route.ts"),
      "utf8",
    );

    expect(source).toContain("scheduleSlotInstant(");
    expect(source).toContain("scheduleWeekday(");
    expect(source).not.toContain("slotDate.setHours(");
  });
});