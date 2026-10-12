import { db } from "@/lib/db";

type OfferBoxPurchaseRow = {
  id: string;
  userId: string;
  offerId: string | null;
  status: string;
  paymentTransactionId: string | null;
};

async function lockOfferBoxPurchase(
  tx: any,
  purchaseId: string,
): Promise<OfferBoxPurchaseRow | null> {
  const rows = (await tx.$queryRaw`
    SELECT
      id,
      userId,
      offerId,
      status,
      paymentTransactionId
    FROM OfferBoxPurchase
    WHERE id = ${purchaseId}
    LIMIT 1
    FOR UPDATE
  `) as OfferBoxPurchaseRow[];

  return rows[0] ?? null;
}

async function ensureOfferBoxPaymentLink(
  tx: any,
  purchase: OfferBoxPurchaseRow,
  transactionId: string,
) {
  if (purchase.paymentTransactionId === transactionId) {
    return;
  }

  if (purchase.paymentTransactionId != null) {
    throw new Error(
      "OFFER_BOX_PAYMENT_TRANSACTION_MISMATCH",
    );
  }

  const claimed = await tx.$executeRaw`
    UPDATE OfferBoxPurchase
    SET
      paymentTransactionId = ${transactionId},
      updatedAt = CURRENT_TIMESTAMP(3)
    WHERE
      id = ${purchase.id}
      AND paymentTransactionId IS NULL
  `;

  if (Number(claimed) === 1) {
    return;
  }

  const winner = await lockOfferBoxPurchase(
    tx,
    purchase.id,
  );

  if (
    !winner ||
    winner.paymentTransactionId !== transactionId
  ) {
    throw new Error(
      "OFFER_BOX_PAYMENT_TRANSACTION_MISMATCH",
    );
  }
}

/**
 * Payment success creates a durable Offer Box entitlement only.
 *
 * It deliberately does NOT:
 * - create or activate UserMembership
 * - start membership dates
 * - reserve class schedules
 * - increment Offer.currentSubscribers
 *
 * offerBoxReservedCount remains reserved until redemption.
 */
export async function reconcilePaidOfferBoxPurchase(input: {
  transactionId: string;
  purchaseId: string;
  paidAt: Date;
}) {
  return db.$transaction(async (tx) => {
    const payment =
      await tx.paymentTransaction.findUnique({
        where: {
          id: input.transactionId,
        },
        select: {
          id: true,
          userId: true,
          purpose: true,
          status: true,
          paidAt: true,
        },
      });

    if (!payment) {
      throw new Error(
        "OFFER_BOX_PAYMENT_NOT_FOUND",
      );
    }

    if (payment.purpose !== "offer_box") {
      throw new Error(
        "OFFER_BOX_PAYMENT_PURPOSE_MISMATCH",
      );
    }

    if (payment.status !== "paid") {
      throw new Error(
        "OFFER_BOX_PAYMENT_NOT_PAID",
      );
    }

    const purchase =
      await lockOfferBoxPurchase(
        tx,
        input.purchaseId,
      );

    if (!purchase) {
      throw new Error(
        "OFFER_BOX_PURCHASE_NOT_FOUND",
      );
    }

    if (purchase.userId !== payment.userId) {
      throw new Error(
        "OFFER_BOX_PAYMENT_USER_MISMATCH",
      );
    }

    await ensureOfferBoxPaymentLink(
      tx,
      purchase,
      input.transactionId,
    );

    if (
      purchase.status === "available" ||
      purchase.status === "redeemed"
    ) {
      return {
        alreadyReconciled: true,
        status: purchase.status,
      };
    }

    if (purchase.status !== "pending_payment") {
      throw new Error(
        `OFFER_BOX_PURCHASE_NOT_PAYABLE:${purchase.status}`,
      );
    }

    const claimed = await tx.$executeRaw`
      UPDATE OfferBoxPurchase
      SET
        status = 'available',
        paidAt = ${payment.paidAt ?? input.paidAt},
        holdExpiresAt = NULL,
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE
        id = ${purchase.id}
        AND status = 'pending_payment'
        AND paymentTransactionId = ${input.transactionId}
    `;

    if (Number(claimed) === 1) {
      return {
        alreadyReconciled: false,
        status: "available" as const,
      };
    }

    const winner =
      await lockOfferBoxPurchase(
        tx,
        input.purchaseId,
      );

    if (
      winner &&
      winner.paymentTransactionId ===
        input.transactionId &&
      (
        winner.status === "available" ||
        winner.status === "redeemed"
      )
    ) {
      return {
        alreadyReconciled: true,
        status: winner.status,
      };
    }

    throw new Error(
      "OFFER_BOX_PAID_RECONCILIATION_RACE",
    );
  });
}

/**
 * A Paymob failed attempt is NOT enough to release the Box.
 *
 * Release is allowed only when the payment lifecycle receives
 * an authoritative expired signal AND the persisted checkout
 * expiration time has actually passed.
 *
 * The payment row itself may still contain failed/cancelled
 * because those are already-terminal states in the shared
 * payment state machine.
 */
export async function releaseExpiredOfferBoxPaymentHold(input: {
  transactionId: string;
  purchaseId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return db.$transaction(async (tx) => {
    const payment =
      await tx.paymentTransaction.findUnique({
        where: {
          id: input.transactionId,
        },
        select: {
          id: true,
          userId: true,
          purpose: true,
          status: true,
          expiresAt: true,
        },
      });

    if (!payment) {
      throw new Error(
        "OFFER_BOX_PAYMENT_NOT_FOUND",
      );
    }

    if (payment.purpose !== "offer_box") {
      throw new Error(
        "OFFER_BOX_PAYMENT_PURPOSE_MISMATCH",
      );
    }

    if (payment.status === "paid") {
      return {
        released: false,
        reason: "payment_already_paid" as const,
      };
    }

    if (!(payment.expiresAt instanceof Date)) {
      return {
        released: false,
        reason: "checkout_has_no_expiry" as const,
      };
    }

    if (
      payment.expiresAt.getTime() >
      now.getTime()
    ) {
      return {
        released: false,
        reason: "checkout_expiry_not_reached" as const,
      };
    }

    const purchase =
      await lockOfferBoxPurchase(
        tx,
        input.purchaseId,
      );

    if (!purchase) {
      throw new Error(
        "OFFER_BOX_PURCHASE_NOT_FOUND",
      );
    }

    if (purchase.userId !== payment.userId) {
      throw new Error(
        "OFFER_BOX_PAYMENT_USER_MISMATCH",
      );
    }

    await ensureOfferBoxPaymentLink(
      tx,
      purchase,
      input.transactionId,
    );

    if (purchase.status !== "pending_payment") {
      return {
        released: false,
        reason: "purchase_not_pending" as const,
      };
    }

    const cancelled = await tx.$executeRaw`
      UPDATE OfferBoxPurchase
      SET
        status = 'cancelled',
        cancelledAt = ${now},
        cancelReason = 'payment_expired',
        updatedAt = CURRENT_TIMESTAMP(3)
      WHERE
        id = ${purchase.id}
        AND status = 'pending_payment'
        AND paymentTransactionId = ${input.transactionId}
    `;

    if (Number(cancelled) !== 1) {
      return {
        released: false,
        reason: "purchase_claim_lost" as const,
      };
    }

    if (purchase.offerId) {
      const released = await tx.$executeRaw`
        UPDATE Offer
        SET
          offerBoxReservedCount =
            offerBoxReservedCount - 1
        WHERE
          id = ${purchase.offerId}
          AND offerBoxReservedCount > 0
      `;

      if (Number(released) !== 1) {
        throw new Error(
          "OFFER_BOX_RESERVED_COUNT_INTEGRITY_ERROR",
        );
      }
    }

    return {
      released: true,
      reason: "payment_expired" as const,
    };
  });
}