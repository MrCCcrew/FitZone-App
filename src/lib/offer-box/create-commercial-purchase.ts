import { readDirectCommercialConsideration } from "@/lib/offer-box/direct-commercial-consideration";
import type { Prisma } from "@prisma/client";

import {
  createCommercialPurchaseSource,
  type CommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

type CreatePendingCommercialPurchaseInput = {
  purchaseId: string;
  userId: string;
  source: CommercialPurchaseSource;
  snapshot: object;
  amount: number;
  holdExpiresAt: Date;
};

/**
 * Persist a server-resolved commercial purchase.
 *
 * The caller owns catalog validation, customer ownership,
 * lifecycle locking and any required offer capacity claim.
 *
 * The supplied snapshot must already contain the verified
 * purchase-time terms. This is not payment evidence.
 *
 * No UserMembership, entitlement or Booking is created here.
 */
export async function createPendingCommercialPurchaseTx(
  tx: Prisma.TransactionClient,
  input: CreatePendingCommercialPurchaseInput,
): Promise<void> {
  const source = createCommercialPurchaseSource(
    input.source,
  );

  if (
    !input.purchaseId ||
    !input.userId ||
    !Number.isFinite(input.amount) ||
    input.amount < 0 ||
    (input.amount === 0 && (
      !["package", "direct_offer"].includes(source.commercialKind) ||
      !readDirectCommercialConsideration(input.snapshot, 0)
    )) ||
    !(input.holdExpiresAt instanceof Date) ||
    !Number.isFinite(input.holdExpiresAt.getTime())
  ) {
    throw new Error(
      "INVALID_PENDING_COMMERCIAL_PURCHASE",
    );
  }

  const inserted = await tx.$executeRaw`
    INSERT INTO OfferBoxPurchase (
      id,
      userId,
      offerId,
      commercialKind,
      catalogMembershipId,
      status,
      offerSnapshot,
      snapshotVersion,
      priceSnapshot,
      currency,
      paymentMethod,
      holdExpiresAt,
      paymentTransactionId,
      createdAt,
      updatedAt
    )
    VALUES (
      ${input.purchaseId},
      ${input.userId},
      ${source.offerId},
      ${source.commercialKind},
      ${source.catalogMembershipId},
      'pending_payment',
      ${JSON.stringify(input.snapshot)},
      1,
      ${input.amount},
      'EGP',
      ${input.amount === 0 ? 'internal' : 'paymob'},
      ${input.holdExpiresAt},
      NULL,
      CURRENT_TIMESTAMP(3),
      CURRENT_TIMESTAMP(3)
    )
  `;

  if (Number(inserted) !== 1) {
    throw new Error(
      "COMMERCIAL_PURCHASE_INSERT_FAILED",
    );
  }
}
