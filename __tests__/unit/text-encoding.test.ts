import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { detectCoachIntent } from "@/lib/ai-coach/intents";

describe("source text encoding", () => {
  it("contains no invalid UTF-8, replacement characters, or known mojibake", () => {
    expect(() => {
      execFileSync(process.execPath, ["scripts/check-text-encoding.mjs"], {
        cwd: process.cwd(),
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("keeps Arabic AI Coach intent patterns readable and functional", () => {
    expect(detectCoachIntent("\u0625\u064a\u0647 \u0627\u0644\u0639\u0631\u0648\u0636 \u0627\u0644\u0644\u064a \u0639\u0646\u062f\u0643\u0645")).toBe("offer_lookup");
    expect(detectCoachIntent("\u0645\u0648\u0627\u0639\u064a\u062f \u0627\u0644\u0632\u0648\u0645\u0628\u0627")).toBe("schedule_lookup");
    expect(detectCoachIntent("\u0646\u0635\u0627\u0626\u062d \u0644\u0644\u062a\u062e\u0633\u064a\u0633")).toBe("class_recommendation");
  });
});
