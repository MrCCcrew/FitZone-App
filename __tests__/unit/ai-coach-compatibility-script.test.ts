import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("AI Coach compatibility check", () => {
  it("is opt-in and contains read-only count operations only", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "scripts/check-ai-coach-production-compatibility.ts"), "utf8");
    expect(source).toContain('AI_COACH_COMPATIBILITY_ALLOW !== "1"');
    expect(source).toContain(".count(");
    expect(source).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.upsert\(|\$executeRaw/);
  });
});
