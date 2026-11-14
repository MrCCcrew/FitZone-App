import {describe, expect, it} from "vitest";
import {readFileSync} from "node:fs";
const src = (p:string) => readFileSync(p,"utf8");
describe("Consolidated independent financial settlement wiring", () => {
  it("does not route newly created groups to historical membership activation", () => {
    const f=src("src/lib/payments/friend-offer-finalization.ts");
    expect(f).toContain("return settleIndependentFriendOfferGroup(trimmedGroupId)");
    expect(f).toContain("if (group.individualInvitesEnabled === true)");
  });
  it("uses fresh provider verification for EVERY participant before serializable GL close", () => {
    const f=src("src/lib/payments/friend-offer-independent-settlement.ts");
    expect(f).toContain('verifyTransaction({');
    expect(f).toContain('verified.status !== "paid"');
    expect(f).toContain('TransactionIsolationLevel.Serializable');
    expect(f).toContain('FRIEND_INDEPENDENT_PAYMENT_PROOF_STALE');
    expect(f).toContain('metadata.friendParticipantId !== p.id');
  });
  it("never marks active without a fresh GL journal and frozen commission ledger", () => {
    const f=src("src/lib/payments/friend-offer-independent-settlement.ts");
    expect(f.indexOf('postIndependentFriendOfferJournal(')).toBeLessThan(f.indexOf('status: "active"'));
    expect(f.indexOf('accrueIndependentFriendCommissionsTx(')).toBeLessThan(f.lastIndexOf('status: "active"'));
    expect(f).toContain('FRIEND_INDEPENDENT_COMMISSION_SNAPSHOT_MISSING_MANUAL_REVIEW');
    expect(f).toContain('FRIEND_INDEPENDENT_UNMARKED_JOURNAL_MANUAL_REVIEW');
  });
  it("does not create or expire any UserMembership", () => {
    const f=src("src/lib/payments/friend-offer-independent-settlement.ts");
    expect(f).not.toContain('tx.userMembership.create');
    expect(f).not.toContain('tx.userMembership.updateMany');
    expect(f).not.toContain('bindMarketingFriendOfferToMembershipTx');
  });
  it("uses actual payment ID as GL idempotency key and freezes commission before external checkout", () => {
    const journal=src("src/lib/accounting-service.ts");
    const checkout=src("src/app/api/friend-offers/checkout/route.ts");
    expect(journal).toContain('"FriendOfferPayment", paymentTransactionId');
    expect(checkout.indexOf('buildMembershipCommissionSnapshotTx(')).toBeLessThan(checkout.indexOf('createPaymentTransaction({'));
  });
  it("supports independent friend commissions through the existing payout serializer", () => {
    const f=src("src/lib/commissions/commission-settlement-service.ts");
    expect(f).toContain('"friend_offer"');
    expect(f).toContain('table: "FriendOfferCommission"');
  });
});
