import { describe, expect, it } from "vitest";
import { isCoachSessionClaimOwner } from "@/lib/ai-coach/session-guard";

describe("AI Coach session ownership", () => {
  const future = Math.floor(Date.now() / 1000) + 60;
  it("accepts only the matching signed-session claim owner", () => {
    expect(isCoachSessionClaimOwner({ sessionId: "session-a", userId: "user-a", exp: future }, "session-a", "user-a")).toBe(true);
  });
  it("rejects a different session id, forged user id, and expired claim", () => {
    expect(isCoachSessionClaimOwner({ sessionId: "session-a", userId: "user-a", exp: future }, "session-b", "user-a")).toBe(false);
    expect(isCoachSessionClaimOwner({ sessionId: "session-a", userId: "user-a", exp: future }, "session-a", "user-b")).toBe(false);
    expect(isCoachSessionClaimOwner({ sessionId: "session-a", userId: "user-a", exp: 1 }, "session-a", "user-a")).toBe(false);
  });
});
