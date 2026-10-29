import {
  classifyPaymobRecoveryCandidate,
  type PaymobRecoveryCandidateInput,
} from "./paymob-auto-recovery-candidate";

export type PaymobRecoveryDispatch =
  | "skip"
  | "inquire_only"
  | "repair_paid_membership"
  | "manual_review";

export function decidePaymobRecoveryDispatch(
  input: PaymobRecoveryCandidateInput,
): PaymobRecoveryDispatch {
  const candidate = classifyPaymobRecoveryCandidate(input);

  if (candidate === "skip") return "skip";

  if (candidate === "verify_provider") {
    // Discovery is not authorization to activate or update a payment.
    return "inquire_only";
  }

  if (
    candidate === "repair_paid_activation" &&
    input.paymentStatus === "paid" &&
    ["pending_payment", "active"].includes(input.membershipStatus ?? "")
  ) {
    return "repair_paid_membership";
  }

  return "manual_review";
}
