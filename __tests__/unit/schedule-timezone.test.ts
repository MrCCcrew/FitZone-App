import { describe, expect, it } from "vitest";
import { cairoDayWindow, PUBLIC_TIME_ZONE } from "@/lib/public-catalog";

describe("public schedule timezone", () => {
  it("uses Africa/Cairo calendar days independent of server timezone", () => {
    const instant = new Date("2026-08-03T22:30:00.000Z");
    const today = cairoDayWindow(instant);
    const tomorrow = cairoDayWindow(instant, 1);
    expect(PUBLIC_TIME_ZONE).toBe("Africa/Cairo");
    expect(tomorrow.from.getTime() - today.from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(today.to.getTime() - today.from.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    expect(today.from.getTime()).toBeLessThan(instant.getTime());
    expect(today.to.getTime()).toBeGreaterThan(instant.getTime());
  });

  it("keeps the day boundary correct across Cairo midnight", () => {
    const before = new Date("2026-08-03T20:59:59.999Z");
    const after = new Date("2026-08-03T21:00:00.000Z");
    const beforeWindow = cairoDayWindow(before);
    const afterWindow = cairoDayWindow(after);
    expect(beforeWindow.to.getTime()).toBeLessThan(afterWindow.to.getTime());
    expect(afterWindow.from.getTime()).toBe(afterWindow.to.getTime() - (24 * 60 * 60 * 1000 - 1));
  });
});
