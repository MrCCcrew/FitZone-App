/**
 * Preflight decision only.
 *
 * Never creates payments, changes membership state,
 * refunds money, or contacts Paymob.
 *
 * Provider reconciliation is mandatory before replacing
 * any expired or failed checkout.
 */
export type MembershipRetryInput = {
  membershipStatus: string;
  pendingExpiresAt: Date | null;
  ownerMatches: boolean;
  economicIdentityMatches: boolean;
  anotherPaidPaymentExists: boolean;
  paymentStatus: string | null;
  checkoutUrl: string | null;
  paymentExpiresAt: Date | null;
  now?: Date;
};

export type MembershipRetryDecision =
  | {
      action: "blocked";
      reason: string;
    }
  | {
      action: "resume";
      checkoutUrl: string;
    }
  | {
      action: "reconcile_before_retry";
      reason: string;
    };

function validTime(value: Date | null): number | null {
  if (!(value instanceof Date)) return null;

  const timestamp = value.getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function validCheckoutUrl(raw: string | null): string | null {
  if (!raw) return null;

  try {
    const url = new URL(raw);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function decideMembershipCheckoutRetry(
  input: MembershipRetryInput,
): MembershipRetryDecision {
  const now = validTime(input.now ?? new Date());
  const holdExpiresAt = validTime(input.pendingExpiresAt);

  if (now === null || holdExpiresAt === null) {
    return {
      action: "blocked",
      reason: "invalid_hold",
    };
  }

  if (input.membershipStatus !== "pending_payment") {
    return {
      action: "blocked",
      reason: "membership_not_pending",
    };
  }

  if (!input.ownerMatches) {
    return {
      action: "blocked",
      reason: "ownership_mismatch",
    };
  }

  if (!input.economicIdentityMatches) {
    return {
      action: "blocked",
      reason: "economic_identity_mismatch",
    };
  }

  if (holdExpiresAt <= now) {
    return {
      action: "blocked",
      reason: "original_hold_expired",
    };
  }

  if (input.anotherPaidPaymentExists) {
    return {
      action: "blocked",
      reason: "payment_already_exists",
    };
  }

  const status = (input.paymentStatus ?? "")
    .trim()
    .toLowerCase();

  if (status === "paid") {
    return {
      action: "blocked",
      reason: "payment_already_paid",
    };
  }

  if (
    status === "retrying" ||
    status === "processing" ||
    status === "pending_payment"
  ) {
    return {
      action: "blocked",
      reason: "payment_in_flight",
    };
  }

  if (status === "pending" || status === "requires_action") {
    const paymentExpiry = validTime(input.paymentExpiresAt);
    const checkout = validCheckoutUrl(input.checkoutUrl);

    if (
      checkout &&
      paymentExpiry !== null &&
      paymentExpiry > now
    ) {
      return {
        action: "resume",
        checkoutUrl: checkout,
      };
    }

    return {
      action: "reconcile_before_retry",
      reason: "checkout_unusable_or_expired",
    };
  }

  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    return {
      action: "reconcile_before_retry",
      reason: "previous_payment_terminal",
    };
  }

  return {
    action: "blocked",
    reason: "unknown_payment_state",
  };
}