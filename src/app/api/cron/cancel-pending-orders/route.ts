import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { inquirePaymobTransactionByMerchantReference } from "@/lib/payments/providers/paymob";

const EXPIRABLE_PAYMENT_STATUSES = new Set([
  "pending",
  "requires_action",
  "processing",
]);

const RETRY_CLAIM_STATUS = "retrying";

/**
 * Store pending-order timeout cleanup.
 *
 * PaymentTransaction.expiresAt is the authoritative timeout.
 *
 * Important:
 * - Store orders only.
 * - Membership payments are never selected.
 * - A retry claim ("retrying") is never expired here.
 * - Inventory release / wallet restoration / order cancellation are delegated
 *   to updatePaymentTransactionStatus so there is one terminal-failure path.
 */
export async function GET(req: Request) {
  if (process.env.APP_ENV === "staging") {
    return Response.json(
      { error: "Cron disabled in staging" },
      { status: 403 },
    );
  }

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }

  const provided =
    req.headers.get("x-cron-secret") ?? "";

  if (provided !== secret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const now = new Date();

  /*
   * Select only pending Store orders that have at least one expired,
   * still-open Store payment attempt.
   *
   * We still inspect the latest transaction below because an older attempt
   * could theoretically be expired while a newer replacement is valid.
   */
  const pending = await db.order.findMany({
    where: {
      status: "pending",
      businessUnit: "store",
      inventoryDeducted: false,
      paymentTransactions: {
        some: {
          purpose: "order",
          businessUnit: "store",
          status: {
            in: [
              "pending",
              "requires_action",
              "processing",
            ],
          },
          expiresAt: {
            lte: now,
          },
        },
      },
    },
    select: {
      id: true,
      paymentTransactions: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          purpose: true,
          businessUnit: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  /*
   * Offer Box timeout cleanup.
   *
   * PaymentTransaction.expiresAt remains authoritative.
   * We intentionally select only Offer Box payment rows whose checkout
   * has actually expired. The shared payment service owns the atomic
   * terminal claim and the exact-once Box reservation release.
   *
   * This also recovers the crash window where the payment transaction
   * exists with offerBoxPurchaseId metadata but the purchase row was not
   * yet linked to paymentTransactionId.
   */
  const offerBoxExpiryWhere: Prisma.PaymentTransactionWhereInput = {
    purpose: "offer_box",
    expiresAt: { lte: now },
    status: {
      in: ["pending", "pending_payment", "processing", "requires_action", "failed", "cancelled"],
    },
  };
  // Rotating deterministic pages keep unresolved/terminal older rows from
  // indefinitely starving newer checkouts. Does not rely on process memory.
  const offerBoxDueCount = await db.paymentTransaction.count({
    where: offerBoxExpiryWhere,
  });
  const offerBoxPageCount = Math.max(1, Math.ceil(offerBoxDueCount / 100));
  const offerBoxPage = Math.floor(now.getTime() / 3_600_000) % offerBoxPageCount;
  const expiredOfferBoxPayments =
    await db.paymentTransaction.findMany({
      where: offerBoxExpiryWhere,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: offerBoxPage * 100,
      take: 100,
      select: {
        id: true,
        status: true,
        expiresAt: true,
      },
    });

  let offerBoxExpired = 0;

  for (const payment of expiredOfferBoxPayments) {
    if (!(payment.expiresAt instanceof Date)) {
      continue;
    }

    if (
      payment.expiresAt.getTime() >
      now.getTime()
    ) {
      continue;
    }

    try {
      /*
       * Ambiguous checkout recovery:
       *
       * PaymentTransaction exists before the external Paymob intention
       * request. If Paymob accepted that request but our HTTP response
       * was lost, local provider references may still be missing.
       *
       * This path runs only after the durable 60-minute local cutoff,
       * while Paymob checkout itself expires after 30 minutes.
       */
      const offerBoxRemotePayment =
        await db.paymentTransaction.findUnique({
          where: {
            id: payment.id,
          },
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            currency: true,
            externalReference: true,
          },
        });

      if (!offerBoxRemotePayment) {
        continue;
      }

      if (
        offerBoxRemotePayment.provider === "paymob" &&
        offerBoxRemotePayment.status !== "paid"
      ) {
        /*
         * Read-only Paymob lookup by the immutable local
         * PaymentTransaction.id / merchant_order_id.
         *
         * Transport/API errors deliberately throw and fail closed.
         */
        const inquiry =
          await inquirePaymobTransactionByMerchantReference(
            offerBoxRemotePayment.id,
          );

        if (inquiry.found) {
          if (
            inquiry.merchantOrderId !==
            offerBoxRemotePayment.id
          ) {
            throw new Error(
              "OFFER_BOX_PAYMOB_INQUIRY_LINK_MISMATCH",
            );
          }

          const expectedAmountCents =
            Math.round(
              Number(
                offerBoxRemotePayment.amount,
              ) * 100,
            );

          if (
            inquiry.amountCents == null ||
            inquiry.amountCents !==
              expectedAmountCents ||
            inquiry.currency == null ||
            inquiry.currency.toUpperCase() !==
              String(
                offerBoxRemotePayment.currency,
              ).toUpperCase()
          ) {
            throw new Error(
              "OFFER_BOX_PAYMOB_INQUIRY_FINANCIAL_MISMATCH",
            );
          }

          if (inquiry.status === "paid") {
            if (!inquiry.paymobTransactionId) {
              throw new Error(
                "OFFER_BOX_PAYMOB_PAID_REFERENCE_MISSING",
              );
            }

            /*
             * Persist the recovered Acceptance transaction ID.
             * This does not create a payment or checkout.
             */
            // Compare-and-swap the reference AND payment state. A stale
            // inquiry must not overwrite a concurrent webhook or expiry.
            const referenceClaim = await db.paymentTransaction.updateMany({
              where: {
                id: offerBoxRemotePayment.id,
                purpose: "offer_box",
                provider: "paymob",
                status: offerBoxRemotePayment.status,
                externalReference: offerBoxRemotePayment.externalReference,
              },
              data: { externalReference: inquiry.paymobTransactionId },
            });
            if (referenceClaim.count !== 1) {
              throw new Error("OFFER_BOX_PAYMOB_REFERENCE_CAS_LOST");
            }

            const repaired =
              await updatePaymentTransactionStatus(
                offerBoxRemotePayment.id,
                "paid",
              );

            if (repaired.status !== "paid") {
              throw new Error(
                "OFFER_BOX_PAYMOB_PAID_RECOVERY_NOT_COMMITTED",
              );
            }

            /*
             * Paid wins: reconciliation preserves the Offer Box right.
             */
            continue;
          }

          if (inquiry.status === "pending") {
            /*
             * Provider still reports unresolved state.
             * Keep the reservation and retry on a later cron run.
             */
            continue;
          }

          /*
           * inquiry.status === "failed"
           *
           * We are already beyond both:
           * - Paymob's 30-minute checkout lifetime
           * - our conservative 60-minute local hold
           *
           * Safe to continue into canonical expiry below.
           */
        }

        /*
         * found=false:
         * after the durable 60-minute cutoff, Paymob has no transaction
         * matching our merchant reference. Continue to canonical expiry.
         */
      }

      const result =
        await updatePaymentTransactionStatus(
          payment.id,
          "expired",
        );

      /*
       * A concurrent successful payment may win before expiry gets
       * its atomic claim. In that case the shared payment service
       * returns the paid transaction and no Box reservation is released.
       */
      if (result.status === "paid") {
        console.log(
          `[CRON] Offer Box payment ${payment.id} became paid during timeout processing`,
        );
        continue;
      }

      if (result.status === "expired") {
        offerBoxExpired++;
      }
    } catch (err) {
      console.error(
        `[CRON] Failed to expire Offer Box payment ${payment.id}:`,
        err,
      );
    }
  }

  if (
    pending.length === 0 &&
    expiredOfferBoxPayments.length === 0
  ) {
    return NextResponse.json({
      ok: true,
      expired: 0,
      offerBoxExpired: 0,
    });
  }

  let expired = 0;

  for (const order of pending) {
    const latest =
      order.paymentTransactions[0];

    if (!latest) {
      continue;
    }

    /*
     * Fail closed if this is not unquestionably the current Store order
     * payment transaction.
     */
    if (
      latest.purpose !== "order" ||
      latest.businessUnit !== "store"
    ) {
      continue;
    }

    /*
     * A retry-payment request temporarily changes the prior transaction
     * to "retrying" while it creates the replacement checkout.
     *
     * The cron must never interfere with that claim.
     */
    if (latest.status === RETRY_CLAIM_STATUS) {
      console.log(
        `[CRON] Store order ${order.id} has an active retry claim; skipping timeout cleanup`,
      );
      continue;
    }

    if (
      !EXPIRABLE_PAYMENT_STATUSES.has(
        latest.status,
      )
    ) {
      continue;
    }

    /*
     * Missing expiry is not permission to cancel.
     * Current Paymob checkouts provide expiresAt; fail closed otherwise.
     */
    if (!(latest.expiresAt instanceof Date)) {
      console.warn(
        `[CRON] Store payment ${latest.id} has no expiresAt; skipping`,
      );
      continue;
    }

    /*
     * A newer retry checkout may still be valid even when an older payment
     * caused this order to appear in the candidate query.
     */
    if (
      latest.expiresAt.getTime() >
      now.getTime()
    ) {
      continue;
    }

    try {
      /*
       * Canonical terminal-failure path:
       * - payment race protection
       * - payment-adjustment restoration
       * - modern inventory allocation release
       * - legacy fallback for pre-allocation orders
       * - order cancellation
       * - superseded retry protection
       */
      const result =
        await updatePaymentTransactionStatus(
          latest.id,
          "expired",
        );

      /*
       * A concurrent webhook may have won and converted the payment to paid.
       * Never count that order as timed out.
       */
      if (result.status === "paid") {
        console.log(
          `[CRON] Payment ${latest.id} became paid during timeout processing`,
        );
        continue;
      }

      /*
       * Count only after the canonical failure path actually moved the order
       * out of pending state.
       */
      const refreshed =
        await db.order.findUnique({
          where: {
            id: order.id,
          },
          select: {
            status: true,
          },
        });

      if (
        refreshed?.status === "cancelled" ||
        refreshed?.status === "expired"
      ) {
        expired++;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message ===
          "PAYMENT_CONFIRMED_RACE"
      ) {
        console.log(
          `[CRON] Payment confirmed during timeout for order ${order.id}`,
        );
      } else {
        console.error(
          `[CRON] Failed to expire Store order ${order.id}:`,
          err,
        );
      }
    }
  }

  console.log(
    `[CRON] Checked ${pending.length} Store pending orders, expired ${expired}`,
  );

  return NextResponse.json({
    ok: true,
    expired,
  });
}