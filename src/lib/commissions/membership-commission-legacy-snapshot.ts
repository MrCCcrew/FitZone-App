import type { Prisma } from "@prisma/client";

import { buildMembershipCommissionSnapshotTx } from "./membership-commission-snapshot-builder";

type Tx = Prisma.TransactionClient;

export type EnsureLegacyCommissionSnapshotResult = {
  created: boolean;
  alreadyPresent: boolean;
  commissionSnapshot: string;
};

/**
 * Compatibility bridge for PRE-CUTOVER memberships only.
 *
 * Historical Paymob reconciliation used:
 *
 * Partner base:
 *   Membership.priceAfter > 0
 *     ? Membership.priceAfter
 *     : Membership.price > 0
 *       ? Membership.price
 *       : UserMembership.paymentAmount
 *
 * All other commission bases:
 *   UserMembership.paymentAmount
 *
 * This function freezes those historical semantics exactly once.
 *
 * IMPORTANT:
 * - NO backfill.
 * - NO commission accrual.
 * - NO referral consumption.
 * - NO historical mutation except storing the missing immutable snapshot
 *   at the moment this legacy membership actually reaches reconciliation.
 */
export async function ensureLegacyMembershipCommissionSnapshotTx(
  tx: Tx,
  userMembershipId: string,
): Promise<EnsureLegacyCommissionSnapshotResult> {
  /*
   * Lock the membership row too. Payment reconciliation already locks the
   * PaymentTransaction, but this makes snapshot creation safe even if another
   * payment/recovery path somehow targets the same UserMembership.
   */
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
      commissionSnapshot: true,
      paymentAmount: true,

      partnerId: true,
      partnerCodeId: true,
      affiliateLinkId: true,

      salesAgentUserId: true,
      salesAgentId: true,

      staffReferralLinkId: true,
      trainerReferralLinkId: true,
      nutritionReferralLinkId: true,

      membership: {
        select: {
          price: true,
          priceAfter: true,
        },
      },
    },
  });

  if (!membership) {
    throw new Error(
      `Legacy commission snapshot membership not found: ${userMembershipId}`,
    );
  }

  if (membership.commissionSnapshot) {
    return {
      created: false,
      alreadyPresent: true,
      commissionSnapshot: membership.commissionSnapshot,
    };
  }

  /*
   * Preserve the EXACT historical Paymob partner-base rule.
   * Do not substitute snapshotFinalPrice or current payment metadata here.
   */
  const listedPrice =
    membership.membership?.priceAfter &&
    membership.membership.priceAfter > 0
      ? membership.membership.priceAfter
      : membership.membership?.price ?? 0;

  const paidAmount = Math.max(
    0,
    Number(membership.paymentAmount ?? 0),
  );

  const partnerCommissionBase =
    listedPrice > 0 ? listedPrice : paidAmount;

  const commissionSnapshot =
    await buildMembershipCommissionSnapshotTx(tx, {
      partnerId: membership.partnerId,
      partnerCodeId: membership.partnerCodeId,
      affiliateLinkId: membership.affiliateLinkId,

      salesAgentUserId: membership.salesAgentUserId,
      salesAgentId: membership.salesAgentId,

      staffReferralLinkId: membership.staffReferralLinkId,
      trainerReferralLinkId: membership.trainerReferralLinkId,
      nutritionReferralLinkId: membership.nutritionReferralLinkId,

      partnerCommissionBase,
      customerPaidAmount: paidAmount,
    });

  await tx.userMembership.update({
    where: { id: userMembershipId },
    data: {
      commissionSnapshot,
    },
  });

  return {
    created: true,
    alreadyPresent: false,
    commissionSnapshot,
  };
}
