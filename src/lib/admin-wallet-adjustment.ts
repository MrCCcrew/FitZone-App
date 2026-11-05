export class AdminWalletAdjustmentError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "AdminWalletAdjustmentError";
  }
}

export type AdminWalletAdjustmentInput = {
  balance: number;
  referralBalance: number;
  delta: number;
};

export type AdminWalletAdjustmentResult = {
  nextBalance: number;
  nextReferralBalance: number;
  generalAdjustment: number;
  referralAdjustment: number;
};

function money(value: number): number {
  const epsilon =
    Math.sign(value) * Number.EPSILON;

  const rounded =
    Math.round(
      (value + epsilon) * 100,
    ) / 100;

  return rounded === 0
    ? 0
    : rounded;
}

export function canonicalizeAdminWalletAmount(
  value: number,
): number {
  return money(value);
}

export function resolveAdminWalletAdjustment(
  input: AdminWalletAdjustmentInput,
): AdminWalletAdjustmentResult {
  if (
    !Number.isFinite(input.balance) ||
    !Number.isFinite(input.referralBalance) ||
    !Number.isFinite(input.delta)
  ) {
    throw new AdminWalletAdjustmentError(
      "قيمة الرصيد غير صالحة.",
    );
  }

  const balance = money(input.balance);
  const referralBalance =
    money(input.referralBalance);
  const delta = money(input.delta);

  if (
    balance < 0 ||
    referralBalance < 0 ||
    referralBalance > balance
  ) {
    throw new AdminWalletAdjustmentError(
      "بيانات مصادر المحفظة غير متسقة.",
    );
  }

  const nextBalance =
    money(balance + delta);

  if (nextBalance < 0) {
    throw new AdminWalletAdjustmentError(
      "لا يمكن خصم مبلغ أكبر من الرصيد المتاح.",
    );
  }

  if (delta >= 0) {
    return {
      nextBalance,
      nextReferralBalance:
        referralBalance,
      generalAdjustment: delta,
      referralAdjustment: 0,
    };
  }

  const deduction = money(-delta);

  const generalBalance =
    money(balance - referralBalance);

  const generalDeduction =
    money(
      Math.min(
        generalBalance,
        deduction,
      ),
    );

  const referralDeduction =
    money(
      deduction - generalDeduction,
    );

  const nextReferralBalance =
    money(
      referralBalance -
        referralDeduction,
    );

  if (
    nextReferralBalance < 0 ||
    nextReferralBalance > nextBalance
  ) {
    throw new AdminWalletAdjustmentError(
      "تعذر الحفاظ على اتساق مصادر المحفظة.",
    );
  }

  return {
    nextBalance,
    nextReferralBalance,
    generalAdjustment:
      money(-generalDeduction),
    referralAdjustment:
      money(-referralDeduction),
  };
}
