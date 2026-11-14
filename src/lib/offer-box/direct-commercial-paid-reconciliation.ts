import type { Prisma } from "@prisma/client";

import {
  readCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

function readRecord(
  value: string | null,
): Record<string, unknown> {
  if (!value) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_METADATA_REQUIRED",
    );
  }

  const parsed: unknown = JSON.parse(value);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_METADATA_INVALID",
    );
  }

  return parsed as Record<string, unknown>;
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function cents(amount: number): number {
  const result = Math.round(amount * 100);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(result) ||
    Math.abs(amount * 100 - result) > 0.000001
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_AMOUNT_INVALID",
    );
  }

  return result;
}

/**
 * Internal continuation of central Paymob reconciliation.
 *
 * The caller has already verified the Paymob Order
 * and has locked the purchase row.
 *
 * Local paid status is not sufficient by itself.
 *
 * Capture the confirmed collection without making the
 * product redeemable through the deferred Offer Box route.
 *
 * Activation and all economic side effects remain separate.
 */
export async function reconcilePaidDirectCommercialPurchaseTx(
  tx: Prisma.TransactionClient,
  input: {
    purchaseId: string;
    transactionId: string;
    paymobOrderPaidVerified: boolean;
  },
) {
  if (input.paymobOrderPaidVerified !== true) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMOB_PAID_PROOF_REQUIRED",
    );
  }

  const purchase =
    await tx.offerBoxPurchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });

  const source = readCommercialPurchaseSource(purchase);

  if (
    source.commercialKind !== "package" &&
    source.commercialKind !== "direct_offer"
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_SOURCE_REQUIRED",
    );
  }

  if (
    purchase.paymentTransactionId !==
      input.transactionId ||
    purchase.redeemedUserMembershipId !== null
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_PURCHASE_MISMATCH",
    );
  }

  const payments = await tx.$queryRaw<
    Array<{
      id: string;
      userId: string;
      purpose: string;
      businessUnit: string;
      provider: string;
      status: string;
      membershipId: string | null;
      orderId: string | null;
      offerId: string | null;
      amount: number;
      currency: string;
      paidAt: Date | null;
      metadata: string | null;
      expiresAt: Date | null;
    }>
  >`
    SELECT
      id, userId, purpose, businessUnit,
      provider, status, membershipId, orderId,
      offerId, amount, currency, paidAt,
      metadata, expiresAt
    FROM PaymentTransaction
    WHERE id = ${input.transactionId}
    FOR UPDATE
  `;

  const payment = payments[0];

  if (
    !payment ||
    payment.userId !== purchase.userId ||
    payment.purpose !== "offer_box" ||
    payment.businessUnit !== "club" ||
    payment.provider !== "paymob" ||
    payment.status !== "paid" ||
    payment.membershipId !== null ||
    payment.orderId !== null ||
    payment.currency !== "EGP" ||
    purchase.currency !== "EGP" ||
    !(payment.paidAt instanceof Date) ||
    !Number.isFinite(payment.paidAt.getTime()) ||
    cents(payment.amount) !== cents(purchase.priceSnapshot)
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_PAYMENT_MISMATCH",
    );
  }

  const metadata = readRecord(payment.metadata);
  const snapshot = readRecord(purchase.offerSnapshot);

  const frozenOffer = asRecord(snapshot.offer);
  const frozenTemplate =
    asRecord(snapshot.membershipTemplate);
  const frozenCommercial =
    asRecord(snapshot.commercial);
  const directActivation =
    asRecord(snapshot.directActivation);

  if (
    snapshot.version !== 1 ||
    !frozenOffer ||
    !frozenTemplate ||
    !frozenCommercial ||
    directActivation?.version !== 1 ||
    metadata.offerBoxPurchaseId !== purchase.id ||
    metadata.commercialKind !== source.commercialKind ||
    metadata.catalogMembershipId !==
      source.catalogMembershipId ||
    metadata.offerBoxSnapshotVersion !==
      purchase.snapshotVersion ||
    frozenTemplate.sourceMembershipId !==
      source.catalogMembershipId ||
    frozenOffer.id !== payment.offerId ||
    (
      source.offerId !== null &&
      source.offerId !== payment.offerId
    ) ||
    (
      source.commercialKind === "package" &&
      frozenOffer.id !== null
    ) ||
    (
      source.commercialKind === "direct_offer" &&
      (
        typeof frozenOffer.id !== "string" ||
        !frozenOffer.id.trim()
      )
    ) ||
    frozenCommercial.currency !== "EGP" ||
    typeof frozenCommercial.finalPrice !== "number" ||
    cents(frozenCommercial.finalPrice) !==
      cents(payment.amount)
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_SOURCE_MISMATCH",
    );
  }

  if (purchase.status === "redeemed") {
    if (
      !purchase.paidAt ||
      purchase.paidAt.getTime() !== payment.paidAt.getTime() ||
      !purchase.redeemedAt
    ) {
      throw new Error("DIRECT_COMMERCIAL_REDEEMED_REPLAY_MISMATCH");
    }

    return {
      alreadyReconciled: true,
      status: purchase.status,
    };
  }

  if (
    purchase.status === "paid_activation_pending" ||
    purchase.status === "paid_review"
  ) {
    if (
      !purchase.paidAt ||
      purchase.paidAt.getTime() !==
        payment.paidAt.getTime() ||
      purchase.redeemedAt !== null
    ) {
      throw new Error(
        "DIRECT_COMMERCIAL_PAID_REPLAY_MISMATCH",
      );
    }

    return {
      alreadyReconciled: true,
      status: purchase.status,
    };
  }

  if (
    purchase.status !== "pending_payment" &&
    purchase.status !== "cancelled"
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_STATE_REQUIRES_REVIEW",
    );
  }

  if (
    purchase.paidAt !== null ||
    purchase.redeemedAt !== null
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_STATE_MISMATCH",
    );
  }

  /*
   * Local confirmation time is not proof of when
   * the remote charge was actually completed.
   *
   * If the local hold has elapsed, conservatively
   * retain the collection for explicit review.
   *
   * Never recreate released capacity here.
   */

  const hold = purchase.holdExpiresAt;

  const requiresReview =
    purchase.status === "cancelled" ||
    !(hold instanceof Date) ||
    !Number.isFinite(hold.getTime()) ||
    hold.getTime() <= Date.now() ||
    hold.getTime() <= payment.paidAt.getTime() ||
    !payment.expiresAt ||
    payment.expiresAt.getTime() !== hold.getTime();

  const nextStatus = requiresReview
    ? "paid_review"
    : "paid_activation_pending";

  const updated =
    await tx.offerBoxPurchase.updateMany({
      where: {
        id: purchase.id,
        userId: purchase.userId,
        status: purchase.status,
        paymentTransactionId: payment.id,
        paidAt: null,
        redeemedAt: null,
        redeemedUserMembershipId: null,
      },
      data: {
        status: nextStatus,
        paidAt: payment.paidAt,
      },
    });

  if (updated.count !== 1) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAID_RECONCILIATION_RACE",
    );
  }

  return {
    alreadyReconciled: false,
    status: nextStatus,
  };
}
