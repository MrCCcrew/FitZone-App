import "server-only";

import {
  inquirePaymobTransactionByMerchantReference,
  inquirePaidPaymobOrderAttemptsForRecovery,
} from "@/lib/payments/providers/paymob";

import {
  recoverVerifiedPaymobPayment,
  recoverPaidMembershipActivation,
} from "@/lib/payments/service";

import type {
  PaymobAutoRecoveryDiscoveryDependencies,
} from "./paymob-auto-recovery-discovery";

export const paymobAutoRecoveryDependencies:
  PaymobAutoRecoveryDiscoveryDependencies = {
  inquire: inquirePaymobTransactionByMerchantReference,
  inquireOrderAttempts: inquirePaidPaymobOrderAttemptsForRecovery,

  recoverVerified: async (identity) => {
    const recovered = await recoverVerifiedPaymobPayment(identity);

    return {
      status: recovered.status,
    };
  },
};

/**
 * Only use after re-reading the current payment and membership
 * and proving payment.status === "paid".
 *
 * Never call for cancelled or expired memberships.
 */
export async function repairAlreadyPaidMembership(
  paymentTransactionId: string,
) {
  return recoverPaidMembershipActivation(paymentTransactionId);
}
