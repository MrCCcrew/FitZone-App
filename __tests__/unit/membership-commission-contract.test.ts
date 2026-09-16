import { describe, expect, it } from "vitest";
import {
  calculateCommission,
  parseMembershipCommissionSnapshot,
  serializeMembershipCommissionSnapshot,
  type MembershipCommissionSnapshotV1,
} from "@/lib/commissions/membership-commission-contract";

describe("membership commission contract", () => {
  it("calculates percentage commissions with EGP 2-decimal precision", () => {
    expect(
      calculateCommission({
        type: "percentage",
        rate: 7.5,
        baseAmount: 999.99,
      }),
    ).toBe(75);
  });

  it("calculates fixed commissions independently of base amount", () => {
    expect(
      calculateCommission({
        type: "fixed",
        rate: 125,
        baseAmount: 0,
      }),
    ).toBe(125);
  });

  it("rejects invalid negative economics", () => {
    expect(() =>
      calculateCommission({
        type: "percentage",
        rate: -1,
        baseAmount: 100,
      }),
    ).toThrow(/Invalid commission snapshot field/);
  });

  it("round-trips a versioned immutable snapshot", () => {
    const snapshot: MembershipCommissionSnapshotV1 = {
      version: 1,
      capturedAt: "2026-08-18T19:56:00.000Z",
      partner: {
        partnerId: "partner-1",
        source: "affiliate_link",
        affiliateToken: "ABC123",
        terms: {
          type: "percentage",
          rate: 10,
          baseAmount: 1000,
        },
        manager: {
          managerId: "manager-1",
          type: "percentage_of_partner",
          rate: 20,
        },
      },
    };

    const raw = serializeMembershipCommissionSnapshot(snapshot);
    const parsed = parseMembershipCommissionSnapshot(raw);

    expect(parsed.version).toBe(1);
    expect(parsed.partner?.partnerId).toBe("partner-1");
    expect(parsed.partner?.terms.baseAmount).toBe(1000);
  });

  it("keeps tracked customer spend independent from commission base", () => {
    const snapshot: MembershipCommissionSnapshotV1 = {
      version: 1,
      capturedAt: "2026-08-18T20:00:00.000Z",
      salesAgent: {
        agentId: "agent-1",
        referralCode: "FZ-TEST1",
        trackedSpendAmount: 650,
        terms: {
          type: "percentage",
          rate: 10,
          baseAmount: 800,
        },
      },
    };

    const parsed = parseMembershipCommissionSnapshot(
      serializeMembershipCommissionSnapshot(snapshot),
    );

    expect(parsed.salesAgent?.trackedSpendAmount).toBe(650);
    expect(parsed.salesAgent?.terms.baseAmount).toBe(800);
    expect(calculateCommission(parsed.salesAgent!.terms)).toBe(80);
  });

  it("rejects unknown snapshot versions", () => {
    expect(() =>
      parseMembershipCommissionSnapshot(
        JSON.stringify({ version: 999, capturedAt: new Date().toISOString() }),
      ),
    ).toThrow(/Unsupported/);
  });
});
