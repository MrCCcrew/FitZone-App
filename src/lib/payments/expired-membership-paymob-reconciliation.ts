import { db } from "@/lib/db";
import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";
import {
  recoverPaidMembershipActivation,
  updatePaymentTransactionStatus,
} from "@/lib/payments/service";

export type ExpiredPaymobReconciliation =
  | { kind: "not_paymob" }
  | { kind: "paid_recovered" }
  | { kind: "unresolved" };

/**
 * POSITIVE-ONLY settlement of an expired pending membership.
 *
 * A failed/not-found/timeout inquiry is NOT evidence that every Paymob
 * payment attempt failed. Never release seats or restore customer funds
 * based on an inconclusive provider response.
 *
 * This helper is called by the authenticated cleanup cron. It does not
 * create a checkout, re-open an Intention, or extend the original hold.
 */
export async function reconcileExpiredPaymobMembership(
  membershipId: string,
): Promise<ExpiredPaymobReconciliation> {
  const payments = await db.paymentTransaction.findMany({
    where: {
      membershipId,
      purpose: "membership",
      provider: "paymob",
    },
    take: 2,
    select: {
      id: true,
      status: true,
      providerReference: true,
      externalReference: true,
      providerPayload: true,
      metadata: true,
      amount: true,
      currency: true,
    },
  });

  if (payments.length === 0) return { kind: "not_paymob" };
  if (payments.length !== 1) return { kind: "unresolved" };

  const payment = payments[0];

  if (payment.status === "paid") {
    // Repair a crash between paid status and membership activation.
    await recoverPaidMembershipActivation(payment.id);
    return { kind: "paid_recovered" };
  }

  const verification = await paymobPaymentProvider.verifyTransaction({
    id: payment.id,
    providerReference: payment.providerReference,
    externalReference: payment.externalReference,
    amount: payment.amount,
    currency: payment.currency,
    metadata: payment.metadata,
    providerPayload: payment.providerPayload,
  });

  if (
    verification.status !== "paid" ||
    !verification.externalReference ||
    !/^[0-9]+$/.test(verification.externalReference) ||
    (payment.externalReference &&
      payment.externalReference !== verification.externalReference)
  ) {
    return { kind: "unresolved" };
  }

  // Never update Paymob references from an unverified failed/pending
  // attempt. CAS prevents overwriting a concurrent renewal or webhook.
  const linked = await db.paymentTransaction.updateMany({
    where: {
      id: payment.id,
      provider: "paymob",
      status: payment.status,
      providerReference: payment.providerReference,
      externalReference: payment.externalReference,
      providerPayload: payment.providerPayload,
    },
    data: {
      providerReference:
        verification.providerReference ?? payment.providerReference,
      externalReference: verification.externalReference,
      providerPayload: JSON.stringify(
        verification.payload ?? JSON.parse(payment.providerPayload || "{}"),
      ),
    },
  });

  if (linked.count !== 1) {
    return { kind: "unresolved" };
  }

  const activated = await updatePaymentTransactionStatus(payment.id, "paid");

  if (activated.status !== "paid") {
    return { kind: "unresolved" };
  }

  return { kind: "paid_recovered" };
}
