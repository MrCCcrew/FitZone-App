export type PaymentProviderKey = "manual" | "paymob" | "paytabs" | "custom";
export type PaymentPurpose = "order" | "membership" | "wallet_topup";
export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export type PaymentCheckoutInput = {
  transactionId: string;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  returnUrl?: string | null;
  cancelUrl?: string | null;
  customer: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  context: {
    orderId?: string | null;
    membershipId?: string | null;
    offerId?: string | null;
    description?: string | null;
    metadata?: Record<string, unknown> | null;
  };
};

export type PaymentCheckoutResult = {
  provider: PaymentProviderKey;
  status: PaymentStatus;
  message?: string;
  checkoutUrl?: string | null;
  iframeUrl?: string | null;
  providerReference?: string | null;
  externalReference?: string | null;
  expiresAt?: Date | null;
  payload?: Record<string, unknown> | null;
};

export type PaymentVerificationResult = {
  status: PaymentStatus;
  message?: string;
  providerReference?: string | null;
  externalReference?: string | null;
  payload?: Record<string, unknown> | null;
};

export type PaymentWebhookResult = {
  ok: boolean;
  transactionId?: string | null;
  status?: PaymentStatus;
  message?: string;
  providerReference?: string | null;
  externalReference?: string | null;
  payload?: Record<string, unknown> | null;
};

export type PaymentProviderDefinition = {
  key: PaymentProviderKey;
  label: string;
  enabled: boolean;
  supportsCards: boolean;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  verifyTransaction(transaction: {
    id: string;
    providerReference?: string | null;
    externalReference?: string | null;
    amount: number;
    currency: string;
    metadata?: string | null;
  }): Promise<PaymentVerificationResult>;
  handleWebhook?(payload: unknown, headers: Headers): Promise<PaymentWebhookResult>;
};
