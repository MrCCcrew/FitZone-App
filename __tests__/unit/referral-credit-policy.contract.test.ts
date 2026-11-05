import { describe, expect, it, vi } from "vitest";

type PurchaseKind =
  | "subscription"
  | "package"
  | "offer"
  | "trial"
  | "store";

type AllowanceInput = {
  purchaseKind: PurchaseKind;
  referralBalance: number;
  amountDue: number;
};

type AllowanceResult = {
  eligible: boolean;
  maxUsableReferral: number;
  reason?: string;
};

type AllocationInput = {
  purchaseKind: PurchaseKind;
  walletBalance: number;
  referralBalance: number;
  requestedWalletDeduct: number;
  amountDue: number;
};

type AllocationResult = {
  generalDeduct: number;
  referralDeduct: number;
  totalDeduct: number;
};

type PolicyModule = {
  REFERRAL_MIN_USABLE_EGP: number;
  REFERRAL_MAX_PER_SUBSCRIPTION_EGP: number;

  resolveReferralCreditAllowance(
    input: AllowanceInput,
  ): AllowanceResult;

  allocateWalletDeductionBySource(
    input: AllocationInput,
  ): AllocationResult;

  REFERRAL_CREDIT_MESSAGES?: {
    belowMinimum?: string;
    maxPerSubscription?: string;
    ineligiblePurchase?: string;
    storeRestricted?: string;
  };
};

async function loadPolicy(): Promise<PolicyModule | null> {
  try {
    return await vi.importActual<PolicyModule>(
      "@/lib/referral-credit-policy",
    );
  } catch {
    return null;
  }
}

async function requirePolicy() {
  const policy = await loadPolicy();

  expect(
    policy,
    "src/lib/referral-credit-policy.ts must exist before these contracts can pass",
  ).not.toBeNull();

  return policy;
}

describe("referral credit business policy contract", () => {
  it("locks the minimum usable referral balance at 100 EGP", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(policy.REFERRAL_MIN_USABLE_EGP).toBe(100);
  });

  it("locks the maximum referral deduction per subscription at 150 EGP", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.REFERRAL_MAX_PER_SUBSCRIPTION_EGP,
    ).toBe(150);
  });

  it("does not allow referral credit in the store", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "store",
        referralBalance: 500,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: false,
      maxUsableReferral: 0,
    });
  });

  it("does not allow referral credit on packages", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "package",
        referralBalance: 500,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: false,
      maxUsableReferral: 0,
    });
  });

  it("does not allow referral credit on offers", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "offer",
        referralBalance: 500,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: false,
      maxUsableReferral: 0,
    });
  });

  it("does not allow referral credit on trial/free-class memberships", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "trial",
        referralBalance: 500,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: false,
      maxUsableReferral: 0,
    });
  });

  it("does not allow 50 EGP referral balance on a subscription", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "subscription",
        referralBalance: 50,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: false,
      maxUsableReferral: 0,
    });
  });

  it("allows exactly 100 EGP once the referral threshold is reached", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "subscription",
        referralBalance: 100,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: true,
      maxUsableReferral: 100,
    });
  });

  it("allows 130 EGP when referral balance is 130 EGP", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "subscription",
        referralBalance: 130,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: true,
      maxUsableReferral: 130,
    });
  });

  it("caps a 200 EGP referral balance at 150 EGP per subscription", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "subscription",
        referralBalance: 200,
        amountDue: 1000,
      }),
    ).toMatchObject({
      eligible: true,
      maxUsableReferral: 150,
    });
  });

  it("never allows referral credit above the amount actually due", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.resolveReferralCreditAllowance({
        purchaseKind: "subscription",
        referralBalance: 200,
        amountDue: 120,
      }),
    ).toMatchObject({
      eligible: true,
      maxUsableReferral: 120,
    });
  });

  it("keeps referral credit unavailable while preserving legitimate general wallet credit in store", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.allocateWalletDeductionBySource({
        purchaseKind: "store",
        walletBalance: 200,
        referralBalance: 150,
        requestedWalletDeduct: 100,
        amountDue: 1000,
      }),
    ).toEqual({
      generalDeduct: 50,
      referralDeduct: 0,
      totalDeduct: 50,
    });
  });

  it("uses at most 150 EGP referral credit and can use general credit for the remainder on a subscription", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    expect(
      policy.allocateWalletDeductionBySource({
        purchaseKind: "subscription",
        walletBalance: 300,
        referralBalance: 200,
        requestedWalletDeduct: 200,
        amountDue: 1000,
      }),
    ).toEqual({
      generalDeduct: 50,
      referralDeduct: 150,
      totalDeduct: 200,
    });
  });

  it("exposes friendly customer-facing referral restriction messages", async () => {
    const policy = await requirePolicy();
    if (!policy) return;

    const messages =
      policy.REFERRAL_CREDIT_MESSAGES;

    expect(messages).toBeTruthy();

    if (!messages) return;

    expect(messages.belowMinimum).toContain("100");
    expect(messages.maxPerSubscription).toContain("150");
    expect(messages.ineligiblePurchase).toContain("الاشتراكات");
    expect(messages.storeRestricted).toContain("المتجر");
  });
});