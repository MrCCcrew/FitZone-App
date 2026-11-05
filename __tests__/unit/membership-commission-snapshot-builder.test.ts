import { describe, expect, it, vi } from "vitest";

import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { parseMembershipCommissionSnapshot } from "@/lib/commissions/membership-commission-contract";

function fakeTx(overrides: Record<string, unknown> = {}) {
  return {
    partner: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    partnerCode: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    partnerAffiliateLink: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    salesAgent: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    contractsManager: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    staffReferralLink: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    trainerReferralLink: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    nutritionReferralLink: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

describe("membership commission snapshot builder", () => {
  it("creates an empty versioned contract when there is no commission attribution", async () => {
    const raw = await buildMembershipCommissionSnapshotTx(fakeTx(), {
      partnerCommissionBase: 1000,
      customerPaidAmount: 650,
    });

    const snapshot = parseMembershipCommissionSnapshot(raw);

    expect(snapshot.version).toBe(1);
    expect(snapshot.partner).toBeUndefined();
    expect(snapshot.salesAgent).toBeUndefined();
    expect(snapshot.staff).toBeUndefined();
  });

  it("keeps partner commission base independent from customer paid amount", async () => {
    const tx = fakeTx({
      partner: {
        findUnique: vi.fn().mockResolvedValue({
          id: "partner-1",
          commissionRate: 10,
          commissionType: "percentage",
          managerId: "manager-1",
          managerCommissionType: "percentage_of_partner",
          managerCommissionRate: 20,
        }),
      },
      partnerAffiliateLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "link-1",
          partnerId: "partner-1",
          token: "PARTNER-X",
        }),
      },
    });

    const raw = await buildMembershipCommissionSnapshotTx(tx, {
      partnerId: "partner-1",
      affiliateLinkId: "link-1",
      partnerCommissionBase: 1000,
      customerPaidAmount: 650,
    });

    const snapshot = parseMembershipCommissionSnapshot(raw);

    expect(snapshot.partner?.terms.baseAmount).toBe(1000);
    expect(snapshot.partner?.terms.rate).toBe(10);
    expect(snapshot.partner?.affiliateToken).toBe("PARTNER-X");
    expect(snapshot.partner?.manager).toEqual({
      managerId: "manager-1",
      type: "percentage_of_partner",
      rate: 20,
    });
  });

  it("freezes SalesAgent paid amount and active manager economics", async () => {
    const tx = fakeTx({
      salesAgent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          referralCode: "FZ-AGENT",
          commissionRate: 15,
          commissionType: "percentage",
          managerId: "manager-1",
        }),
      },
      contractsManager: {
        findUnique: vi.fn().mockResolvedValue({
          id: "manager-1",
          commissionType: "percentage_of_revenue",
          commissionRate: 5,
          isActive: true,
        }),
      },
    });

    const raw = await buildMembershipCommissionSnapshotTx(tx, {
      salesAgentId: "agent-1",
      partnerCommissionBase: 1000,
      customerPaidAmount: 650,
    });

    const snapshot = parseMembershipCommissionSnapshot(raw);

    expect(snapshot.salesAgent?.terms.baseAmount).toBe(650);
    expect(snapshot.salesAgent?.trackedSpendAmount).toBe(650);
    expect(snapshot.salesAgent?.manager).toEqual({
      managerId: "manager-1",
      type: "percentage_of_revenue",
      rate: 5,
      revenueBase: 650,
    });
  });

  it("does not freeze an inactive SalesAgent manager commission", async () => {
    const tx = fakeTx({
      salesAgent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "agent-1",
          referralCode: "FZ-AGENT",
          commissionRate: 15,
          commissionType: "percentage",
          managerId: "manager-1",
        }),
      },
      contractsManager: {
        findUnique: vi.fn().mockResolvedValue({
          id: "manager-1",
          commissionType: "fixed",
          commissionRate: 999,
          isActive: false,
        }),
      },
    });

    const raw = await buildMembershipCommissionSnapshotTx(tx, {
      salesAgentId: "agent-1",
      partnerCommissionBase: 1000,
      customerPaidAmount: 650,
    });

    const snapshot = parseMembershipCommissionSnapshot(raw);

    expect(snapshot.salesAgent).toBeDefined();
    expect(snapshot.salesAgent?.manager).toBeUndefined();
  });

  it("freezes staff/trainer/nutrition tokens and current commission terms", async () => {
    const tx = fakeTx({
      staffReferralLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "staff-link",
          token: "STAFF-X",
          userId: "staff-user",
          user: {
            commissionRate: 10,
            commissionType: "percentage",
          },
        }),
      },

      trainerReferralLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "trainer-link",
          token: "TRAINER-X",
          userId: "trainer-user",
          user: {
            commissionRate: 50,
            commissionType: "fixed",
          },
        }),
      },

      nutritionReferralLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "nutrition-link",
          token: "NUTRITION-X",
          userId: "nutrition-user",
          user: {
            nutritionistProfile: {
              commissionRate: 30,
              commissionType: "percentage",
            },
          },
        }),
      },
    });

    const raw = await buildMembershipCommissionSnapshotTx(tx, {
      staffReferralLinkId: "staff-link",
      trainerReferralLinkId: "trainer-link",
      nutritionReferralLinkId: "nutrition-link",
      partnerCommissionBase: 1000,
      customerPaidAmount: 650,
    });

    const snapshot = parseMembershipCommissionSnapshot(raw);

    expect(snapshot.staff).toMatchObject({
      staffUserId: "staff-user",
      referralLinkId: "staff-link",
      referralToken: "STAFF-X",
      terms: {
        type: "percentage",
        rate: 10,
        baseAmount: 650,
      },
    });

    expect(snapshot.trainer).toMatchObject({
      trainerUserId: "trainer-user",
      referralLinkId: "trainer-link",
      referralToken: "TRAINER-X",
      terms: {
        type: "fixed",
        rate: 50,
        baseAmount: 650,
      },
    });

    expect(snapshot.nutrition).toMatchObject({
      nutritionistUserId: "nutrition-user",
      referralLinkId: "nutrition-link",
      referralToken: "NUTRITION-X",
      terms: {
        type: "percentage",
        rate: 30,
        baseAmount: 650,
      },
    });
  });

  it("fails closed when a frozen attribution can no longer be resolved", async () => {
    await expect(
      buildMembershipCommissionSnapshotTx(fakeTx(), {
        salesAgentId: "missing-agent",
        partnerCommissionBase: 1000,
        customerPaidAmount: 650,
      }),
    ).rejects.toThrow(
      "Attributed SalesAgent disappeared before commission snapshot",
    );
  });

  it("rejects invalid monetary inputs", async () => {
    await expect(
      buildMembershipCommissionSnapshotTx(fakeTx(), {
        partnerCommissionBase: -1,
        customerPaidAmount: 650,
      }),
    ).rejects.toThrow("Invalid commission snapshot input");
  });
});
