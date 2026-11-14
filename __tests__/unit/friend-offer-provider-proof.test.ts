import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  transaction: vi.fn(),
  verifier: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { friendOfferParticipant: { findUnique: mocks.findUnique }, $transaction: mocks.transaction },
}));
vi.mock("@/lib/payments/registry", () => ({ getPaymentProvider: mocks.provider }));

import { prepareIndependentFriendEntitlement } from "@/lib/payments/friend-offer-independent-preparation";
const attempt = {
  id: "pay-1", provider: "paymob", status: "paid", userId: "user-1",
  providerReference: "int-1", externalReference: "ext-1", amount: 100,
  currency: "EGP", metadata: null, providerPayload: null,
};
function candidate(overrides = {}) {
  return { id: "part-1", paymentTransactionId: "pay-1", paymentTransaction: { ...attempt, ...overrides } };
}
describe("Friend independent Paymob proof is checked before writes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue(candidate());
    mocks.provider.mockReturnValue({ verifyTransaction: mocks.verifier });
  });
  it("rejects invalid participant without query or transaction", async () => {
    await expect(prepareIndependentFriendEntitlement({participantId: ""})).rejects.toThrow("FRIEND_INDEPENDENT_IDENTITY_REQUIRED");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects non-Paymob payments before invoking provider", async () => {
    mocks.findUnique.mockResolvedValue(candidate({provider: "internal"}));
    await expect(prepareIndependentFriendEntitlement({participantId: "part-1"})).rejects.toThrow("FRIEND_INDEPENDENT_PAYMENT_NOT_VERIFIABLE");
    expect(mocks.verifier).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects missing provider without transaction", async () => {
    mocks.provider.mockReturnValue(null);
    await expect(prepareIndependentFriendEntitlement({participantId: "part-1"})).rejects.toThrow("FRIEND_INDEPENDENT_PROVIDER_UNAVAILABLE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects live unpaid Paymob order without transaction", async () => {
    mocks.verifier.mockResolvedValue({status: "pending"});
    await expect(prepareIndependentFriendEntitlement({participantId: "part-1"})).rejects.toThrow("FRIEND_INDEPENDENT_PAYMOB_ORDER_PROOF_REQUIRED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("rejects provider verification exceptions without writes", async () => {
    mocks.verifier.mockRejectedValue(new Error("PROVIDER_TIMEOUT"));
    await expect(prepareIndependentFriendEntitlement({participantId: "part-1"})).rejects.toThrow("PROVIDER_TIMEOUT");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("uses exact transaction identity with the live Order verifier", async () => {
    mocks.verifier.mockResolvedValue({status: "paid"});
    mocks.transaction.mockImplementation(() => Promise.resolve({ marker: "entered-locked-transaction" }));
    await expect(prepareIndependentFriendEntitlement({participantId: "part-1"})).resolves.toEqual({marker: "entered-locked-transaction"});
    expect(mocks.verifier).toHaveBeenCalledWith(expect.objectContaining({id: "pay-1", providerReference: "int-1", amount:100,currency:"EGP"}));
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
