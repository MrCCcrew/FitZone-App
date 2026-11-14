import { releaseUnstartedDirectCommercialHoldTx } from "@/lib/offer-box/direct-commercial-hold-release";
import { activatePaidDirectCommercialPurchaseTx } from "@/lib/offer-box/direct-commercial-activation";
import { reconcilePaidDirectCommercialPurchaseTx } from "@/lib/offer-box/direct-commercial-paid-reconciliation";
import { preparePaidOfferBoxStaffCommission } from "@/lib/offer-box/paid-staff-commission";
import { accruePreparedOfferBoxStaffCommissionTx } from "@/lib/offer-box/paid-staff-commission-tx";
import { db, asDbTransactionClient } from "@/lib/db";

type OfferBoxPurchaseRow = {
  id: string;
  userId: string;
  offerId: string | null;
  status: string;
  paymentTransactionId: string | null;
  redeemedUserMembershipId: string | null;
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
      paymentTransactionId,
      redeemedUserMembershipId
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
  paymobOrderPaidVerified: boolean;
}) {
  const result = await db.$transaction(async (tx) => {
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
          membershipId: true,
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

    if (input.paymobOrderPaidVerified !== true) {
      throw new Error("OFFER_BOX_PAYMOB_PAID_PROOF_REQUIRED");
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

    const commercialPurchase =
      await tx.offerBoxPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
        select: { commercialKind: true },
      });

    if (
      commercialPurchase.commercialKind === "package" ||
      commercialPurchase.commercialKind === "direct_offer"
    ) {
      return reconcilePaidDirectCommercialPurchaseTx(
        asDbTransactionClient(tx),
        {
          purchaseId: purchase.id,
          transactionId: input.transactionId,
          paymobOrderPaidVerified:
            input.paymobOrderPaidVerified,
        },
      );
    }

    if (commercialPurchase.commercialKind !== "offer_box") {
      throw new Error(
        "COMMERCIAL_PAID_SOURCE_REQUIRES_REVIEW",
      );
    }

    await ensureOfferBoxPaymentLink(
      tx,
      purchase,
      input.transactionId,
    );

    // A paid retry must repair missing commission before returning.
    // Purchase row lock serializes competing reconciliations.
    if (!payment.paidAt) {
      throw new Error("OFFER_BOX_COMMISSION_PAID_DATE_REQUIRED");
    }

    const frozen = await tx.offerBoxPurchase.findUnique({
      where: { id: purchase.id },
      select: {
        offerSnapshot: true,
        priceSnapshot: true,
        currency: true,
      },
    });

    const details = await tx.paymentTransaction.findUnique({
      where: { id: input.transactionId },
      select: {
        provider: true,
        amount: true,
        currency: true,
      },
    });

    if (!frozen || !details || details.provider !== "paymob") {
      throw new Error("OFFER_BOX_COMMISSION_PAYMENT_PROOF_MISMATCH");
    }

    if (
      frozen.currency !== details.currency ||
      !Number.isFinite(frozen.priceSnapshot) ||
      !Number.isFinite(details.amount) ||
      Math.round(frozen.priceSnapshot * 100) !==
        Math.round(details.amount * 100)
    ) {
      throw new Error("OFFER_BOX_COMMISSION_PURCHASE_AMOUNT_MISMATCH");
    }

    /*
     * Historical Offer Box redemptions used UserMembership as their
     * economic owner. A verified paid replay must not generate a
     * second commission under the new independent purchase identity.
     *
     * Existing legacy membership commission/settlement history stays
     * untouched. A dual-identity inconsistency requires review.
     */
    if (purchase.redeemedUserMembershipId != null) {
      if (
        purchase.status !== "redeemed" ||
        payment.membershipId !== purchase.redeemedUserMembershipId
      ) {
        throw new Error(
          "OFFER_BOX_LEGACY_REDEMPTION_IDENTITY_MISMATCH",
        );
      }

      const legacyMembership = await tx.userMembership.findUnique({
        where: { id: purchase.redeemedUserMembershipId },
        select: { id: true, userId: true },
      });

      if (
        !legacyMembership ||
        legacyMembership.userId !== purchase.userId
      ) {
        throw new Error(
          "OFFER_BOX_LEGACY_MEMBERSHIP_OWNERSHIP_MISMATCH",
        );
      }

      const independentCommission =
        await tx.staffCommission.findUnique({
          where: { offerBoxPurchaseId: purchase.id },
          select: { id: true },
        });

      if (independentCommission) {
        throw new Error(
          "OFFER_BOX_LEGACY_DUAL_COMMISSION_REVIEW_REQUIRED",
        );
      }

      return {
        alreadyReconciled: true,
        status: purchase.status,
      };
    }

    const prepared = preparePaidOfferBoxStaffCommission({
      purchaseId: purchase.id,
      offerSnapshot: frozen.offerSnapshot,
      paidAmount: details.amount,
      paidCurrency: details.currency,
      paidAt: payment.paidAt,
    });

    await accruePreparedOfferBoxStaffCommissionTx(asDbTransactionClient(tx), prepared);

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

  if (
    result.status === "paid_activation_pending" ||
    result.status === "redeemed"
  ) {
    const purchase =
      await db.offerBoxPurchase.findUniqueOrThrow({
        where: { id: input.purchaseId },
        select: {
          id: true,
          userId: true,
          commercialKind: true,
        },
      });

    if (
      purchase.commercialKind === "package" ||
      purchase.commercialKind === "direct_offer"
    ) {
      try {
        await db.$transaction(
          (tx) => activatePaidDirectCommercialPurchaseTx(tx, {
            purchaseId: purchase.id,
            transactionId: input.transactionId,
            userId: purchase.userId,
            paymobOrderPaidVerified:
              input.paymobOrderPaidVerified,
          }),
          { timeout: 20000 },
        );

        return {
          alreadyReconciled: result.alreadyReconciled,
          status: "redeemed",
        };
      } catch (error) {
        // Payment collection is already durable.
        // Never create a new payment or discard the right.
        console.error(
          "[DIRECT_COMMERCIAL_ACTIVATION_PENDING]",
          purchase.id,
          error instanceof Error ? error.message : "unknown",
        );

        throw error;
      }
    }
  }

  return result;
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

    const commercialPurchase =
      await tx.offerBoxPurchase.findUniqueOrThrow({
        where: { id: purchase.id },
        select: { commercialKind: true },
      });

    if (
      commercialPurchase.commercialKind === "package" ||
      commercialPurchase.commercialKind === "direct_offer"
    ) {
      return releaseUnstartedDirectCommercialHoldTx(
        asDbTransactionClient(tx),
        {
          purchaseId: purchase.id,
          transactionId: input.transactionId,
          now,
        },
      );
    }

    if (commercialPurchase.commercialKind !== "offer_box") {
      throw new Error(
        "COMMERCIAL_HOLD_SOURCE_REQUIRES_REVIEW",
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