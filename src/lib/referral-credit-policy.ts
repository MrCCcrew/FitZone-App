export const REFERRAL_MIN_USABLE_EGP = 100;

export const REFERRAL_MAX_PER_SUBSCRIPTION_EGP = 150;

export type ReferralPurchaseKind =
  | "subscription"
  | "package"
  | "offer"
  | "trial"
  | "store";

export const REFERRAL_CREDIT_MESSAGES = {
  belowMinimum:
    "يمكنك استخدام رصيد الإحالة في الاشتراكات عندما يصل رصيدك المتاح إلى 100 جنيه أو أكثر. استمر في دعوة أصدقائك للاستفادة من رصيدك 💚",

  maxPerSubscription:
    "يمكنك استخدام حتى 150 جنيهًا من رصيد الإحالة في الاشتراك الواحد، وسيظل باقي رصيدك متاحًا للاشتراكات القادمة. 💚",

  ineligiblePurchase:
    "انتهى عرض استخدام رصيد الإحالة على الباقات والعروض. يمكنك الآن الاستفادة من رصيد الإحالة عند الاشتراك في الاشتراكات المؤهلة فقط. 💚",

  storeRestricted:
    "رصيد الإحالة مخصص للاشتراكات فقط، ولا يمكن استخدامه في المتجر. يمكنك استخدام الرصيد المؤهل للمتجر مثل مكافآت الألعاب والمسابقات. 🎁",
} as const;

export type ReferralCreditAllowanceInput = {
  purchaseKind: ReferralPurchaseKind;
  referralBalance: number;
  amountDue: number;
};

export type ReferralCreditAllowance = {
  eligible: boolean;
  maxUsableReferral: number;
  reason?: string;
};

export type WalletSourceAllocationInput = {
  purchaseKind: ReferralPurchaseKind;
  walletBalance: number;
  referralBalance: number;
  requestedWalletDeduct: number;
  amountDue: number;
};

export type WalletSourceAllocation = {
  generalDeduct: number;
  referralDeduct: number;
  totalDeduct: number;
};

function finiteNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function money(value: number): number {
  return Math.round(
    (finiteNonNegative(value) + Number.EPSILON) * 100,
  ) / 100;
}

export function resolveReferralCreditAllowance(
  input: ReferralCreditAllowanceInput,
): ReferralCreditAllowance {
  const referralBalance =
    money(input.referralBalance);

  const amountDue =
    money(input.amountDue);

  if (input.purchaseKind !== "subscription") {
    return {
      eligible: false,
      maxUsableReferral: 0,
      reason:
        input.purchaseKind === "store"
          ? REFERRAL_CREDIT_MESSAGES.storeRestricted
          : REFERRAL_CREDIT_MESSAGES.ineligiblePurchase,
    };
  }

  if (
    referralBalance <
    REFERRAL_MIN_USABLE_EGP
  ) {
    return {
      eligible: false,
      maxUsableReferral: 0,
      reason:
        REFERRAL_CREDIT_MESSAGES.belowMinimum,
    };
  }

  const maxUsableReferral =
    money(
      Math.min(
        referralBalance,
        REFERRAL_MAX_PER_SUBSCRIPTION_EGP,
        amountDue,
      ),
    );

  if (maxUsableReferral <= 0) {
    return {
      eligible: false,
      maxUsableReferral: 0,
    };
  }

  return {
    eligible: true,
    maxUsableReferral,
  };
}

export function allocateWalletDeductionBySource(
  input: WalletSourceAllocationInput,
): WalletSourceAllocation {
  const walletBalance =
    money(input.walletBalance);

  const referralBalance =
    money(
      Math.min(
        input.referralBalance,
        walletBalance,
      ),
    );

  const generalBalance =
    money(
      Math.max(
        0,
        walletBalance - referralBalance,
      ),
    );

  const requested =
    money(
      Math.min(
        input.requestedWalletDeduct,
        input.amountDue,
        walletBalance,
      ),
    );

  if (requested <= 0) {
    return {
      generalDeduct: 0,
      referralDeduct: 0,
      totalDeduct: 0,
    };
  }

  const allowance =
    resolveReferralCreditAllowance({
      purchaseKind:
        input.purchaseKind,
      referralBalance,
      amountDue:
        Math.min(
          money(input.amountDue),
          requested,
        ),
    });

  const referralDeduct =
    allowance.eligible
      ? money(
          Math.min(
            allowance.maxUsableReferral,
            requested,
          ),
        )
      : 0;

  const remainingAfterReferral =
    money(
      Math.max(
        0,
        requested - referralDeduct,
      ),
    );

  const generalDeduct =
    money(
      Math.min(
        generalBalance,
        remainingAfterReferral,
      ),
    );

  return {
    generalDeduct,
    referralDeduct,
    totalDeduct:
      money(
        generalDeduct +
        referralDeduct,
      ),
  };
}