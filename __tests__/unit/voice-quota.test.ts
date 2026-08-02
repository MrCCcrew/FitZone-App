import { describe, expect, it } from "vitest";
import {
  ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS,
  HEARTBEAT_GRACE_SECONDS,
  REGISTERED_VOICE_ENTITLEMENT_SECONDS,
  cairoPeriodKey,
  cappedHeartbeatIncrement,
  effectiveEntitlement,
  finalAccrualIncrement,
  finalizeQuotaTransfer,
  remainingVoiceSeconds,
} from "@/lib/ai-coach/voice/quota";
import { normalizedQuestionHash, normalizeKnowledgeQuestion } from "@/lib/ai-coach/shared-knowledge-cache";

describe("AI Coach voice quota policy", () => {
  it("gives registered users 300 seconds and active members 1800, never 2100", () => {
    expect(effectiveEntitlement(null, false)).toBe(REGISTERED_VOICE_ENTITLEMENT_SECONDS);
    expect(effectiveEntitlement(REGISTERED_VOICE_ENTITLEMENT_SECONDS, true)).toBe(ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS);
    expect(effectiveEntitlement(ACTIVE_MEMBER_VOICE_ENTITLEMENT_SECONDS, true)).toBe(1800);
  });

  it("does not downgrade the same Cairo period, but a new inactive period starts at 300", () => {
    expect(effectiveEntitlement(1800, false)).toBe(1800);
    expect(effectiveEntitlement(null, false)).toBe(300);
  });

  it("uses Africa/Cairo for an exact monthly period", () => {
    expect(cairoPeriodKey(new Date("2026-07-31T22:30:00.000Z"))).toBe("2026-08");
  });

  it("never bills more than heartbeat grace, expiry, or reservation", () => {
    const cursor = new Date("2026-08-02T10:00:00.000Z");
    const now = new Date("2026-08-02T10:05:00.000Z");
    const expiry = new Date("2026-08-02T10:10:00.000Z");
    expect(cappedHeartbeatIncrement(cursor, now, expiry, 170, 180)).toBe(10);
    // finalize may accrue through expiresAt; the heartbeat endpoint itself
    // rejects a heartbeat at expiry before this helper is reached.
    expect(cappedHeartbeatIncrement(cursor, expiry, expiry, 0, 180)).toBe(20);
    expect(HEARTBEAT_GRACE_SECONDS).toBeGreaterThanOrEqual(10);
  });

  it("starts billing at the second heartbeat and includes a recent final accrual", () => {
    const first = new Date("2026-08-02T10:00:00.000Z");
    const second = new Date("2026-08-02T10:00:12.000Z");
    const expiry = new Date("2026-08-02T10:03:00.000Z");
    expect(cappedHeartbeatIncrement(first, first, expiry, 0, 180)).toBe(0);
    expect(cappedHeartbeatIncrement(first, second, expiry, 0, 180)).toBe(12);
    expect(finalAccrualIncrement({ connectedAt: first, lastHeartbeatAt: second, billingCursorAt: second, expiresAt: expiry, billableSeconds: 12, reservedSeconds: 180 }, new Date("2026-08-02T10:00:17.000Z"))).toBe(5);
  });

  it("finalize transfers billable from reservation exactly once", () => {
    const first = finalizeQuotaTransfer({ usedSeconds: 12, reservedSeconds: 180 }, { billableSeconds: 195, reservedSeconds: 180 });
    expect(first).toEqual({ usedSeconds: 192, reservedSeconds: 0, billableSeconds: 180 });
    expect(remainingVoiceSeconds({ entitlementSeconds: 300, ...first })).toBe(108);
  });
});

describe("shared knowledge normalization", () => {
  it("makes Arabic equivalent aliases hash identically while preserving numbers", () => {
    expect(normalizeKnowledgeQuestion("مواعيد، الكلاسات  2026!")).toContain("2026");
    expect(normalizedQuestionHash("إشتراك النادي")).toBe(normalizedQuestionHash("اشتراك النادي"));
  });

  it("keeps one global hash/language alias identity", () => {
    const schema = require("fs").readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("@@unique([normalizedQuestionHash, language])");
    expect(schema).not.toContain("@@unique([knowledgeEntryId, normalizedQuestionHash, language])");
  });
});
