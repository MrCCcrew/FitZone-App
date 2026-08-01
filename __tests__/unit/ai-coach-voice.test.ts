import { describe, expect, it } from "vitest";
import { normalizeEgyptianTranscript } from "@/lib/ai-coach/voice/dialect-normalizer";

describe("AI Coach voice normalization", () => {
  it("normalizes FitZone vocabulary without changing numbers", () => {
    expect(normalizeEgyptianTranscript("عاوزه اعرف فيت زون kick boxing بكام 500").normalizedTranscript).toContain("500");
  });
  it("requires review for safety-sensitive speech", () => {
    expect(normalizeEgyptianTranscript("مش عايزة أعدل رصيدي 500").needsConfirmation).toBe(true);
    expect(normalizeEgyptianTranscript("عندي وجع في الصدر").needsConfirmation).toBe(true);
  });
});
