import { restoreDirectCommercialEconomicsTx } from "@/lib/offer-box/direct-commercial-economics";
import type { Prisma } from "@prisma/client";

import {
  readCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

/**
 * Release only an expired direct commercial checkout
 * for which provider initialization NEVER started.
 *
 * An expired local status, a failed attempt, or an
 * inconclusive Paymob inquiry is not proof that an
 * externally initialized payment cannot settle.
 *
 * Provider-started purchases require separate
 * authoritative reconciliation.
 */
export async function releaseUnstartedDirectCommercialHoldTx(
  tx: Prisma.TransactionClient,
  input: {
    purchaseId: string;
    transactionId: string;
    now: Date;
  },
) {
  if (
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error("DIRECT_HOLD_INVALID_TIME");
  }

  await tx.$queryRaw`
    SELECT id FROM OfferBoxPurchase
    WHERE id = ${input.purchaseId}
    FOR UPDATE
  `;

  const purchase =
    await tx.offerBoxPurchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });

  const source = readCommercialPurchaseSource(purchase);

  if (
    source.commercialKind !== "package" &&
    source.commercialKind !== "direct_offer"
  ) {
    throw new Error("DIRECT_HOLD_SOURCE_MISMATCH");
  }

  if (
    purchase.paymentTransactionId !== input.transactionId ||
    purchase.redeemedUserMembershipId !== null
  ) {
    throw new Error("DIRECT_HOLD_PAYMENT_OWNER_MISMATCH");
  }

  if (purchase.status !== "pending_payment") {
    return {
      released: false,
      reason: "purchase_not_pending" as const,
    };
  }

  await tx.$queryRaw`
    SELECT id FROM PaymentTransaction
    WHERE id = ${input.transactionId}
    FOR UPDATE
  `;

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
    !Number.isFinite(payment.amount) ||
    payment.amount <= 0 ||
    Math.round(payment.amount * 100) !==
      Math.round(purchase.priceSnapshot * 100)
  ) {
    throw new Error("DIRECT_HOLD_PAYMENT_IDENTITY_MISMATCH");
  }

  if (
    payment.status === "paid" ||
    payment.paidAt !== null ||
    purchase.paidAt !== null ||
    purchase.redeemedAt !== null
  ) {
    return {
      released: false,
      reason: "payment_already_paid" as const,
    };
  }

  if (
    !purchase.holdExpiresAt ||
    !payment.expiresAt ||
    purchase.holdExpiresAt.getTime() !==
      payment.expiresAt.getTime() ||
    purchase.holdExpiresAt > input.now
  ) {
    return {
      released: false,
      reason: "checkout_expiry_not_reached" as const,
    };
  }

  const metadata: unknown = JSON.parse(
    payment.metadata ?? "{}",
  );

  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new Error("DIRECT_HOLD_METADATA_INVALID");
  }

  const data = metadata as Record<string, unknown>;

  if (
    data.offerBoxPurchaseId !== purchase.id ||
    data.commercialKind !== source.commercialKind ||
    data.catalogMembershipId !== source.catalogMembershipId ||
    data.offerBoxSnapshotVersion !== purchase.snapshotVersion
  ) {
    throw new Error("DIRECT_HOLD_METADATA_MISMATCH");
  }

  /*
   * No external provider attempt may be inferred
   * to have failed merely from elapsed time.
   */
  if (
    data.directCommercialProviderInitialization != null ||
    payment.referenceCode !== null ||
    payment.checkoutUrl !== null ||
    payment.iframeUrl !== null ||
    payment.providerReference !== null ||
    payment.externalReference !== null ||
    payment.providerPayload !== null
  ) {
    return {
      released: false,
      reason: "provider_reconciliation_required" as const,
    };
  }

  if (
    payment.status !== "pending" &&
    payment.status !== "expired"
  ) {
    return {
      released: false,
      reason: "payment_state_requires_review" as const,
    };
  }

  /*
   * Mixed-wallet/points checkout has not been enabled.
   * Never silently release an unsupported economic owner.
   */
  if (
    data.paymentAdjustments != null ||
    data.walletDeductedAmount != null ||
    data.pointsDeductedCount != null
  ) {
    return {
      released: false,
      reason: "economic_adjustment_review_required" as const,
    };
  }

  const restoredMetadata = await restoreDirectCommercialEconomicsTx(tx, purchase, payment);

  const right =
    await tx.offerBoxEntitlement.findUnique({
      where: { purchaseId: purchase.id },
    });

  if (right) {

    if (
      right.userId !== purchase.userId ||
      right.status !== "pending_payment"
    ) {
      throw new Error("DIRECT_HOLD_RIGHT_NOT_PENDING");
    }

    await tx.$queryRaw`
      SELECT id FROM OfferBoxEntitlement
      WHERE id = ${right.id}
      FOR UPDATE
    `;

    const bookings = await tx.booking.findMany({
      where: { offerBoxEntitlementId: right.id },
      orderBy: { scheduleId: "asc" },
    });

    /*
     * No unpaid entitlement can legitimately have
     * attendance, makeup, or an exchange.
     */
    for (const booking of bookings) {
      if (
        booking.userId !== purchase.userId ||
        booking.userMembershipId !== null ||
        booking.isMakeup ||
        (
          booking.status !== "confirmed" &&
          booking.status !== "cancelled"
        )
      ) {
        throw new Error("DIRECT_HOLD_BOOKING_INTEGRITY_ERROR");
      }
    }

    for (const booking of bookings) {

      if (booking.status === "cancelled") {
        continue;
      }

      const cancelled = await tx.booking.updateMany({
        where: {
          id: booking.id,
          userId: purchase.userId,
          offerBoxEntitlementId: right.id,
          userMembershipId: null,
          status: "confirmed",
        },
        data: { status: "cancelled" },
      });

      if (cancelled.count !== 1) {
        throw new Error("DIRECT_HOLD_BOOKING_RACE");
      }

      await tx.schedule.update({
        where: { id: booking.scheduleId },
        data: {
          availableSpots: { increment: 1 },
        },
      });
    }

    const closed = await tx.offerBoxEntitlement.updateMany({
      where: {
        id: right.id,
        userId: purchase.userId,
        status: "pending_payment",
      },
      data: { status: "cancelled" },
    });

    if (closed.count !== 1) {
      throw new Error("DIRECT_HOLD_RIGHT_RACE");
    }
  }

  if (source.commercialKind === "direct_offer") {
    if (!source.offerId) {
      throw new Error("DIRECT_HOLD_OFFER_REQUIRES_REVIEW");
    }

    const released = await tx.$executeRaw`
      UPDATE Offer
      SET offerBoxReservedCount = offerBoxReservedCount - 1
      WHERE id = ${source.offerId}
        AND offerBoxReservedCount > 0
    `;

    if (Number(released) !== 1) {
      throw new Error("DIRECT_HOLD_OFFER_CAPACITY_MISMATCH");
    }
  }

  const closedPurchase =
    await tx.offerBoxPurchase.updateMany({
      where: {
        id: purchase.id,
        userId: purchase.userId,
        status: "pending_payment",
        paymentTransactionId: payment.id,
        paidAt: null,
        redeemedAt: null,
        redeemedUserMembershipId: null,
      },
      data: {
        status: "cancelled",
        cancelledAt: input.now,
        cancelReason: "payment_expired",
      },
    });

  if (closedPurchase.count !== 1) {
    throw new Error("DIRECT_HOLD_PURCHASE_RACE");
  }

  const closedPayment =
    await tx.paymentTransaction.updateMany({
      where: {
        id: payment.id,
        userId: purchase.userId,
        status: payment.status,
        metadata: payment.metadata,
        providerReference: null,
        externalReference: null,
        paidAt: null,
      },
      data: {
        status: "expired",
        metadata: restoredMetadata,
      },
    });

  if (closedPayment.count !== 1) {
    throw new Error("DIRECT_HOLD_PAYMENT_RACE");
  }

  return {
    released: true,
    reason: "payment_expired" as const,
  };
}
