import type { Prisma } from "@prisma/client";

/**
 * Read-only candidate query contract.
 *
 * This function only constructs a Prisma WHERE object.
 * It does not query Paymob, mutate records, activate memberships,
 * or authorize financial recovery.
 *
 * All results require independent classification and verification.
 */
export function buildPaymobRecoveryCandidateWhere():
  Prisma.PaymentTransactionWhereInput {
  return {
    provider: "paymob",
    purpose: "membership",
    membershipId: { not: null },
    status: {
      in: [
        "pending",
        "requires_action",
        "processing",
        "failed",
        "cancelled",
        "expired",
        "paid",
      ],
    },
  };
}
