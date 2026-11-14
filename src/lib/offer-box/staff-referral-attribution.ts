import type { Prisma } from "@prisma/client";

/**
 * Resolve the same pending staff referral source used by subscription
 * checkout, inside the purchase snapshot transaction.
 *
 * Only the active link ID is frozen here. Commission eligibility/rate
 * are calculated by the existing policy snapshot builder.
 */
export async function resolveOfferBoxStaffReferralLinkTx(
  tx: Prisma.TransactionClient,
  customerUserId: string,
): Promise<string | null> {
  if (!customerUserId.trim()) {
    throw new Error("OFFER_BOX_REFERRAL_CUSTOMER_REQUIRED");
  }

  const customer = await tx.user.findUnique({
    where: { id: customerUserId },
    select: { pendingStaffRef: true },
  });

  if (!customer) {
    throw new Error("OFFER_BOX_REFERRAL_CUSTOMER_NOT_FOUND");
  }

  const token = (customer.pendingStaffRef ?? "")
    .trim()
    .toUpperCase();

  if (!token) {
    return null;
  }

  const link = await tx.staffReferralLink.findUnique({
    where: { token },
    select: { id: true, isActive: true },
  });

  return link?.isActive ? link.id : null;
}
