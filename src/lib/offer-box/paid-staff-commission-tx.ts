import type { Prisma } from "@prisma/client";
import type { preparePaidOfferBoxStaffCommission } from
  "./paid-staff-commission";

type PreparedCommission = NonNullable<
  ReturnType<typeof preparePaidOfferBoxStaffCommission>
>;

/**
 * Called only inside a purchase-row-locked transaction AFTER authoritative
 * Paymob proof and purchase/payment identity checks.
 *
 * The unique offerBoxPurchaseId constraint is the final exact-once guard.
 * Never call this function as a substitute for provider verification.
 */
export async function accruePreparedOfferBoxStaffCommissionTx(
  tx: Prisma.TransactionClient,
  prepared: PreparedCommission | null,
): Promise<{ created: boolean; commissionId: string | null }> {
  if (!prepared) {
    return { created: false, commissionId: null };
  }

  const existing = await tx.staffCommission.findUnique({
    where: { offerBoxPurchaseId: prepared.offerBoxPurchaseId },
    select: {
      id: true,
      staffUserId: true,
      staffReferralLinkId: true,
      userMembershipId: true,
      amount: true,
      status: true,
      earnedAt: true,
    },
  });

  if (existing) {
    if (
      existing.staffUserId !== prepared.staffUserId ||
      existing.staffReferralLinkId !== prepared.staffReferralLinkId ||
      existing.userMembershipId !== null ||
      Math.abs(existing.amount - prepared.amount) > 0.000001 ||
      !(
        existing.status === prepared.status ||
        (
          prepared.status === "earned" &&
          existing.status === "settled"
        )
      ) ||
      existing.earnedAt?.getTime() !== prepared.earnedAt.getTime()
    ) {
      throw new Error("OFFER_BOX_COMMISSION_EXISTING_ROW_MISMATCH");
    }

    return { created: false, commissionId: existing.id };
  }

  const created = await tx.staffCommission.create({
    data: prepared,
    select: { id: true },
  });

  // Preserve existing clickCount semantics: count only a newly
  // recorded positive-amount commission.
  if (prepared.amount > 0) {
    await tx.staffReferralLink.update({
      where: { id: prepared.staffReferralLinkId },
      data: { clickCount: { increment: 1 } },
    });
  }

  return { created: true, commissionId: created.id };
}
