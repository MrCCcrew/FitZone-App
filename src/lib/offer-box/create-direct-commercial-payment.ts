import type { Prisma } from "@prisma/client";

import {
  bindDirectCommercialPaymentTx,
} from "@/lib/offer-box/direct-commercial-payment-binding";

import {
  readCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

import {
  lockMembershipLifecycleUserTx,
} from "@/lib/membership-lifecycle-lock";

type CreateDirectCommercialPaymentInput = {
  userId: string;
  purchaseId: string;
  serverNow: Date;
};

/**
 * Create the local payment owner before provider I/O.
 *
 * Must execute inside a transaction whose caller
 * propagates every error and rolls back on failure.
 *
 * A returned existing payment is not authorization
 * to create another Paymob intention.
 *
 * No checkout URL, paid proof, commission, or
 * entitlement is created by this function.
 */
export async function createDirectCommercialPaymentTx(
  tx: Prisma.TransactionClient,
  input: CreateDirectCommercialPaymentInput,
) {
  if (
    !input.userId ||
    !input.purchaseId ||
    !(input.serverNow instanceof Date) ||
    !Number.isFinite(input.serverNow.getTime())
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_INVALID_PAYMENT_CREATION",
    );
  }

  await lockMembershipLifecycleUserTx(
    tx,
    input.userId,
  );

  const locked = await tx.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id
    FROM OfferBoxPurchase
    WHERE id = ${input.purchaseId}
      AND userId = ${input.userId}
    FOR UPDATE
  `;

  if (locked.length !== 1) {
    throw new Error(
      "DIRECT_COMMERCIAL_PURCHASE_OWNER_MISMATCH",
    );
  }

  const purchase =
    await tx.offerBoxPurchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });

  const source =
    readCommercialPurchaseSource(purchase);

  if (
    source.commercialKind !== "package" &&
    source.commercialKind !== "direct_offer"
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_SOURCE_REQUIRED",
    );
  }

  if (
    purchase.status !== "pending_payment" ||
    purchase.paidAt !== null ||
    purchase.redeemedAt !== null ||
    purchase.redeemedUserMembershipId !== null
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PURCHASE_NOT_PENDING",
    );
  }

  if (
    !purchase.holdExpiresAt ||
    purchase.holdExpiresAt <= input.serverNow
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_HOLD_EXPIRED",
    );
  }

  const cents = Math.round(
    purchase.priceSnapshot * 100,
  );

  if (
    purchase.currency !== "EGP" ||
    purchase.paymentMethod !== "paymob" ||
    !Number.isFinite(purchase.priceSnapshot) ||
    purchase.priceSnapshot <= 0 ||
    !Number.isSafeInteger(cents) ||
    Math.abs(
      purchase.priceSnapshot * 100 - cents,
    ) > 0.000001
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_INVALID_PAYMENT_AMOUNT",
    );
  }

  const existingId =
    purchase.paymentTransactionId;

  if (existingId) {
    // The accepted binding contract validates
    // owner, source, amount, status and currency.
    await bindDirectCommercialPaymentTx(
      tx,
      {
        ...input,
        transactionId: existingId,
      },
    );

    const existing =
      await tx.paymentTransaction.findUniqueOrThrow({
        where: { id: existingId },
      });

    if (
      !existing.expiresAt ||
      existing.expiresAt.getTime() !==
        purchase.holdExpiresAt.getTime()
    ) {
      throw new Error(
        "DIRECT_COMMERCIAL_PAYMENT_HOLD_MISMATCH",
      );
    }

    return {
      purchaseId: purchase.id,
      transactionId: existing.id,
      created: false,
      holdExpiresAt: purchase.holdExpiresAt,
    };
  }

  // Preserve the original economic owner.
  // No provider call has occurred at this point.
  const payment =
    await tx.paymentTransaction.create({
      data: {
        userId: purchase.userId,
        offerId: source.offerId,
        membershipId: null,
        orderId: null,
        purpose: "offer_box",
        businessUnit: "club",
        provider: "paymob",
        amount: purchase.priceSnapshot,
        currency: "EGP",
        status: "pending",
        paymentMethod: "paymob",
        expiresAt: purchase.holdExpiresAt,
        metadata: JSON.stringify({
          offerBoxPurchaseId: purchase.id,
          commercialKind: source.commercialKind,
          catalogMembershipId:
            source.catalogMembershipId,
          offerBoxSnapshotVersion:
            purchase.snapshotVersion,
        }),
      },
    });

  await bindDirectCommercialPaymentTx(
    tx,
    {
      ...input,
      transactionId: payment.id,
    },
  );

  return {
    purchaseId: purchase.id,
    transactionId: payment.id,
    created: true,
    holdExpiresAt: purchase.holdExpiresAt,
  };
}
