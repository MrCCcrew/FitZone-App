/**
 * Fail-closed economic contract for an independently owned Friend Offer right.
 * This is a foundation ONLY; it does not activate bookings or post a journal.
 * The caller must separately validate fresh Paymob Order/Transaction proof.
 */
export type FriendIndependentProof = {
  participantId: string;
  userId: string;
  groupId: string;
  paymentTransactionId: string;
  amountMinor: number;
  currency: "EGP";
  groupSize: number;
  requiredMembers: number;
  groupFullyPaid: boolean;
  providerOrderVerified: boolean;
  isHistoricMembershipLinked: boolean;
};

export function assertIndependentFriendEntitlementProof(
  proof: FriendIndependentProof,
): void {
  if (!proof || !proof.participantId?.trim() ||
      !proof.userId?.trim() || !proof.groupId?.trim() ||
      !proof.paymentTransactionId?.trim()) {
    throw new Error("FRIEND_INDEPENDENT_IDENTITY_REQUIRED");
  }
  if (!Number.isSafeInteger(proof.amountMinor) || proof.amountMinor <= 0 ||
      proof.currency !== "EGP") {
    throw new Error("FRIEND_INDEPENDENT_PRICE_INVALID");
  }
  if (!Number.isSafeInteger(proof.requiredMembers) ||
      proof.requiredMembers < 2 ||
      proof.requiredMembers > 10 ||
      proof.groupSize !== proof.requiredMembers ||
      proof.groupFullyPaid !== true) {
    throw new Error("FRIEND_INDEPENDENT_GROUP_INCOMPLETE");
  }
  if (proof.providerOrderVerified !== true) {
    throw new Error("FRIEND_INDEPENDENT_PAYMOB_ORDER_PROOF_REQUIRED");
  }
  if (proof.isHistoricMembershipLinked) {
    throw new Error("FRIEND_INDEPENDENT_HISTORIC_OWNER_IMMUTABLE");
  }
}
