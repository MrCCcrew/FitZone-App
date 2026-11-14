import { describe, expect, it } from "vitest";
import { assertIndependentFriendEntitlementProof } from "@/lib/payments/friend-offer-independent-contract";

const paid = () => ({ participantId: "p", userId: "u", groupId: "g",
  paymentTransactionId: "tx", amountMinor: 4500, currency: "EGP" as const,
  groupSize: 3, requiredMembers: 3, groupFullyPaid: true,
  providerOrderVerified: true, isHistoricMembershipLinked: false });

describe("independent friend entitlement fail-closed economic contract", () => {
  it("accepts a fully verified group without membership ownership", () => {
    expect(() => assertIndependentFriendEntitlementProof(paid())).not.toThrow();
  });
  it("does not grant rights for an incomplete group", () => {
    expect(() => assertIndependentFriendEntitlementProof({...paid(),groupSize:2})).toThrow("FRIEND_INDEPENDENT_GROUP_INCOMPLETE");
  });
  it("refuses local paid status without Paymob Order proof", () => {
    expect(() => assertIndependentFriendEntitlementProof({...paid(),providerOrderVerified:false})).toThrow("FRIEND_INDEPENDENT_PAYMOB_ORDER_PROOF_REQUIRED");
  });
  it("does not rewrite historical membership owners", () => {
    expect(() => assertIndependentFriendEntitlementProof({...paid(),isHistoricMembershipLinked:true})).toThrow("FRIEND_INDEPENDENT_HISTORIC_OWNER_IMMUTABLE");
  });
  it("rejects zero and negative values", () => {
    expect(() => assertIndependentFriendEntitlementProof({...paid(),amountMinor:0})).toThrow("FRIEND_INDEPENDENT_PRICE_INVALID");
  });
});
