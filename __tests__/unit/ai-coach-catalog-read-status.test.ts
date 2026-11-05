import { describe, expect, it } from "vitest";
import { scheduleReadState, trainerReadState } from "@/lib/ai-coach/catalog-read-status";
import { visibleTrainerWhere } from "@/lib/public-catalog";

describe("AI Coach public catalog read states", () => {
  it("uses the same active-trainer scope as the public trainers page", () => {
    expect(visibleTrainerWhere()).toEqual({ isActive: true });
    expect(trainerReadState(2, 2, 2)).toBe("ok");
    // showOnHome=false is homepage placement only; it must not hide a trainer page result.
    expect(trainerReadState(2, 2, 1)).toBe("ok");
  });

  it("distinguishes trainer absence, hidden rows, and specialty mismatch", () => {
    expect(trainerReadState(0, 0, 0)).toBe("no_data");
    expect(trainerReadState(3, 0, 0)).toBe("hidden_only");
    expect(trainerReadState(3, 3, 0)).toBe("filtered_empty");
  });

  it("distinguishes classes from schedule availability", () => {
    expect(scheduleReadState(0, 0, 0, 0)).toBe("no_classes");
    expect(scheduleReadState(2, 0, 0, 0)).toBe("no_schedules");
    expect(scheduleReadState(2, 4, 0, 0)).toBe("no_future_schedules");
    expect(scheduleReadState(2, 4, 2, 0)).toBe("no_bookable_schedules");
    expect(scheduleReadState(2, 4, 2, 1)).toBe("ok");
  });
});
