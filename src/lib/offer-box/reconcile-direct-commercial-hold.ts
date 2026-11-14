import { db, asDbTransactionClient } from "@/lib/db";
import {
  verifyPaymentTransaction,
  updatePaymentTransactionStatus,
} from "@/lib/payments/service";
import {
  releaseUnstartedDirectCommercialHoldTx,
} from "@/lib/offer-box/direct-commercial-hold-release";

export async function reconcileDirectCommercialHold(
  purchaseId: string,
  now = new Date(),
) {
  const purchase =
    await db.offerBoxPurchase.findUnique({
      where: { id: purchaseId },
    });

  if (
    !purchase ||
    (
      purchase.commercialKind !== "package" &&
      purchase.commercialKind !== "direct_offer"
    )
  ) {
    return "not_applicable" as const;
  }

  if (
    purchase.status !== "pending_payment" &&
    purchase.status !== "paid_activation_pending"
  ) {
    return "not_applicable" as const;
  }

  if (
    purchase.status === "pending_payment" &&
    (
      !purchase.holdExpiresAt ||
      purchase.holdExpiresAt > now
    )
  ) {
    return "not_due" as const;
  }

  if (!purchase.paymentTransactionId) {
    return "review_required" as const;
  }

  const transactionId = purchase.paymentTransactionId;

  const payment =
    await db.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

  if (
    !payment ||
    payment.userId !== purchase.userId ||
    payment.purpose !== "offer_box" ||
    payment.provider !== "paymob" ||
    payment.membershipId !== null ||
    payment.orderId !== null
  ) {
    return "review_required" as const;
  }

  if (purchase.status === "pending_payment") {
    const released = await db.$transaction((tx) =>
      releaseUnstartedDirectCommercialHoldTx(
        asDbTransactionClient(tx),
        {
          purchaseId,
          transactionId,
          now,
        },
      ),
    );

    if (released.released) {
      return "released" as const;
    }
  }

  // A known local paid state still requires fresh
  // authoritative Paymob proof before repair.
  if (payment.status === "paid") {
    await updatePaymentTransactionStatus(
      transactionId,
      "paid",
    );
  } else {
    await verifyPaymentTransaction(transactionId);
  }

  const latest =
    await db.offerBoxPurchase.findUniqueOrThrow({
      where: { id: purchaseId },
    });

  if (latest.status === "redeemed") {
    return "activated" as const;
  }

  if (latest.status === "paid_review") {
    return "paid_review" as const;
  }

  if (latest.status === "cancelled") {
    return "released" as const;
  }

  return "review_required" as const;
}

/**
 * Reuse the authenticated payment cleanup cron.
 * Limit remote inquiries and rotate the candidates.
 */
export async function reconcileDueDirectCommercialHolds(
  now = new Date(),
) {
  const where = {
    commercialKind: {
      in: ["package", "direct_offer"],
    },
    OR: [
      {
        status: "pending_payment",
        holdExpiresAt: { lte: now },
      },
      { status: "paid_activation_pending" },
    ],
  };

  const due = await db.offerBoxPurchase.count({
    where,
  });

  const batchSize = 12;
  const pages = Math.max(
    1,
    Math.ceil(due / batchSize),
  );

  const page =
    Math.floor(now.getTime() / 300000) % pages;

  const rows = await db.offerBoxPurchase.findMany({
    where,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    skip: page * batchSize,
    take: batchSize,
    select: { id: true },
  });

  let released = 0;
  let activated = 0;
  let unresolved = 0;

  const failedPurchaseIds: string[] = [];

  for (const row of rows) {
    try {
      const result =
        await reconcileDirectCommercialHold(row.id, now);

      if (result === "released") {
        released++;
      } else if (result === "activated") {
        activated++;
      } else if (
        result === "paid_review" ||
        result === "review_required"
      ) {
        unresolved++;
      }
    } catch {
      failedPurchaseIds.push(row.id);
    }
  }

  const paidReviewCount =
    await db.offerBoxPurchase.count({
      where: {
        commercialKind: {
          in: ["package", "direct_offer"],
        },
        status: "paid_review",
      },
    });

  if (
    unresolved ||
    failedPurchaseIds.length ||
    paidReviewCount
  ) {
    console.error(
      "[DIRECT_COMMERCIAL_RECONCILIATION_REQUIRED]",
      {
        unresolved,
        paidReviewCount,
        failedPurchaseIds,
      },
    );
  }

  return {
    due,
    checked: rows.length,
    released,
    activated,
    unresolved,
    paidReviewCount,
    failedPurchaseIds,
  };
}
