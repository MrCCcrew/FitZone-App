import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("subscribe commission/referral wiring guard", () => {
  it("accrues only immediately-final subscriptions and leaves pending Paymob referrals for reconciliation", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/subscribe/route.ts"),
      "utf8",
    );

    expect(source).toContain(
      "await buildMembershipCommissionSnapshotTx(",
    );

    expect(source).toContain(
      "await accrueMembershipCommissionsTx(",
    );

    const accrualCall = source.indexOf(
      "await accrueMembershipCommissionsTx(",
    );

    expect(accrualCall).toBeGreaterThan(-1);

    const immediateGuard = source.lastIndexOf(
      "if (!needsPaymentConfirmation)",
      accrualCall,
    );

    expect(immediateGuard).toBeGreaterThan(-1);
    expect(immediateGuard).toBeLessThan(accrualCall);

    // Pending SalesAgent attribution remains captured, but not converted/spent.
    expect(source).toContain(
      "await tx.salesAgentReferral.create({",
    );
    expect(source).toContain("convertedAt: null");
    expect(source).toContain("totalSpent: 0");

    // Old non-atomic post-commit referral consumption must stay gone.
    const checkoutStart = source.indexOf(
      "let checkoutUrl: string | null = null;",
    );

    const postTransactionPrefix = source.slice(
      Math.max(0, checkoutStart - 1600),
      checkoutStart,
    );

    for (const field of [
      "pendingPartnerRef: null",
      "pendingAgentRef: null",
      "pendingStaffRef: null",
      "pendingTrainerRef: null",
      "pendingNutritionRef: null",
    ]) {
      expect(postTransactionPrefix).not.toContain(field);
    }
  });

  it("has no direct membership commission writers left in subscribe", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/subscribe/route.ts"),
      "utf8",
    );

    for (const writer of [
      "partnerCommission.create(",
      "agentCommission.create(",
      "salesAgentCommission.create(",
      "managerCommission.create(",
      "managerPartnerCommission.create(",
      "staffCommission.create(",
      "trainerCommission.create(",
      "nutritionCommission.create(",
    ]) {
      expect(source).not.toContain(writer);
    }
  });
});
