import type { Prisma } from "@prisma/client";

import {
  serializeMembershipCommissionSnapshot,
  type CommissionType,
  type MembershipCommissionSnapshotV1,
} from "./membership-commission-contract";

import { resolveStaffReferralPolicyTx } from "./staff-referral-policy";

type Tx = Prisma.TransactionClient;

export type BuildMembershipCommissionSnapshotInput = {
  partnerId?: string | null;
  partnerCodeId?: string | null;
  affiliateLinkId?: string | null;

  salesAgentUserId?: string | null;
  salesAgentId?: string | null;

  staffReferralLinkId?: string | null;
  trainerReferralLinkId?: string | null;
  nutritionReferralLinkId?: string | null;

  // Supplied only by NEW checkout paths.
  // Legacy compatibility snapshot creation intentionally omits both.
  customerUserId?: string | null;
  staffReferralAsOfDate?: Date | null;

  /**
   * Historical Partner business rule:
   * membership listed/effective price BEFORE wallet/rewards/referral reductions.
   */
  partnerCommissionBase: number;

  /**
   * Historical paidAmount semantics used by:
   * legacy agent, SalesAgent, Staff, Trainer, Nutrition,
   * SalesAgentReferral.totalSpent and manager percentage_of_revenue.
   */
  customerPaidAmount: number;
};

function nonNegative(value: number, field: string): number {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid commission snapshot input ${field}: ${value}`);
  }

  return n;
}

/**
 * Preserve current commission-type semantics:
 * existing code treats only literal "fixed" as fixed; everything else
 * follows percentage behavior.
 */
function normalizeCommissionType(
  value: string | null | undefined,
): CommissionType {
  return value === "fixed" ? "fixed" : "percentage";
}

/**
 * Current ContractsManager semantics:
 * percentage_of_agents | percentage_of_revenue | otherwise fixed.
 */
function normalizeSalesManagerType(
  value: string | null | undefined,
): "percentage_of_agents" | "percentage_of_revenue" | "fixed" {
  if (value === "percentage_of_agents") return value;
  if (value === "percentage_of_revenue") return value;
  return "fixed";
}

/**
 * Current Partner manager semantics:
 * percentage_of_partner | otherwise fixed.
 */
function normalizePartnerManagerType(
  value: string | null | undefined,
): "percentage_of_partner" | "fixed" {
  return value === "percentage_of_partner" ? "percentage_of_partner" : "fixed";
}

/**
 * Builds the immutable purchase-time commission contract.
 *
 * IMPORTANT:
 * - Must be called from the SAME transaction that creates UserMembership.
 * - Reads current economic configuration exactly once.
 * - Performs NO commission writes.
 * - Performs NO referral consumption.
 * - Performs NO click/conversion counter writes.
 * - Missing attributed records FAIL CLOSED instead of silently losing commission.
 */
export async function buildMembershipCommissionSnapshotTx(
  tx: Tx,
  input: BuildMembershipCommissionSnapshotInput,
): Promise<string> {
  const partnerCommissionBase = nonNegative(
    input.partnerCommissionBase,
    "partnerCommissionBase",
  );

  const customerPaidAmount = nonNegative(
    input.customerPaidAmount,
    "customerPaidAmount",
  );

  const snapshot: MembershipCommissionSnapshotV1 = {
    version: 1,
    capturedAt: new Date().toISOString(),
  };

  // ── Partner ────────────────────────────────────────────────────────────────
  const partnerAttributed =
    Boolean(input.partnerId) &&
    Boolean(input.partnerCodeId || input.affiliateLinkId);

  if (partnerAttributed) {
    const partnerId = input.partnerId!;

    const partner = await tx.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        commissionRate: true,
        commissionType: true,
        managerId: true,
        managerCommissionType: true,
        managerCommissionRate: true,
      },
    });

    if (!partner) {
      throw new Error(
        `Attributed Partner disappeared before commission snapshot: ${partnerId}`,
      );
    }

    let source: "partner_code" | "affiliate_link";
    let affiliateToken: string | null = null;

    // Preserve current priority: PartnerCode wins over AffiliateLink.
    if (input.partnerCodeId) {
      const code = await tx.partnerCode.findUnique({
        where: { id: input.partnerCodeId },
        select: {
          id: true,
          partnerId: true,
        },
      });

      if (!code || code.partnerId !== partnerId) {
        throw new Error(
          "PartnerCode attribution does not match attributed Partner",
        );
      }

      source = "partner_code";
    } else {
      const link = await tx.partnerAffiliateLink.findUnique({
        where: { id: input.affiliateLinkId! },
        select: {
          id: true,
          partnerId: true,
          token: true,
        },
      });

      if (!link || link.partnerId !== partnerId) {
        throw new Error(
          "PartnerAffiliateLink attribution does not match attributed Partner",
        );
      }

      source = "affiliate_link";
      affiliateToken = link.token;
    }

    const managerRate = Number(partner.managerCommissionRate ?? 0);

    snapshot.partner = {
      partnerId,
      source,
      affiliateToken,
      terms: {
        type: normalizeCommissionType(partner.commissionType),
        rate: Number(partner.commissionRate ?? 0),
        baseAmount: partnerCommissionBase,
      },

      ...(partner.managerId && managerRate > 0
        ? {
            manager: {
              managerId: partner.managerId,
              type: normalizePartnerManagerType(partner.managerCommissionType),
              rate: managerRate,
            },
          }
        : {}),
    };
  }

  // ── Legacy User-level agent ────────────────────────────────────────────────
  if (input.salesAgentUserId) {
    const agentUser = await tx.user.findUnique({
      where: { id: input.salesAgentUserId },
      select: {
        id: true,
        commissionRate: true,
        commissionType: true,
      },
    });

    if (!agentUser) {
      throw new Error(
        `Attributed legacy agent disappeared before commission snapshot: ${input.salesAgentUserId}`,
      );
    }

    snapshot.legacyAgent = {
      agentUserId: agentUser.id,
      terms: {
        type: normalizeCommissionType(agentUser.commissionType),
        rate: Number(agentUser.commissionRate ?? 0),
        baseAmount: customerPaidAmount,
      },
    };
  }

  // ── SalesAgent + ContractsManager ─────────────────────────────────────────
  if (input.salesAgentId) {
    const agent = await tx.salesAgent.findUnique({
      where: { id: input.salesAgentId },
      select: {
        id: true,
        referralCode: true,
        commissionRate: true,
        commissionType: true,
        managerId: true,
      },
    });

    if (!agent) {
      throw new Error(
        `Attributed SalesAgent disappeared before commission snapshot: ${input.salesAgentId}`,
      );
    }

    let manager:
      | {
          managerId: string;
          type: "percentage_of_agents" | "percentage_of_revenue" | "fixed";
          rate: number;
          revenueBase: number;
        }
      | undefined;

    if (agent.managerId) {
      const managerRecord = await tx.contractsManager.findUnique({
        where: { id: agent.managerId },
        select: {
          id: true,
          commissionType: true,
          commissionRate: true,
          isActive: true,
        },
      });

      // Preserve current business behavior:
      // inactive/missing/zero-rate manager earns nothing,
      // but the SalesAgent attribution itself remains valid.
      if (managerRecord?.isActive && Number(managerRecord.commissionRate) > 0) {
        manager = {
          managerId: managerRecord.id,
          type: normalizeSalesManagerType(managerRecord.commissionType),
          rate: Number(managerRecord.commissionRate),
          revenueBase: customerPaidAmount,
        };
      }
    }

    snapshot.salesAgent = {
      agentId: agent.id,
      referralCode: agent.referralCode,
      trackedSpendAmount: customerPaidAmount,
      terms: {
        type: normalizeCommissionType(agent.commissionType),
        rate: Number(agent.commissionRate),
        baseAmount: customerPaidAmount,
      },
      ...(manager ? { manager } : {}),
    };
  }

  // ── Staff referral ────────────────────────────────────────────────────────
  if (input.staffReferralLinkId) {
    const link = await tx.staffReferralLink.findUnique({
      where: { id: input.staffReferralLinkId },
      select: {
        id: true,
        token: true,
        userId: true,
        createdAt: true,
        user: {
          select: {
            commissionRate: true,
            commissionType: true,
          },
        },
      },
    });

    if (!link) {
      throw new Error(
        `Attributed StaffReferralLink disappeared before commission snapshot: ${input.staffReferralLinkId}`,
      );
    }

    const hasFullPolicyInput =
      input.customerUserId != null && input.staffReferralAsOfDate != null;

    const hasPartialPolicyInput =
      (input.customerUserId != null) !== (input.staffReferralAsOfDate != null);

    if (hasPartialPolicyInput) {
      throw new Error("STAFF_REFERRAL_POLICY_INPUT_INCOMPLETE");
    }

    /*
     * Immutable referral-engine cutover:
     *
     * - Before the first configured ReferralCommissionPolicy exists,
     *   StaffReferralLink keeps the pre-cutover legacy semantics.
     *
     * - A link created BEFORE the earliest policy effectiveFrom stays
     *   legacy permanently. This protects already-issued referral links
     *   without backfill or rewriting historical attribution.
     *
     * - A link created ON/AFTER the earliest policy effectiveFrom is
     *   owned exclusively by the new referral-policy engine.
     *   It must NOT silently fall back to legacy commissionRate/type.
     *
     * We intentionally do not filter the first policy by isActive:
     * disabling/replacing a later policy must never move the historical
     * cutover boundary.
     */
    let useNewReferralPolicy = false;

    if (hasFullPolicyInput) {
      const firstReferralPolicy = await tx.referralCommissionPolicy.findFirst({
        orderBy: {
          effectiveFrom: "asc",
        },
        select: {
          effectiveFrom: true,
        },
      });

      useNewReferralPolicy =
        firstReferralPolicy != null &&
        link.createdAt >= firstReferralPolicy.effectiveFrom;
    }

    if (useNewReferralPolicy) {
      const resolved = await resolveStaffReferralPolicyTx(tx, {
        customerUserId: input.customerUserId!,
        staffUserId: link.userId,
        asOfDate: input.staffReferralAsOfDate!,
      });

      snapshot.staff = {
        staffUserId: link.userId,
        referralLinkId: link.id,
        referralToken: link.token,
        terms: {
          type: "percentage",
          rate: resolved.rateBps / 100,
          baseAmount: customerPaidAmount,
        },
        policy: {
          classification: resolved.classification,
          previousMembershipId: resolved.previousMembershipId,
          previousMembershipEndDate:
            resolved.previousMembershipEndDate?.toISOString() ?? null,
          gapDays: resolved.gapDays,
          policyId: resolved.policyId,
          positionId: resolved.positionId,
          positionCode: resolved.positionCode,
          rateBps: resolved.rateBps,
        },
      };
    } else {
      // PRE-CUTOVER / legacy compatibility semantics.
      snapshot.staff = {
        staffUserId: link.userId,
        referralLinkId: link.id,
        referralToken: link.token,
        terms: {
          type: normalizeCommissionType(link.user.commissionType),
          rate: Number(link.user.commissionRate ?? 0),
          baseAmount: customerPaidAmount,
        },
      };
    }
  }

  // ── Trainer referral ──────────────────────────────────────────────────────
  if (input.trainerReferralLinkId) {
    const link = await tx.trainerReferralLink.findUnique({
      where: { id: input.trainerReferralLinkId },
      select: {
        id: true,
        token: true,
        userId: true,
        user: {
          select: {
            commissionRate: true,
            commissionType: true,
          },
        },
      },
    });

    if (!link) {
      throw new Error(
        `Attributed TrainerReferralLink disappeared before commission snapshot: ${input.trainerReferralLinkId}`,
      );
    }

    snapshot.trainer = {
      trainerUserId: link.userId,
      referralLinkId: link.id,
      referralToken: link.token,
      terms: {
        type: normalizeCommissionType(link.user.commissionType),
        rate: Number(link.user.commissionRate ?? 0),
        baseAmount: customerPaidAmount,
      },
    };
  }

  // ── Nutrition referral ────────────────────────────────────────────────────
  if (input.nutritionReferralLinkId) {
    const link = await tx.nutritionReferralLink.findUnique({
      where: { id: input.nutritionReferralLinkId },
      select: {
        id: true,
        token: true,
        userId: true,
        user: {
          select: {
            nutritionistProfile: {
              select: {
                commissionRate: true,
                commissionType: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      throw new Error(
        `Attributed NutritionReferralLink disappeared before commission snapshot: ${input.nutritionReferralLinkId}`,
      );
    }

    if (!link.user.nutritionistProfile) {
      throw new Error(
        `Attributed nutritionist has no NutritionistProfile: ${link.userId}`,
      );
    }

    snapshot.nutrition = {
      nutritionistUserId: link.userId,
      referralLinkId: link.id,
      referralToken: link.token,
      terms: {
        type: normalizeCommissionType(
          link.user.nutritionistProfile.commissionType,
        ),
        rate: Number(link.user.nutritionistProfile.commissionRate ?? 0),
        baseAmount: customerPaidAmount,
      },
    };
  }

  return serializeMembershipCommissionSnapshot(snapshot);
}
