import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

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

  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      expired: 0,
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