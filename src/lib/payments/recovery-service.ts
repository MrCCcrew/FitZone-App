/**
 * CLI-safe recovery service for standalone scripts.
 * Does not import Next.js server-only or analytics modules.
 */

import { db } from "@/lib/db";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";
import { activatePaidMembershipTx } from "@/lib/payments/activation-shared";

/**
 * Map payment transaction to return type.
 * Simplified version without analytics dependencies.
 */
function mapPaymentTransaction(transaction: any) {
  return {
    id: transaction.id,
    referenceCode: transaction.referenceCode,
    provider: transaction.provider,
    purpose: transaction.purpose,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    paymentMethod: transaction.paymentMethod,
    orderId: transaction.orderId,
    membershipId: transaction.membershipId,
    offerId: transaction.offerId,
    checkoutUrl: transaction.checkoutUrl,
    iframeUrl: transaction.iframeUrl,
    providerReference: transaction.providerReference,
    externalReference: transaction.externalReference,
    returnUrl: transaction.returnUrl,
    cancelUrl: transaction.cancelUrl,
    payload: null,
    metadata: null,
    expiresAt: transaction.expiresAt,
    paidAt: transaction.paidAt ?? null,
    failedAt: transaction.failedAt ?? null,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  };
}

/**
 * Recovery function for payments already marked "paid" but with pending memberships.
 * CLI-safe version without analytics imports.
 */
export async function recoverPaidMembershipActivation(paymentTransactionId: string) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  if (!payment) {
    throw new Error("Payment transaction not found");
  }

  if (payment.status !== "paid") {
    throw new Error(
      `Recovery rejected: Payment status is "${payment.status}", expected "paid"`
    );
  }

  if (!payment.membershipId) {
    throw new Error("Recovery rejected: No membership linked to this payment");
  }

  const membership = await db.userMembership.findUnique({
    where: { id: payment.membershipId },
    select: { status: true },
  });

  if (!membership) {
    throw new Error("Recovery rejected: Membership not found");
  }

  if (membership.status === "active") {
    console.info(
      `[RECOVERY] Membership ${payment.membershipId} already active - idempotent return`
    );
    return mapPaymentTransaction(payment);
  }

  if (membership.status !== "pending_payment") {
    throw new Error(
      `Recovery rejected: Membership status is "${membership.status}", expected "pending_payment"`
    );
  }

  console.info(`[RECOVERY] Activating paid membership ${payment.membershipId} for payment ${paymentTransactionId}`);

  let activationSucceeded = false;
  let membershipData: any | null = null;

  await db.$transaction(async (tx) => {
    const result = await activatePaidMembershipTx(
      tx,
      paymentTransactionId,
      payment.membershipId!
    );
    activationSucceeded = result.success;
    membershipData = result.membershipData;
  });

  if (!activationSucceeded || !membershipData) {
    throw new Error("Recovery failed: Membership activation unsuccessful");
  }

  console.info(`[RECOVERY] Membership activated, running post-activation reconciliation`);

  await runPaidMembershipPostActivationReconciliation({
    transactionId: paymentTransactionId,
    userId: payment.userId,
    userMembershipId: payment.membershipId,
    membershipData,
    paymentAmount: payment.amount,
    paymentMethod: payment.paymentMethod,
    paidAt: payment.paidAt,
    transactionMetadata: payment.metadata,
  });

  const recovered = await db.paymentTransaction.findUnique({
    where: { id: paymentTransactionId },
  });

  console.info(`[RECOVERY] Successfully recovered payment ${paymentTransactionId}`);
  return mapPaymentTransaction(recovered!);
}

/**
 * Verify payment transaction (simplified for CLI).
 * For full verification with Paymob, use the service.ts version.
 */
export async function verifyPaymentTransaction(transactionId: string) {
  // Import dynamically to avoid server-only in CLI context
  const { verifyPaymentTransaction: serviceVerify } = await import("@/lib/payments/service");
  return serviceVerify(transactionId);
}
