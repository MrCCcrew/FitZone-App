import { randomUUID } from "node:crypto";
import { asDbTransactionClient, db } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import type { SubscribeAttemptFingerprint } from "@/lib/payments/pending-membership-cleanup";
import type { PaymentCheckoutInput } from "@/lib/payments/types";
import { renewExistingMembershipPaymobIntention } from "@/lib/payments/providers/paymob";

type HandoffResult =
  | { kind: "none" }
  | { kind: "blocked" }
  | {
      kind: "resumed";
      membershipId: string;
      transactionId: string;
      endDate: Date;
      checkoutUrl: string;
    };

function parseRecord(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const result: unknown = JSON.parse(value);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return null;
    }
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

function samePurchase(
  stored: unknown,
  requested: SubscribeAttemptFingerprint,
): boolean {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return false;
  }

  // Exact identity: schedules, discounts, wallet, points, attribution.
  // Fail closed for old or incompatible fingerprint formats.
  return JSON.stringify(stored) === JSON.stringify(requested);
}

/**
 * Reopen an existing Paymob Intention for the SAME pending membership.
 *
 * No new membership, booking, payment row, wallet deduction, or hold.
 * The retrying state is a durable, fail-closed claim.
 *
 * A crash or ambiguous provider response intentionally leaves the
 * payment blocked for reconciliation rather than risking double payment.
 */
export async function maybeRenewPendingMembershipCheckout(input: {
  userId: string;
  fingerprint: SubscribeAttemptFingerprint;
  customer: PaymentCheckoutInput["customer"];
}): Promise<HandoffResult> {
  if (input.customer.id !== input.userId) {
    return { kind: "blocked" };
  }

  if (input.fingerprint.paymentMethod !== "paymob") {
    return { kind: "none" };
  }

  const sourceWhere = input.fingerprint.offerId
    ? { offerId: input.fingerprint.offerId }
    : input.fingerprint.membershipId
      ? {
          membershipId: input.fingerprint.membershipId,
          offerId: null,
        }
      : null;

  if (!sourceWhere) return { kind: "none" };

  const claimed = await db.$transaction(async (tx) => {
    await lockMembershipLifecycleUserTx(
      asDbTransactionClient(tx),
      input.userId,
    );

    const now = new Date();

    const memberships = await tx.userMembership.findMany({
      where: {
        userId: input.userId,
        status: "pending_payment",
        ...sourceWhere,
      },
      select: {
        id: true,
        endDate: true,
        pendingExpiresAt: true,
      },
    });

    if (memberships.length === 0) {
      return { kind: "none" } as const;
    }

    if (memberships.length !== 1) {
      return { kind: "blocked" } as const;
    }

    /*
     * PRODUCTION PAYMOB COMPATIBILITY GATE
     *
     * The existing Live Paymob configuration and normal checkout path are
     * unchanged. Updating an expired provider Intention is an additional,
     * independently unverified payment operation, NOT evidence of how the
     * currently successful Live integration behaves.
     *
     * Disabled by default: keep the original pending membership and all its
     * wallet, points and booking reservations intact, and do not claim the
     * payment as "retrying" or contact Paymob. Enable only after verified
     * provider acceptance and a separately approved release gate.
     */
    if (process.env.PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED !== "true") {
      return { kind: "blocked" } as const;
    }

    const membership = memberships[0];


    const payments = await tx.paymentTransaction.findMany({
      where: {
        userId: input.userId,
        membershipId: membership.id,
        purpose: "membership",
      },
      select: {
        id: true,
        provider: true,
        providerReference: true,
        providerPayload: true,
        externalReference: true,
        metadata: true,
        amount: true,
        currency: true,
        status: true,
        expiresAt: true,
      },
    });

    // Multiple payment owners, or no payment record, require review.
    if (payments.length !== 1) {
      return { kind: "blocked" } as const;
    }

    const payment = payments[0];
    const metadata = parseRecord(payment.metadata);
    const providerData = parseRecord(payment.providerPayload);

    if (
      payment.provider !== "paymob" ||
      !samePurchase(
        metadata?.subscribeAttemptFingerprint,
        input.fingerprint,
      ) ||
      !providerData ||
      providerData.providerMode !== "paymob_unified_checkout" ||
      !payment.providerReference ||
      !payment.expiresAt
    ) {
      return { kind: "blocked" } as const;
    }

    const recovery = metadata?.bookingRecoveryData;

    if (
      !recovery ||
      typeof recovery !== "object" ||
      Array.isArray(recovery)
    ) {
      return { kind: "blocked" } as const;
    }

    const selected = (recovery as Record<string, unknown>)
      .selectedScheduleIds;

    if (
      !Array.isArray(selected) ||
      JSON.stringify([...selected].sort()) !==
        JSON.stringify([...input.fingerprint.scheduleIds].sort())
    ) {
      return { kind: "blocked" } as const;
    }

    // A still-live checkout is handled by the existing resume path.
    if (
      ["pending", "requires_action"].includes(payment.status) &&
      payment.expiresAt > now
    ) {
      return { kind: "blocked" } as const;
    }

    /*
     * STALE_PAYMOB_RENEWAL_POSITIVE_RECOVERY
     * A stale renewal claim never proves non-payment.
     */
    if (payment.status === "retrying") {
      const claim = providerData.renewalClaim;
      const claimedAt =
        claim && typeof claim === "object" && !Array.isArray(claim)
          ? (claim as Record<string, unknown>).claimedAt
          : null;

      const claimedTime =
        typeof claimedAt === "string" ? Date.parse(claimedAt) : NaN;

      if (
        !Number.isFinite(claimedTime) ||
        claimedTime > now.getTime() ||
        now.getTime() - claimedTime < 90_000
      ) {
        return { kind: "blocked" } as const;
      }

      return { kind: "reconcile", membership, payment } as const;
    }

    // Positive reconciliation above is allowed even after expiry.
    // Normal checkout renewal is never allowed past the original hold.
    if (
      !membership.pendingExpiresAt ||
      membership.pendingExpiresAt.getTime() <= now.getTime() + 45_000
    ) {
      return { kind: "blocked" } as const;
    }

    if (
      ![
        "pending",
        "requires_action",
        "failed",
        "cancelled",
        "expired",
      ].includes(payment.status)
    ) {
      return { kind: "blocked" } as const;
    }

    const nonce = randomUUID();

    const claimedPayload = JSON.stringify({
      ...providerData,
      renewalClaim: {
        id: nonce,
        claimedAt: now.toISOString(),
      },
    });

    const update = await tx.paymentTransaction.updateMany({
      where: {
        id: payment.id,
        userId: input.userId,
        membershipId: membership.id,
        provider: "paymob",
        status: payment.status,
        providerPayload: payment.providerPayload,
      },
      data: {
        status: "retrying",
        providerPayload: claimedPayload,
      },
    });

    if (update.count !== 1) {
      return { kind: "blocked" } as const;
    }

    return {
      kind: "claimed",
      membership,
      payment,
      claimedPayload,
    } as const;
  });

  if (claimed.kind === "reconcile") {
    if (claimed.payment.externalReference) {
      return { kind: "blocked" };
    }

    try {
      const { paymobPaymentProvider } =
        await import("@/lib/payments/providers/paymob");

      const proof = await paymobPaymentProvider.verifyTransaction({
        id: claimed.payment.id,
        providerReference: claimed.payment.providerReference,
        externalReference: null,
        amount: claimed.payment.amount,
        currency: claimed.payment.currency,
        metadata: claimed.payment.metadata,
        providerPayload: claimed.payment.providerPayload,
      });

      if (
        proof.status !== "paid" ||
        !proof.externalReference ||
        !/^[0-9]+$/.test(proof.externalReference)
      ) {
        return { kind: "blocked" };
      }

      const previousPayload =
        parseRecord(claimed.payment.providerPayload);

      if (!previousPayload) {
        return { kind: "blocked" };
      }

      const linked = await db.paymentTransaction.updateMany({
        where: {
          id: claimed.payment.id,
          userId: input.userId,
          membershipId: claimed.membership.id,
          provider: "paymob",
          status: "retrying",
          providerPayload: claimed.payment.providerPayload,
        },
        data: {
          externalReference: proof.externalReference,
          providerReference:
            proof.providerReference ??
            claimed.payment.providerReference,
          providerPayload: JSON.stringify(
            proof.payload ?? previousPayload,
          ),
        },
      });

      if (linked.count !== 1) {
        return { kind: "blocked" };
      }

      const { updatePaymentTransactionStatus } =
        await import("@/lib/payments/service");

      await updatePaymentTransactionStatus(
        claimed.payment.id,
        "paid",
      );
    } catch (error) {
      console.warn("[PAYMOB_STALE_RENEWAL_RECONCILIATION]", {
        errorType:
          error instanceof Error ? error.name : "unknown",
      });
    }

    return { kind: "blocked" };
  }

  if (claimed.kind !== "claimed") {
    return claimed;
  }

  /*
   * Never hold a MySQL transaction while calling Paymob.
   *
   * Paymob must return an explicitly unconfirmed update to
   * the SAME intention and order. The provider helper verifies this.
   */
  let renewed: Awaited<
    ReturnType<typeof renewExistingMembershipPaymobIntention>
  >;

  try {
    renewed = await renewExistingMembershipPaymobIntention({
      transactionId: claimed.payment.id,
      providerReference: claimed.payment.providerReference,
      providerPayload: claimed.payment.providerPayload,
      amount: claimed.payment.amount,
      currency: claimed.payment.currency,
      pendingExpiresAt: claimed.membership.pendingExpiresAt!,
      customer: input.customer,
    });
  } catch (error) {
    // Ambiguous results stay retrying and require reconciliation.
    // Do not undo the durable claim or expose provider credentials.
    console.error("[MEMBERSHIP_PAYMOB_RENEWAL_BLOCKED]", {
      errorType:
        error instanceof Error ? error.name : "unknown",
    });
    return { kind: "blocked" };
  }

  return db.$transaction(async (tx): Promise<HandoffResult> => {
    await lockMembershipLifecycleUserTx(
      asDbTransactionClient(tx),
      input.userId,
    );

    const now = new Date();

    const membership = await tx.userMembership.findUnique({
      where: { id: claimed.membership.id },
      select: {
        userId: true,
        status: true,
        pendingExpiresAt: true,
      },
    });

    if (
      !membership ||
      membership.userId !== input.userId ||
      membership.status !== "pending_payment" ||
      !membership.pendingExpiresAt ||
      membership.pendingExpiresAt <= now ||
      renewed.expiresAt >= membership.pendingExpiresAt
    ) {
      return { kind: "blocked" };
    }

    let url: URL;
    try {
      url = new URL(renewed.checkoutUrl);
    } catch {
      return { kind: "blocked" };
    }

    if (
      url.protocol !== "https:" ||
      url.pathname !== "/unifiedcheckout/"
    ) {
      return { kind: "blocked" };
    }

    const nextPayload = {
      ...renewed.providerPayload,
      previousExternalReference:
        claimed.payment.externalReference ?? null,
      renewalCompletedAt: now.toISOString(),
    };

    const finalized = await tx.paymentTransaction.updateMany({
      where: {
        id: claimed.payment.id,
        userId: input.userId,
        membershipId: claimed.membership.id,
        status: "retrying",
        providerPayload: claimed.claimedPayload,
      },
      data: {
        status: "pending",
        checkoutUrl: renewed.checkoutUrl,
        expiresAt: renewed.expiresAt,
        providerReference: renewed.providerReference,
        externalReference: null,
        providerPayload: JSON.stringify(nextPayload),
      },
    });

    if (finalized.count !== 1) {
      return { kind: "blocked" };
    }

    return {
      kind: "resumed",
      membershipId: claimed.membership.id,
      transactionId: claimed.payment.id,
      endDate: claimed.membership.endDate,
      checkoutUrl: renewed.checkoutUrl,
    };
  });
}