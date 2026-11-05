import type { Prisma } from "@prisma/client";
import {
  calculateCommission,
  parseMembershipCommissionSnapshot,
  roundCommissionMoney,
  type MembershipCommissionSnapshotV1,
} from "./membership-commission-contract";

type Tx = Prisma.TransactionClient;

export type MembershipCommissionAccrualResult = {
  alreadyCompleted: boolean;
  skipped: boolean;
  reason?: "missing_snapshot";
  accruedAt?: Date;
};

function normalizeRef(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function assertSnapshotMatchesMembership(
  membership: {
    partnerId: string | null;
    partnerCodeId: string | null;
    affiliateLinkId: string | null;
    salesAgentUserId: string | null;
    salesAgentId: string | null;
    staffReferralLinkId: string | null;
    trainerReferralLinkId: string | null;
    nutritionReferralLinkId: string | null;
  },
  snapshot: MembershipCommissionSnapshotV1,
): void {
  const partnerAttributed =
    Boolean(membership.partnerId) &&
    Boolean(membership.partnerCodeId || membership.affiliateLinkId);

  if (
    partnerAttributed &&
    snapshot.partner?.partnerId !== membership.partnerId
  ) {
    throw new Error(
      "commissionSnapshot partner attribution does not match UserMembership",
    );
  }

  if (
    snapshot.legacyAgent &&
    snapshot.legacyAgent.agentUserId !== membership.salesAgentUserId
  ) {
    throw new Error(
      "commissionSnapshot legacy agent does not match UserMembership",
    );
  }

  if (
    snapshot.salesAgent &&
    snapshot.salesAgent.agentId !== membership.salesAgentId
  ) {
    throw new Error(
      "commissionSnapshot sales agent does not match UserMembership",
    );
  }

  if (
    snapshot.staff &&
    snapshot.staff.referralLinkId !== membership.staffReferralLinkId
  ) {
    throw new Error(
      "commissionSnapshot staff referral does not match UserMembership",
    );
  }

  if (
    snapshot.trainer &&
    snapshot.trainer.referralLinkId !== membership.trainerReferralLinkId
  ) {
    throw new Error(
      "commissionSnapshot trainer referral does not match UserMembership",
    );
  }

  if (
    snapshot.nutrition &&
    snapshot.nutrition.referralLinkId !== membership.nutritionReferralLinkId
  ) {
    throw new Error(
      "commissionSnapshot nutrition referral does not match UserMembership",
    );
  }
}

/**
 * Authoritative membership-related commission accrual.
 *
 * Guarantees:
 * - must run inside caller transaction
 * - row-locks UserMembership
 * - row-locks User before referral consumption/tracking
 * - reads immutable commissionSnapshot only
 * - never re-reads mutable commission configuration
 * - DB unique constraints + commissionAccruedAt provide exact-once behavior
 * - consumes only pending refs that still match this membership's frozen referral
 *
 * Legacy memberships without commissionSnapshot are intentionally NOT mutated.
 * A compatibility strategy for pre-cutover pending memberships will be added
 * explicitly when callers are wired.
 */
export async function accrueMembershipCommissionsTx(
  tx: Tx,
  userMembershipId: string,
): Promise<MembershipCommissionAccrualResult> {
  await tx.$queryRaw`
    SELECT \`id\`
    FROM \`UserMembership\`
    WHERE \`id\` = ${userMembershipId}
    FOR UPDATE
  `;

  const membership = await tx.userMembership.findUnique({
    where: { id: userMembershipId },
    select: {
      id: true,
      userId: true,
      commissionSnapshot: true,
      commissionAccruedAt: true,
      activatedAt: true,

      partnerId: true,
      partnerCodeId: true,
      affiliateLinkId: true,
      salesAgentUserId: true,
      salesAgentId: true,
      staffReferralLinkId: true,
      trainerReferralLinkId: true,
      nutritionReferralLinkId: true,
    },
  });

  if (!membership) {
    throw new Error(`UserMembership not found: ${userMembershipId}`);
  }

  if (membership.commissionAccruedAt) {
    return {
      alreadyCompleted: true,
      skipped: false,
      accruedAt: membership.commissionAccruedAt,
    };
  }

  // Existing pre-cutover memberships intentionally stay untouched here.
  if (!membership.commissionSnapshot) {
    return {
      alreadyCompleted: false,
      skipped: true,
      reason: "missing_snapshot",
    };
  }

  const snapshot = parseMembershipCommissionSnapshot(
    membership.commissionSnapshot,
  );

  assertSnapshotMatchesMembership(membership, snapshot);

  // Serialize all referral state for the same user as part of this accrual.
  await tx.$queryRaw`
    SELECT \`id\`
    FROM \`User\`
    WHERE \`id\` = ${membership.userId}
    FOR UPDATE
  `;

  // ── Partner commission ──────────────────────────────────────────────
  let partnerCommissionId: string | null = null;
  let partnerCommissionAmount = 0;

  if (snapshot.partner) {
    partnerCommissionAmount = calculateCommission(snapshot.partner.terms);

    if (partnerCommissionAmount > 0) {
      const commission = await tx.partnerCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          partnerId: snapshot.partner.partnerId,
          userMembershipId,
          amount: partnerCommissionAmount,
        },
        select: { id: true, amount: true },
      });

      partnerCommissionId = commission.id;
      partnerCommissionAmount = Number(commission.amount);
    }

    if (
      partnerCommissionId &&
      partnerCommissionAmount > 0 &&
      snapshot.partner.manager
    ) {
      const manager = snapshot.partner.manager;

      const managerAmount =
        manager.type === "percentage_of_partner"
          ? roundCommissionMoney(
              (partnerCommissionAmount * manager.rate) / 100,
            )
          : roundCommissionMoney(manager.rate);

      if (managerAmount > 0) {
        await tx.managerPartnerCommission.upsert({
          where: { partnerCommissionId },
          update: {},
          create: {
            managerId: manager.managerId,
            partnerCommissionId,
            userMembershipId,
            amount: managerAmount,
          },
        });
      }
    }
  }

  // ── Legacy User-level agent commission ──────────────────────────────
  if (snapshot.legacyAgent) {
    const amount = calculateCommission(snapshot.legacyAgent.terms);

    if (amount > 0) {
      await tx.agentCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          agentUserId: snapshot.legacyAgent.agentUserId,
          userMembershipId,
          amount,
        },
      });
    }
  }

  // ── SalesAgent + ContractsManager commission ────────────────────────
  if (snapshot.salesAgent) {
    const salesAgentAmount = calculateCommission(snapshot.salesAgent.terms);

    let agentCommissionId: string | null = null;

    if (salesAgentAmount > 0) {
      const agentCommission = await tx.salesAgentCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          agentId: snapshot.salesAgent.agentId,
          userMembershipId,
          amount: salesAgentAmount,
        },
        select: { id: true },
      });

      agentCommissionId = agentCommission.id;
    }

    if (
      agentCommissionId &&
      salesAgentAmount > 0 &&
      snapshot.salesAgent.manager
    ) {
      const manager = snapshot.salesAgent.manager;

      let managerAmount = 0;

      if (manager.type === "percentage_of_agents") {
        managerAmount = roundCommissionMoney(
          (salesAgentAmount * manager.rate) / 100,
        );
      } else if (manager.type === "percentage_of_revenue") {
        managerAmount = roundCommissionMoney(
          (manager.revenueBase * manager.rate) / 100,
        );
      } else {
        managerAmount = roundCommissionMoney(manager.rate);
      }

      if (managerAmount > 0) {
        await tx.managerCommission.upsert({
          where: { agentCommissionId },
          update: {},
          create: {
            managerId: manager.managerId,
            agentCommissionId,
            userMembershipId,
            amount: managerAmount,
          },
        });
      }
    }

    // Preserve current SalesAgent referral-conversion semantics:
    // one User has one SalesAgentReferral; subsequent purchases increase totalSpent.
    const referral = await tx.salesAgentReferral.findUnique({
      where: { userId: membership.userId },
    });

    const spent = snapshot.salesAgent.trackedSpendAmount;

    if (!referral) {
      await tx.salesAgentReferral.create({
        data: {
          agentId: snapshot.salesAgent.agentId,
          userId: membership.userId,
          convertedAt: new Date(),
          totalSpent: spent,
        },
      });
    } else {
      await tx.salesAgentReferral.update({
        where: { userId: membership.userId },
        data: {
          ...(referral.convertedAt ? {} : { convertedAt: new Date() }),
          totalSpent: { increment: spent },
        },
      });
    }
  }

  // ── Staff referral commission ───────────────────────────────────────
  if (snapshot.staff) {
    const amount = calculateCommission(snapshot.staff.terms);
    const policy = snapshot.staff.policy;

    /*
     * Referral payroll uses the immutable economic activation instant,
     * never StaffCommission.createdAt / reconciliation processing time.
     */
    if (!membership.activatedAt) {
      throw new Error(
        "STAFF_COMMISSION_REQUIRES_MEMBERSHIP_ACTIVATION_DATE",
      );
    }

    /*
     * New policy snapshots must create an auditable StaffCommission row
     * even when the resulting commission is zero.
     *
     * Legacy snapshots preserve the historical behavior:
     * zero-value legacy commissions are not materialized.
     */
    if (amount > 0 || policy) {
      const baseMinor = Math.round(
        Number(snapshot.staff.terms.baseAmount) * 100,
      );

      const amountMinor = Math.round(amount * 100);

      await tx.staffCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          staffUserId: snapshot.staff.staffUserId,
          staffReferralLinkId: snapshot.staff.referralLinkId,
          userMembershipId,
          amount,
          earnedAt: membership.activatedAt,

          // A valid referral with a policy result of zero is auditable,
          // but it is not a financial liability and cannot be settled.
          status:
            policy && amount <= 0
              ? "ineligible"
              : "earned",

          ...(policy
            ? {
                customerClassificationSnapshot:
                  policy.classification,

                previousMembershipIdSnapshot:
                  policy.previousMembershipId,

                previousMembershipEndDateSnapshot:
                  policy.previousMembershipEndDate
                    ? new Date(policy.previousMembershipEndDate)
                    : null,

                gapDaysSnapshot:
                  policy.gapDays,

                referralPolicyIdSnapshot:
                  policy.policyId,

                positionIdSnapshot:
                  policy.positionId,

                positionCodeSnapshot:
                  policy.positionCode,

                commissionRateBpsSnapshot:
                  policy.rateBps,

                commissionBaseMinorSnapshot:
                  baseMinor,

                commissionAmountMinorSnapshot:
                  amountMinor,
              }
            : {}),
        },
      });

      /*
       * Preserve historical clickCount semantics:
       * it counts commission-bearing conversions only.
       *
       * A valid 0% referral is stored in StaffCommission,
       * but does not change this legacy counter.
       */
      if (amount > 0) {
        await tx.staffReferralLink.update({
          where: { id: snapshot.staff.referralLinkId },
          data: { clickCount: { increment: 1 } },
        });
      }
    }
  }

  // ── Trainer referral commission ─────────────────────────────────────
  if (snapshot.trainer) {
    const amount = calculateCommission(snapshot.trainer.terms);

    if (amount > 0) {
      await tx.trainerCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          trainerUserId: snapshot.trainer.trainerUserId,
          trainerReferralLinkId: snapshot.trainer.referralLinkId,
          userMembershipId,
          amount,
        },
      });

      // Historical semantics: successful commission-bearing subscriptions.
      await tx.trainerReferralLink.update({
        where: { id: snapshot.trainer.referralLinkId },
        data: { clickCount: { increment: 1 } },
      });
    }
  }

  // ── Nutrition referral commission for MEMBERSHIP only ───────────────
  // Nutrition-session commission is a separate business action.
  if (snapshot.nutrition) {
    const amount = calculateCommission(snapshot.nutrition.terms);

    if (amount > 0) {
      await tx.nutritionCommission.upsert({
        where: { userMembershipId },
        update: {},
        create: {
          nutritionistUserId: snapshot.nutrition.nutritionistUserId,
          nutritionReferralLinkId: snapshot.nutrition.referralLinkId,
          userMembershipId,
          amount,
        },
      });

      // Historical semantics: successful commission-bearing subscriptions.
      await tx.nutritionReferralLink.update({
        where: { id: snapshot.nutrition.referralLinkId },
        data: { clickCount: { increment: 1 } },
      });
    }
  }

  // ── Consume ONLY matching pending refs ──────────────────────────────
  const currentRefs = await tx.user.findUnique({
    where: { id: membership.userId },
    select: {
      pendingPartnerRef: true,
      pendingAgentRef: true,
      pendingStaffRef: true,
      pendingTrainerRef: true,
      pendingNutritionRef: true,
    },
  });

  const consumed: {
    pendingPartnerRef?: null;
    pendingAgentRef?: null;
    pendingStaffRef?: null;
    pendingTrainerRef?: null;
    pendingNutritionRef?: null;
  } = {};

  if (
    snapshot.partner?.affiliateToken &&
    normalizeRef(currentRefs?.pendingPartnerRef) ===
      normalizeRef(snapshot.partner.affiliateToken)
  ) {
    consumed.pendingPartnerRef = null;
  }

  if (
    snapshot.salesAgent?.referralCode &&
    normalizeRef(currentRefs?.pendingAgentRef) ===
      normalizeRef(snapshot.salesAgent.referralCode)
  ) {
    consumed.pendingAgentRef = null;
  }

  if (
    snapshot.staff?.referralToken &&
    normalizeRef(currentRefs?.pendingStaffRef) ===
      normalizeRef(snapshot.staff.referralToken)
  ) {
    consumed.pendingStaffRef = null;
  }

  if (
    snapshot.trainer?.referralToken &&
    normalizeRef(currentRefs?.pendingTrainerRef) ===
      normalizeRef(snapshot.trainer.referralToken)
  ) {
    consumed.pendingTrainerRef = null;
  }

  if (
    snapshot.nutrition?.referralToken &&
    normalizeRef(currentRefs?.pendingNutritionRef) ===
      normalizeRef(snapshot.nutrition.referralToken)
  ) {
    consumed.pendingNutritionRef = null;
  }

  if (Object.keys(consumed).length > 0) {
    await tx.user.update({
      where: { id: membership.userId },
      data: consumed,
    });
  }

  // MUST remain the final DB mutation of this accrual service.
  const accruedAt = new Date();

  await tx.userMembership.update({
    where: { id: userMembershipId },
    data: { commissionAccruedAt: accruedAt },
  });

  return {
    alreadyCompleted: false,
    skipped: false,
    accruedAt,
  };
}
