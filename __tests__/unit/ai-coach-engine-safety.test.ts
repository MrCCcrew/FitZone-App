import { describe, expect, it, vi } from "vitest";

const { update, createCheckIn, createMessage } = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue({}), createCheckIn: vi.fn(), createMessage: vi.fn().mockResolvedValue({}) }));

vi.mock("@/lib/app-session", () => ({ getCurrentAppUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/db", () => ({ db: { chatSession: { findUnique: vi.fn().mockResolvedValue({ id: "session", mode: "bot", context: null, messages: [] }), update }, chatMessage: { create: createMessage } } }));
vi.mock("@/lib/ai-coach/site-data", () => ({ getCoachSiteSnapshot: vi.fn().mockResolvedValue({ memberships: [], offers: [], classes: [], trainers: [], products: [], knowledge: [], account: { authenticated: false }, coachProfile: null, recentCheckIns: [], supportOnline: false }) }));
vi.mock("@/lib/ai-coach/quick-actions", () => ({ buildQuickActions: vi.fn().mockReturnValue([]) }));
vi.mock("@/lib/ai-coach/catalog-tools", () => ({ getAuthenticatedCustomerMembership: vi.fn(), searchActiveOffers: vi.fn(), searchAvailableMemberships: vi.fn(), searchClassSchedule: vi.fn() }));
vi.mock("@/lib/ai-coach/advanced", () => ({ buildAdvancedNudge: vi.fn(), createAdvancedCheckIn: createCheckIn, logAdvancedCoachEvent: vi.fn(), parseAdvancedCheckIn: vi.fn().mockReturnValue(null), persistQuestionnaireProfile: vi.fn() }));

import { handleCoachMessage } from "@/lib/ai-coach/engine";

describe("AI Coach engine safety", () => {
  it("keeps a mentioned weight in conversation context without creating a check-in", async () => {
    const reply = await handleCoachMessage("session", "\u0644\u0648 \u0648\u0632\u0646\u064a 120 \u0643\u064a\u0644\u0648 \u0623\u0639\u0645\u0644 \u0625\u064a\u0647", "ar");
    expect(createCheckIn).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ context: expect.stringContaining('"statedWeight":120') }) }));
    expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: expect.stringContaining("طولك") }) }));
  });
});
