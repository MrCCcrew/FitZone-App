import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/ai-coach/config", () => ({ isCoachDebugEnabled: () => state.enabled }));
import { createCoachDebugTrace } from "@/lib/ai-coach/debug";

describe("AI Coach safe debug trace", () => {
  beforeEach(() => { state.enabled = false; });
  it("is disabled outside development debug mode", () => {
    expect(createCoachDebugTrace({ detectedIntent: "offer_lookup", authenticated: false, sourceType: "live_site_data", fallbackUsed: false, llmUsed: false })).toBeNull();
  });
  it("contains only operational metadata when enabled", () => {
    state.enabled = true;
    const trace = createCoachDebugTrace({ detectedIntent: "offer_lookup", selectedTools: ["searchOffers"], toolStatuses: { searchOffers: "success_with_results" }, resultCounts: { searchOffers: 3 }, authenticated: true, sourceType: "live_site_data", fallbackUsed: false, fallbackReason: "success", llmUsed: true });
    expect(trace).toEqual(expect.objectContaining({ event: "ai_coach_trace", detectedIntent: "offer_lookup", selectedTools: ["searchOffers"] }));
    expect(JSON.stringify(trace)).not.toMatch(/message|userId|cookie|token|balance|name/i);
  });
});
