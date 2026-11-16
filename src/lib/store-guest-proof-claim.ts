import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

// Accept the minimum database capability needed by this helper.
// Compatible with Prisma transaction clients carrying extensions.
type GuestProofClaimTransaction = {
  guestCheckoutProof: {
    updateMany: (
      args: Prisma.GuestCheckoutProofUpdateManyArgs,
    ) => Promise<{ count: number }>;
  };
};
import {
  normalizeGuestPhone,
  readGuestPhoneGrant,
} from "@/lib/store-guest-verify";

export class GuestCheckoutProofError extends Error {
  constructor() {
    super("GUEST_CHECKOUT_PROOF_INVALID_OR_CONSUMED");
    this.name = "GuestCheckoutProofError";
  }
}

/**
 * Call inside the SAME Prisma transaction that creates the guest
 * order and reserves its inventory.
 *
 * On any failure, the caller must allow that transaction to roll back.
 * Do not catch this error inside the transaction and then commit.
 *
 * A successful claim can be associated with only one order.
 */
export async function claimGuestCheckoutProof(
  tx: GuestProofClaimTransaction,
  input: {
    token: string | null | undefined;
    recipientPhone: string;
    orderId: string;
  },
): Promise<void> {
  const grant = readGuestPhoneGrant(input.token);

  const phone = normalizeGuestPhone(input.recipientPhone);

  if (
    !grant ||
    !phone ||
    grant.phone !== phone ||
    !input.orderId ||
    typeof input.orderId !== "string"
  ) {
    throw new GuestCheckoutProofError();
  }

  const nonceHash = createHash("sha256")
    .update(grant.nonce)
    .digest("hex");

  const now = new Date();

  // Conditional UPDATE is atomic at the database level.
  // Exactly one concurrent caller can move consumedAt from NULL.
  const result = await tx.guestCheckoutProof.updateMany({
    where: {
      nonceHash,
      phone,
      consumedAt: null,
      orderId: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      consumedAt: now,
      orderId: input.orderId,
    },
  });

  if (result.count !== 1) {
    throw new GuestCheckoutProofError();
  }
}