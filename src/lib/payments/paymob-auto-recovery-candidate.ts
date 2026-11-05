/**
 * Pure candidate classification only.
 *
 * Never interprets a locally pending, failed, expired or cancelled
 * transaction as evidence that Paymob collected money.
 *
 * Provider verification and membership activation belong to separate,
 * guarded stages.
 */

export type PaymobRecoveryCandidateInput = {
  purpose: string;
  provider: string;
  paymentStatus: string;
  membershipStatus: string | null;
  membershipId: string | null;
  reconciliationCompleted: boolean;
};

export type PaymobRecoveryCandidateDecision =
  | "skip"
  | "verify_provider"
  | "repair_paid_activation";

export function classifyPaymobRecoveryCandidate(
  input: PaymobRecoveryCandidateInput,
): PaymobRecoveryCandidateDecision {
  if (
    input.purpose !== "membership" ||
    input.provider !== "paymob" ||
    !input.membershipId ||
    !input.membershipStatus
  ) {
    return "skip";
  }

  if (
    input.paymentStatus === "paid" &&
    input.membershipStatus === "pending_payment"
  ) {
    return "repair_paid_activation";
  }

  if (
    input.paymentStatus === "paid" &&
    input.membershipStatus === "active" &&
    !input.reconciliationCompleted
  ) {
    return "repair_paid_activation";
  }

  if (input.paymentStatus === "paid") {
    return "skip";
  }

  if (
    ["pending", "requires_action", "processing", "expired", "cancelled", "failed"]
      .includes(input.paymentStatus) &&
    ["pending_payment", "cancelled"].includes(input.membershipStatus)
  ) {
    return "verify_provider";
  }

  return "skip";
}
