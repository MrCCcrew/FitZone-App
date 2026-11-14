import type { Prisma } from "@prisma/client";

import {
  readCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

import {
  lockMembershipLifecycleUserTx,
} from "@/lib/membership-lifecycle-lock";

type BindDirectCommercialPaymentInput = {
  userId: string;
  purchaseId: string;
  transactionId: string;
  serverNow: Date;
};

function toCents(value: number): number {
  const cents = Math.round(value * 100);

  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isSafeInteger(cents) ||
    Math.abs(value * 100 - cents) > 0.000001
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_INVALID_PAYMENT_AMOUNT",
    );
  }

  return cents;
}

function parseMetadata(value: string | null) {
  if (!value) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_METADATA_REQUIRED",
    );
  }

  const parsed: unknown = JSON.parse(value);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_INVALID_PAYMENT_METADATA",
    );
  }

  return parsed as Record<string, unknown>;
}

/**
 * Bind an existing pending Paymob payment to
 * its independent direct commercial purchase.
 *
 * Both records must have been created by
 * trusted server-side checkout code.
 *
 * Lock order: customer, purchase, payment.
 * The caller must not hold these in reverse order.
 *
 * This function does not prove payment,
 * accrue commission, or activate entitlement.
 */
export async function bindDirectCommercialPaymentTx(
  tx: Prisma.TransactionClient,
  input: BindDirectCommercialPaymentInput,
) {
  if (
    !input.userId ||
    !input.purchaseId ||
    !input.transactionId ||
    !(input.serverNow instanceof Date) ||
    !Number.isFinite(input.serverNow.getTime())
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_INVALID_PAYMENT_BINDING",
    );
  }

  await lockMembershipLifecycleUserTx(
    tx,
    input.userId,
  );

  const lockedPurchase = await tx.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id
    FROM OfferBoxPurchase
    WHERE id = ${input.purchaseId}
      AND userId = ${input.userId}
    FOR UPDATE
  `;

  if (lockedPurchase.length !== 1) {
    throw new Error(
      "DIRECT_COMMERCIAL_PURCHASE_OWNER_MISMATCH",
    );
  }

  const purchase =
    await tx.offerBoxPurchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });

  const source = readCommercialPurchaseSource(
    purchase,
  );

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
    purchase.redeemedUserMembershipId !== null ||
    purchase.redeemedAt !== null
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

  if (
    purchase.paymentTransactionId !== null &&
    purchase.paymentTransactionId !== input.transactionId
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_ALREADY_BOUND",
    );
  }

  const lockedPayment = await tx.$queryRaw<
    Array<{ id: string }>
  >`
    SELECT id
    FROM PaymentTransaction
    WHERE id = ${input.transactionId}
    FOR UPDATE
  `;

  if (lockedPayment.length !== 1) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_NOT_FOUND",
    );
  }

  const payment =
    await tx.paymentTransaction.findUniqueOrThrow({
      where: { id: input.transactionId },
    });

  if (
    payment.userId !== purchase.userId ||
    payment.purpose !== "offer_box" ||
    payment.businessUnit !== "club" ||
    payment.provider !== "paymob" ||
    payment.membershipId !== null ||
    payment.orderId !== null ||
    payment.offerId !== source.offerId ||
    payment.currency !== "EGP" ||
    purchase.currency !== "EGP" ||
    payment.paidAt !== null ||
    !["pending", "requires_action"].includes(
      payment.status,
    )
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_IDENTITY_MISMATCH",
    );
  }

  if (
    toCents(payment.amount) !==
    toCents(purchase.priceSnapshot)
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_AMOUNT_MISMATCH",
    );
  }

  const metadata = parseMetadata(payment.metadata);

  if (
    metadata.offerBoxPurchaseId !== purchase.id ||
    metadata.commercialKind !== source.commercialKind ||
    metadata.catalogMembershipId !==
      source.catalogMembershipId
  ) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_SOURCE_MISMATCH",
    );
  }

  const otherOwner =
    await tx.offerBoxPurchase.findFirst({
      where: {
        paymentTransactionId: payment.id,
        id: { not: purchase.id },
      },
      select: { id: true },
    });

  if (otherOwner) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_OTHER_OWNER",
    );
  }

  if (purchase.paymentTransactionId === payment.id) {
    return {
      purchaseId: purchase.id,
      transactionId: payment.id,
      alreadyBound: true,
    };
  }

  const claimed = await tx.offerBoxPurchase.updateMany({
    where: {
      id: purchase.id,
      userId: input.userId,
      status: "pending_payment",
      paymentTransactionId: null,
      paidAt: null,
      holdExpiresAt: {
        gt: input.serverNow,
      },
    },
    data: {
      paymentTransactionId: payment.id,
    },
  });

  if (claimed.count !== 1) {
    throw new Error(
      "DIRECT_COMMERCIAL_PAYMENT_BINDING_LOST_RACE",
    );
  }

  return {
    purchaseId: purchase.id,
    transactionId: payment.id,
    alreadyBound: false,
  };
}
