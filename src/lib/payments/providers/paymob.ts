import crypto from "crypto";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";
import { getPaymentSettings } from "@/lib/payments/settings";

const REGION_BASE = "https://accept.paymob.com";
const FETCH_TIMEOUT_MS = 20_000;
const PAYMENT_KEY_EXPIRATION_SECONDS = 3600;

type PaymobSettings = Awaited<ReturnType<typeof getPaymentSettings>>;

type PaymobAuthResponse = {
  token?: string;
};

type PaymobOrderResponse = {
  id?: number;
};

type PaymobPaymentKeyResponse = {
  token?: string;
};

type PaymobAcceptanceTransaction = {
  amount_cents?: number;
  created_at?: string;
  currency?: string;
  error_occured?: boolean;
  has_parent_transaction?: boolean;
  id?: number;
  integration_id?: number;
  is_3d_secure?: boolean;
  is_auth?: boolean;
  is_capture?: boolean;
  is_refunded?: boolean;
  is_standalone_payment?: boolean;
  is_voided?: boolean;
  order?: { id?: number; merchant_order_id?: string | null };
  owner?: number;
  pending?: boolean;
  source_data?: { pan?: string | null; sub_type?: string | null; type?: string | null };
  success?: boolean;
};

type PaymobWebhookBody = {
  type?: string;
  obj?: PaymobAcceptanceTransaction;
  hmac?: string;
};

function requireSecret(name: "PAYMOB_API_KEY" | "PAYMOB_HMAC_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

function getRegionBase() {
  return process.env.PAYMOB_REGION_BASE?.trim() || REGION_BASE;
}

function getIntegrationId(settings: PaymobSettings) {
  const raw = String(settings.integrationId ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .find((value) => Number.isFinite(value) && value > 0);

  if (!raw) {
    throw new Error("Paymob integration ID is not configured.");
  }

  return raw;
}

function getWalletIntegrationId(settings: PaymobSettings) {
  const raw = Number(String(settings.walletIntegrationId ?? "").trim());
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error("Paymob wallet integration ID is not configured.");
  }
  return raw;
}

function getIframeId(settings: PaymobSettings) {
  const iframeId = String(settings.iframeId ?? "").trim();
  if (!iframeId) {
    throw new Error("Paymob iframe ID is not configured.");
  }
  return iframeId;
}

function buildBillingData(customer: PaymentCheckoutInput["customer"]) {
  const nameParts = (customer.name ?? "FitZone Member")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const firstName = nameParts[0] ?? "FitZone";
  const lastName = nameParts.slice(1).join(" ") || "Member";

  return {
    apartment: "NA",
    email: customer.email ?? "noreply@fitzoneland.com",
    floor: "NA",
    first_name: firstName,
    street: "NA",
    building: "NA",
    phone_number: customer.phone?.trim() || "+201000000000",
    shipping_method: "NA",
    postal_code: "NA",
    city: "Cairo",
    country: "EG",
    last_name: lastName,
    state: "Cairo",
  };
}

function buildReturnUrl(base: string, transactionId: string, state: "return" | "cancel") {
  const fallback = `https://fitzoneland.com/payment/verify?transactionId=${encodeURIComponent(transactionId)}${state === "cancel" ? "&state=cancel" : ""}`;
  const baseValue = String(base || "").trim();
  if (!baseValue) return fallback;

  try {
    const url = new URL(baseValue);
    url.searchParams.set("transactionId", transactionId);
    if (state === "cancel") {
      url.searchParams.set("state", "cancel");
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

async function authenticate() {
  const apiKey = requireSecret("PAYMOB_API_KEY");
  const response = await fetch(`${getRegionBase()}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Paymob authentication failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as PaymobAuthResponse;
  if (!payload.token) {
    throw new Error("Paymob authentication did not return a token.");
  }

  return payload.token;
}

async function createOrder(params: {
  authToken: string;
  amountCents: number;
  currency: string;
  transactionId: string;
}) {
  const response = await fetch(`${getRegionBase()}/api/ecommerce/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      delivery_needed: false,
      amount_cents: params.amountCents,
      currency: params.currency,
      merchant_order_id: params.transactionId,
      items: [],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Paymob order creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as PaymobOrderResponse;
  if (!payload.id) {
    throw new Error("Paymob order creation did not return an order ID.");
  }

  return payload.id;
}

async function createPaymentKey(params: {
  authToken: string;
  orderId: number;
  amountCents: number;
  currency: string;
  integrationId: number;
  billingData: ReturnType<typeof buildBillingData>;
  redirectionUrl: string;
}) {
  const response = await fetch(`${getRegionBase()}/api/acceptance/payment_keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      amount_cents: params.amountCents,
      expiration: PAYMENT_KEY_EXPIRATION_SECONDS,
      order_id: params.orderId,
      billing_data: params.billingData,
      currency: params.currency,
      integration_id: params.integrationId,
      lock_order_when_paid: false,
      redirection_url: params.redirectionUrl,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Paymob payment key creation failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const payload = (await response.json()) as PaymobPaymentKeyResponse;
  if (!payload.token) {
    throw new Error("Paymob payment key creation did not return a payment token.");
  }

  return payload.token;
}

function buildHostedCheckoutUrl(iframeId: string, paymentToken: string) {
  return `${getRegionBase()}/api/acceptance/iframes/${encodeURIComponent(iframeId)}?payment_token=${encodeURIComponent(paymentToken)}`;
}

function readStoredPayload(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function computePaymobHmac(obj: PaymobAcceptanceTransaction, secret: string) {
  const message = [
    String(obj.amount_cents ?? ""),
    String(obj.created_at ?? ""),
    String(obj.currency ?? ""),
    String(obj.error_occured ?? ""),
    String(obj.has_parent_transaction ?? ""),
    String(obj.id ?? ""),
    String(obj.integration_id ?? ""),
    String(obj.is_3d_secure ?? ""),
    String(obj.is_auth ?? ""),
    String(obj.is_capture ?? ""),
    String(obj.is_refunded ?? ""),
    String(obj.is_standalone_payment ?? ""),
    String(obj.is_voided ?? ""),
    String(obj.order?.id ?? ""),
    String(obj.owner ?? ""),
    String(obj.pending ?? ""),
    String(obj.source_data?.pan ?? ""),
    String(obj.source_data?.sub_type ?? ""),
    String(obj.source_data?.type ?? ""),
    String(obj.success ?? ""),
  ].join("");

  return crypto.createHmac("sha512", secret).update(message).digest("hex");
}

function verifyHmac(provided: string, expected: string) {
  try {
    const a = Buffer.from(provided.toLowerCase(), "hex");
    const b = Buffer.from(expected.toLowerCase(), "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function mapAcceptanceStatus(transaction: PaymobAcceptanceTransaction) {
  if (transaction.success === true && transaction.pending === false) return "paid" as const;
  if (transaction.error_occured === true || (transaction.success === false && transaction.pending === false)) {
    return "failed" as const;
  }
  return "pending" as const;
}

async function createWalletCheckout(params: {
  paymentToken: string;
  customerPhone: string | null | undefined;
}): Promise<{ redirectUrl: string }> {
  const identifier = params.customerPhone?.trim() || "AGGREGATOR";
  const response = await fetch(`${getRegionBase()}/api/acceptance/payments/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { identifier, subtype: "WALLET" },
      payment_token: params.paymentToken,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const payload = (await response.json()) as { redirect_url?: string; message?: string };
  if (!response.ok || !payload.redirect_url) {
    const msg = payload.message ?? `HTTP ${response.status}`;
    throw new Error(`Paymob wallet pay initiation failed: ${msg}`);
  }

  return { redirectUrl: payload.redirect_url };
}

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const settings = await getPaymentSettings();
  const amountCents = Math.round(input.amount * 100);

  if (!settings.enabled) {
    throw new Error("Paymob is disabled in admin settings.");
  }

  if (amountCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const isWallet = input.context.paymentMethod === "wallet";
  const integrationId = isWallet ? getWalletIntegrationId(settings) : getIntegrationId(settings);
  const authToken = await authenticate();
  const paymobOrderId = await createOrder({
    authToken,
    amountCents,
    currency: input.currency || "EGP",
    transactionId: input.transactionId,
  });
  const returnUrl = buildReturnUrl(settings.returnUrl, input.transactionId, "return");

  const paymentToken = await createPaymentKey({
    authToken,
    orderId: paymobOrderId,
    amountCents,
    currency: input.currency || "EGP",
    integrationId,
    billingData: buildBillingData(input.customer),
    redirectionUrl: returnUrl,
  });

  const expiresAt = new Date(Date.now() + PAYMENT_KEY_EXPIRATION_SECONDS * 1000);

  if (isWallet) {
    const { redirectUrl } = await createWalletCheckout({
      paymentToken,
      customerPhone: input.context.customerPhone,
    });

    return {
      provider: "paymob",
      status: "pending",
      message: "Paymob wallet checkout created successfully.",
      checkoutUrl: redirectUrl,
      iframeUrl: null,
      providerReference: String(paymobOrderId),
      externalReference: null,
      expiresAt,
      payload: {
        providerMode: "paymob_wallet_redirect",
        paymobOrderId,
        paymentToken,
        integrationId,
        sandboxMode: settings.sandboxMode,
        returnUrl,
        cancelUrl: buildReturnUrl(settings.cancelUrl, input.transactionId, "cancel"),
      },
    };
  }

  const iframeId = getIframeId(settings);
  const checkoutUrl = buildHostedCheckoutUrl(iframeId, paymentToken);

  return {
    provider: "paymob",
    status: "pending",
    message: "Paymob hosted checkout created successfully.",
    checkoutUrl,
    iframeUrl: checkoutUrl,
    providerReference: String(paymobOrderId),
    externalReference: null,
    expiresAt,
    payload: {
      providerMode: "paymob_hosted_redirect",
      paymobOrderId,
      paymentToken,
      integrationId,
      iframeId,
      profileId: settings.merchantId || null,
      sandboxMode: settings.sandboxMode,
      returnUrl: buildReturnUrl(settings.returnUrl, input.transactionId, "return"),
      cancelUrl: buildReturnUrl(settings.cancelUrl, input.transactionId, "cancel"),
    },
  };
}

async function verifyTransaction(transaction: {
  id: string;
  providerReference?: string | null;
  externalReference?: string | null;
  amount: number;
  currency: string;
  metadata?: string | null;
  providerPayload?: string | null;
}): Promise<PaymentVerificationResult> {
  if (transaction.externalReference) {
    const authToken = await authenticate();
    const response = await fetch(`${getRegionBase()}/api/acceptance/transactions/${transaction.externalReference}`, {
      headers: { Authorization: `Token ${authToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      const acceptance = (await response.json()) as PaymobAcceptanceTransaction;
      const status = mapAcceptanceStatus(acceptance);

      return {
        status,
        message:
          status === "paid"
            ? "Paymob confirmed the payment."
            : status === "failed"
              ? "Paymob marked the payment as failed."
              : "Payment is still being processed by Paymob.",
        providerReference:
          acceptance.order?.id != null ? String(acceptance.order.id) : transaction.providerReference ?? null,
        externalReference:
          acceptance.id != null ? String(acceptance.id) : transaction.externalReference ?? null,
        payload: {
          ...(readStoredPayload(transaction.providerPayload) ?? {}),
          paymobOrderId: acceptance.order?.id ?? null,
          paymobTransactionId: acceptance.id ?? null,
          success: acceptance.success ?? false,
          pending: acceptance.pending ?? true,
        },
      };
    }
  }

  return {
    status: "pending",
    message: "Payment is still pending until Paymob sends a callback or transaction reference.",
    providerReference: transaction.providerReference ?? null,
    externalReference: transaction.externalReference ?? null,
    payload: readStoredPayload(transaction.providerPayload),
  };
}

async function handleWebhook(payload: unknown): Promise<PaymentWebhookResult> {
  const body = payload as PaymobWebhookBody;

  if (body.type !== "TRANSACTION" || !body.obj) {
    return { ok: false, message: "Unsupported Paymob webhook payload." };
  }

  const providedHmac = String(body.hmac ?? "").trim();
  if (providedHmac) {
    const expected = computePaymobHmac(body.obj, requireSecret("PAYMOB_HMAC_SECRET"));
    if (!verifyHmac(providedHmac, expected)) {
      return { ok: false, message: "Paymob webhook HMAC verification failed." };
    }
  }

  const transactionId = body.obj.order?.merchant_order_id ?? null;
  if (!transactionId) {
    return { ok: false, message: "Paymob webhook did not include merchant_order_id." };
  }

  return {
    ok: true,
    transactionId,
    status: mapAcceptanceStatus(body.obj),
    providerReference: body.obj.order?.id != null ? String(body.obj.order.id) : null,
    externalReference: body.obj.id != null ? String(body.obj.id) : null,
    message: "Paymob webhook received successfully.",
    payload: {
      webhookType: body.type,
      success: body.obj.success ?? false,
      pending: body.obj.pending ?? true,
      sourceType: body.obj.source_data?.type ?? null,
      sourceSubtype: body.obj.source_data?.sub_type ?? null,
    },
  };
}

export const paymobPaymentProvider: PaymentProviderDefinition = {
  key: "paymob",
  label: "Paymob",
  enabled: true,
  supportsCards: true,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
