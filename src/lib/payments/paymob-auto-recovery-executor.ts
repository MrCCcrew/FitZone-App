import {
  decidePaymobRecoveryDispatch,
} from "./paymob-auto-recovery-dispatch";
import type {
  PaymobRecoveryCandidateInput,
} from "./paymob-auto-recovery-candidate";

export type PaymobAutoRecoveryItem = PaymobRecoveryCandidateInput & {
  paymentId: string;
};

export type PaymobAutoRecoveryResult =
  | { kind: "skipped"; paymentId: string }
  | { kind: "unresolved"; paymentId: string }
  | { kind: "paid_repaired"; paymentId: string }
  | { kind: "manual_review"; paymentId: string }
  | { kind: "error"; paymentId: string; reason: string };

export type PaymobAutoRecoveryDependencies = {
  inquire: (paymentId: string) => Promise<"paid" | "unresolved">;
  repairPaid: (paymentId: string) => Promise<void>;
};

export async function processPaymobAutoRecoveryItem(
  item: PaymobAutoRecoveryItem,
  dependencies: PaymobAutoRecoveryDependencies,
): Promise<PaymobAutoRecoveryResult> {
  if (!item.paymentId.trim()) {
    return {
      kind: "error",
      paymentId: item.paymentId,
      reason: "INVALID_PAYMENT_ID",
    };
  }

  const dispatch = decidePaymobRecoveryDispatch(item);

  if (dispatch === "skip") {
    return { kind: "skipped", paymentId: item.paymentId };
  }

  if (dispatch === "manual_review") {
    return { kind: "manual_review", paymentId: item.paymentId };
  }

  try {
    if (dispatch === "inquire_only") {
      // Discovery does not authorize financial state mutation.
      // The later provider integration must apply fresh remote proof,
      // identity validation, and an atomic paid claim.
      await dependencies.inquire(item.paymentId);
      return { kind: "unresolved", paymentId: item.paymentId };
    }

    if (dispatch === "repair_paid_membership") {
      await dependencies.repairPaid(item.paymentId);
      return { kind: "paid_repaired", paymentId: item.paymentId };
    }

    return { kind: "manual_review", paymentId: item.paymentId };
  } catch (error) {
    return {
      kind: "error",
      paymentId: item.paymentId,
      reason: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    };
  }
}
