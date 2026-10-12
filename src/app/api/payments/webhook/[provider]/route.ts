import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";
import { getPaymentProvider } from "@/lib/payments/registry";
import {
  recoverPaidMembershipActivation,
  recoverVerifiedPaymobPayment,
  updatePaymentTransactionStatus,
  verifyPaymentTransaction,
} from "@/lib/payments/service";

function parseWebhookPayload(rawText: string, contentType: string | null) {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(trimmed);
    const jsonCandidate = params.get("data") ?? params.get("payload");
    if (jsonCandidate) {
      try {
        return JSON.parse(jsonCandidate) as unknown;
      } catch {
        return Object.fromEntries(params.entries());
      }
    }
    return Object.fromEntries(params.entries());
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    try {
      const params = new URLSearchParams(trimmed);
      return Object.fromEntries(params.entries());
    } catch {
      return null;
    }
  }
}

// Browsers that land here via GET (misconfigured Paymob redirect) get sent to the verify page
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const transactionId =
    searchParams.get("merchant_order_id") ??
    searchParams.get("special_reference") ??
    searchParams.get("transactionId") ??
    "";
  const destination = transactionId
    ? `/payment/verify?transactionId=${encodeURIComponent(transactionId)}`
    : "/payment/verify";
  return NextResponse.redirect(new URL(destination, req.url), { status: 302 });
}

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerKey } = await context.params;

  try {
    const provider = getPaymentProvider(providerKey);
    if (!provider?.handleWebhook) {
      return NextResponse.json({ received: true, message: "Provider does not support webhooks." });
    }

    const rawText = await req.text();
    const payload = parseWebhookPayload(rawText, req.headers.get("content-type"));

    // Extract HMAC from query params (Paymob Unified Checkout sends it here)
    const url = new URL(req.url);
    const queryHmac = url.searchParams.get("hmac");

    const result = await provider.handleWebhook(payload, req.headers, queryHmac);

    if (!result.ok || !result.transactionId) {
      console.warn(`[WEBHOOK:${providerKey}] Ignored`, result.message);
      return NextResponse.json({ received: true });
    }

    // Persist provider evidence without overwriting newer Paymob state.
    // Paymob's signed callback is an event, not proof that it owns the
    // current membership/order or that its amount matches this payment.
    if (result.providerReference || result.externalReference || result.payload) {
      const existingPayment = await db.paymentTransaction.findUnique({
        where: { id: result.transactionId },
        select: {
          provider: true,
          status: true,
          providerPayload: true,
          providerReference: true,
          externalReference: true,
          amount: true,
          currency: true,
          metadata: true,
        },
      });

      if (providerKey === "paymob") {
        if (!existingPayment || existingPayment.provider !== "paymob") {
          console.warn("[PAYMOB_WEBHOOK_OWNER_MISMATCH]", {
            transactionId: result.transactionId,
          });
          return NextResponse.json({ received: true });
        }

        // A confirmed payment must never be replaced by a late failed
        // attempt (or by a different acceptance transaction ID).
        if (existingPayment.status === "paid") {
          if (
            result.status !== "paid" ||
            existingPayment.externalReference !== result.externalReference
          ) {
            return NextResponse.json({ received: true });
          }
        } else if (existingPayment.status === "retrying" && result.status !== "paid") {
          // Preserve the durable renewal claim for later reconciliation.
          return NextResponse.json({ received: true });
        } else if (result.status === "paid") {
          if (!result.externalReference) {
            return NextResponse.json({ received: true });
          }

          // Verify against Paymob's own transaction endpoint BEFORE storing
          // the callback's reference. This checks the amount, currency,
          // local merchant reference and immutable Paymob order identity.
          let positiveProof = false;
          try {
            const proof = await provider.verifyTransaction({
              id: result.transactionId,
              providerReference: existingPayment.providerReference,
              externalReference: result.externalReference,
              amount: existingPayment.amount,
              currency: existingPayment.currency,
              metadata: existingPayment.metadata,
              providerPayload: existingPayment.providerPayload,
            });
            positiveProof =
              proof.status === "paid" &&
              proof.externalReference === result.externalReference;
          } catch (error) {
            console.warn("[PAYMOB_WEBHOOK_PROOF_UNAVAILABLE]", {
              transactionId: result.transactionId,
              errorType: error instanceof Error ? error.name : "unknown",
            });
          }

          if (!positiveProof) {
            // Do not acknowledge unverified payment success. The provider
            // may retry; no DB reference or payment state is mutated.
            return NextResponse.json(
              { received: false, message: "Payment verification unavailable" },
              { status: 503 },
            );
          }
        } else if (
          existingPayment.externalReference &&
          result.externalReference &&
          existingPayment.externalReference !== result.externalReference
        ) {
          // A stale failure/pending attempt cannot replace the current
          // acceptance reference. A different SUCCESS must pass proof above.
          return NextResponse.json({ received: true });
        }
      }

      let existingProviderPayload: Record<string, unknown> = {};
      if (existingPayment?.providerPayload) {
        try {
          const parsed = JSON.parse(existingPayment.providerPayload) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            existingProviderPayload = parsed as Record<string, unknown>;
          }
        } catch {
          // Invalid historical payload must not authorize a payment.
        }
      }

      const mergedProviderPayload = result.payload
        ? { ...existingProviderPayload, ...result.payload }
        : existingProviderPayload;

      const data = {
        providerReference: result.providerReference || undefined,
        externalReference: result.externalReference || undefined,
        providerPayload: result.payload
          ? JSON.stringify(mergedProviderPayload)
          : undefined,
      };

      if (providerKey === "paymob") {
        // Duplicate paid webhook: no need to touch provider evidence.
        if (existingPayment?.status !== "paid") {
          const claimed = await db.paymentTransaction.updateMany({
            where: {
              id: result.transactionId,
              provider: "paymob",
              status: existingPayment!.status,
              providerReference: existingPayment!.providerReference,
              externalReference: existingPayment!.externalReference,
              providerPayload: existingPayment!.providerPayload,
            },
            data,
          });

          if (claimed.count !== 1) {
            // A webhook or retry won the race. Do not overwrite its data.
            return NextResponse.json(
              { received: false, message: "Concurrent payment update" },
              { status: 503 },
            );
          }
        }
      } else {
        // Preserve historical behavior for other providers.
        await db.paymentTransaction.update({
          where: { id: result.transactionId },
          data,
        });
      }
    }

    // Reload transaction after webhook evidence persistence.
    const updated = await db.paymentTransaction.findUnique({
      where: { id: result.transactionId },
      select: {
        externalReference: true,
        status: true,
        purpose: true,
        membershipId: true,
        metadata: true,
        amount: true,
        currency: true,
        referenceCode: true,
        providerReference: true,
      },
    });

    // A two-review no-charge settlement has already returned frozen
    // wallet/points and released seats. A later provider charge must go to
    // financial exception handling (refund or supervised compensation).
    // Never auto-reactivate and grant an unpaid membership benefit.
    if (
      providerKey === "paymob" &&
      result.status === "paid" &&
      updated?.status === "cancelled" &&
      updated.purpose === "membership"
    ) {
      let settledAt: unknown = null;
      try {
        const saved = JSON.parse(updated.metadata || "{}") as Record<string, unknown>;
        const review = saved.paymobNoChargeReview;
        if (review && typeof review === "object" && !Array.isArray(review)) {
          settledAt = (review as Record<string, unknown>).settledAt;
        }
      } catch {
        settledAt = null;
      }

      if (typeof settledAt === "string") {
        console.error("[PAYMOB_POST_MANUAL_RELEASE_CHARGE_REQUIRES_FINANCE_REVIEW]", {
          transactionId: result.transactionId,
        });
        return NextResponse.json(
          { received: false, message: "Financial exception needs reconciliation" },
          { status: 503 },
        );
      }
    }

    // CRITICAL: A late Paymob success may arrive after timeout cleanup already
    // cancelled both the payment and membership. Handle that case BEFORE
    // verifyPaymentTransaction(), because normal verification can promote the
    // payment to paid while a cancelled membership cannot be normally activated.
    if (
      providerKey === "paymob" &&
      result.status === "paid" &&
      updated?.externalReference &&
      updated.status === "cancelled" &&
      updated.purpose === "membership" &&
      updated.membershipId
    ) {
      const membership = await db.userMembership.findUnique({
        where: { id: updated.membershipId },
        select: { status: true },
      });

      let timeoutSnapshot: Record<string, unknown> | null = null;

      if (updated.metadata) {
        try {
          const parsed = JSON.parse(updated.metadata) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const snapshot = (parsed as Record<string, unknown>).deletedBookingsSnapshot;
            if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
              timeoutSnapshot = snapshot as Record<string, unknown>;
            }
          }
        } catch {
          timeoutSnapshot = null;
        }
      }

      const isTimeoutCancelledRecovery =
        membership?.status === "cancelled" &&
        timeoutSnapshot?.reason === "timeout_cleanup" &&
        timeoutSnapshot?.userMembershipId === updated.membershipId;

      if (isTimeoutCancelledRecovery) {
        // Missing canonical linkage is unsafe to recover and must NOT fall
        // through to normal verification, which could create paid/cancelled
        // inconsistency.
        if (!updated.providerReference || !updated.referenceCode) {
          console.error(
            `[WEBHOOK:${providerKey}] Timeout recovery blocked: canonical payment evidence is incomplete`,
            {
              transactionId: result.transactionId,
              hasProviderReference: Boolean(updated.providerReference),
              hasReferenceCode: Boolean(updated.referenceCode),
            },
          );

          return NextResponse.json({ received: true });
        }

        try {
          await recoverVerifiedPaymobPayment({
            paymentTransactionId: result.transactionId,
            paymobTransactionId: updated.externalReference,
            expectedAmount: updated.amount,
            expectedCurrency: updated.currency,
            expectedFitZoneReference: updated.referenceCode,
            expectedIntentionId: updated.providerReference,
          });

          console.info(
            `[WEBHOOK:${providerKey}] Late timeout-cancelled payment recovered safely`,
            { transactionId: result.transactionId },
          );

          return NextResponse.json({ received: true });
        } catch (error: unknown) {
          console.error(
            `[WEBHOOK:${providerKey}] Late timeout recovery rejected`,
            error,
          );

          // Do NOT fall through to verifyPaymentTransaction().
          // Recovery performs authoritative remote Paymob verification and
          // intentionally leaves local cancelled state untouched on failure.
          return NextResponse.json({ received: true });
        }
      }
    }

    // Paid membership payments must complete both payment verification and
    // membership activation. A webhook retry also repairs the crash window
    // where the payment became paid but the membership remained pending_payment.
    if (updated?.externalReference) {
      try {
        const verified = await verifyPaymentTransaction(result.transactionId);

        if (verified.status === "paid") {
          const friendFinalization =
            await maybeFinalizeFriendOfferPayment(result.transactionId);

          if (friendFinalization.kind === "friend_offer") {
            console.info(
              `[WEBHOOK:${providerKey}] Friend offer payment processed`,
              {
                transactionId: result.transactionId,
                groupId: friendFinalization.groupId,
                status: friendFinalization.status,
              },
            );
          } else {
            const linkedPayment = await db.paymentTransaction.findUnique({
              where: { id: result.transactionId },
              select: { membershipId: true, purpose: true },
            });

            if (
              linkedPayment?.purpose === "membership" &&
              linkedPayment.membershipId
            ) {
              const membership = await db.userMembership.findUnique({
                where: { id: linkedPayment.membershipId },
                select: { status: true },
              });

              if (membership?.status === "pending_payment") {
                await recoverPaidMembershipActivation(result.transactionId);
              }
            }
          }
        }
      } catch (error: unknown) {
        console.error(
          `[WEBHOOK:${providerKey}] Verification after webhook failed`,
          error,
        );

        // NEVER promote a payment to paid solely because verification threw.
        // A signed failed callback may still close a genuinely failed attempt.
        if (result.status === "failed") {
          await updatePaymentTransactionStatus(
            result.transactionId,
            "failed",
            result.message ?? null,
          ).catch(() => null);
        }
      }
    } else if (result.status === "failed") {
      // Failed callbacks have no activation side effect.
      await updatePaymentTransactionStatus(
        result.transactionId,
        "failed",
        result.message ?? null,
      ).catch((error: unknown) => {
        console.error(
          `[WEBHOOK:${providerKey}] Failed to persist failed status`,
          error,
        );
      });
    } else if (result.status === "paid") {
      // A paid callback without a transaction reference must not activate
      // anything. Wait for a verifiable Paymob transaction reference.
      console.error(
        `[WEBHOOK:${providerKey}] Paid callback has no externalReference; leaving transaction unactivated`,
      );
    } else if (
      result.status === "cancelled" ||
      result.status === "expired"
    ) {
      await updatePaymentTransactionStatus(
        result.transactionId,
        result.status,
        result.message ?? null,
      ).catch((error: unknown) => {
        console.error(
          `[WEBHOOK:${providerKey}] Failed to persist terminal state`,
          error,
        );
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK:${providerKey}] Unexpected error`, error);
    return NextResponse.json({ received: true });
  }
}
