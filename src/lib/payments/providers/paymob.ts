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
const PAYMOB_JS_URL = "https://nextstagingenv.s3.amazonaws.com/js/v1/paymob.js";

type PaymobSettings = Awaited<ReturnType<typeof getPaymentSettings>>;

type PaymobAuthResponse = {
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
  special_reference?: string | null;
  source_data?: { pan?: string | null; sub_type?: string | null; type?: string | null };
  success?: boolean;
};

type PaymobWebhookBody = {
  type?: string;
  obj?: PaymobAcceptanceTransaction;
  hmac?: string;
};

type PaymobIntentionMethod = {
  id?: number | string;
  name?: string;
  method_type?: string;
  method_subtype?: string;
  live?: boolean;
};

type PaymobIntentionResponse = {
  id?: string | number;
  client_secret?: string;
  payment_methods?: PaymobIntentionMethod[];
};

function requireSecret(
  name: "PAYMOB_API_KEY" | "PAYMOB_HMAC_SECRET" | "PAYMOB_SECRET_KEY",
) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

function getRegionBase() {
  return process.env.PAYMOB_REGION_BASE?.trim() || REGION_BASE;
}

function getPublicKey(settings: PaymobSettings) {
  const value = String(settings.publicKey ?? "").trim();
  if (!value) {
    throw new Error("Paymob public key is not configured.");
  }
  return value;
}

function parseIntegrationIds(raw: string | null | undefined) {
  return String(raw ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value, index, values) => Number.isFinite(value) && value > 0 && values.indexOf(value) === index);
}

function getAllowedPaymentMethodIds(settings: PaymobSettings) {
  const ids = [
    ...parseIntegrationIds(settings.integrationId),
    ...parseIntegrationIds(settings.walletIntegrationId),
    ...parseIntegrationIds(settings.valuIntegrationId),
    ...parseIntegrationIds(settings.symplIntegrationId),
    ...parseIntegrationIds(settings.souhoolaIntegrationId),
  ].filter((value, index, values) => values.indexOf(value) === index);

  if (ids.length === 0) {
    throw new Error("No Paymob electronic integration IDs are configured.");
  }

  return ids;
}

function getEnabledMethodLabels(settings: PaymobSettings) {
  return [
    { key: "card", label: "Card", configured: parseIntegrationIds(settings.integrationId).length > 0 },
    { key: "wallet", label: "Wallet", configured: parseIntegrationIds(settings.walletIntegrationId).length > 0 },
    { key: "valu", label: "valU", configured: parseIntegrationIds(settings.valuIntegrationId).length > 0 },
    { key: "sympl", label: "Sympl", configured: parseIntegrationIds(settings.symplIntegrationId).length > 0 },
    { key: "souhoola", label: "Souhoola", configured: parseIntegrationIds(settings.souhoolaIntegrationId).length > 0 },
  ].filter((method) => method.configured);
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

function buildReturnUrl(base: string, transactionId: string, state?: "cancel") {
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

function buildHostedCheckoutPageUrl(baseUrl: string, transactionId: string) {
  try {
    const url = new URL(baseUrl || "https://fitzoneland.com/payment/verify");
    const hosted = new URL("/payment/checkout", `${url.protocol}//${url.host}`);
    hosted.searchParams.set("transactionId", transactionId);
    return hosted.toString();
  } catch {
    return `https://fitzoneland.com/payment/checkout?transactionId=${encodeURIComponent(transactionId)}`;
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

async function createUnifiedIntention(params: {
  amountCents: number;
  currency: string;
  transactionId: string;
  settings: PaymobSettings;
  customer: PaymentCheckoutInput["customer"];
  purpose: PaymentCheckoutInput["purpose"];
  context: PaymentCheckoutInput["context"];
}) {
  const secretKey = requireSecret("PAYMOB_SECRET_KEY");
  const paymentMethodIds = getAllowedPaymentMethodIds(params.settings);
  const billingData = buildBillingData(params.customer);
  const redirectionUrl = buildReturnUrl(params.settings.returnUrl, params.transactionId);
  const notificationUrl = String(params.settings.webhookUrl || "").trim();

  const body = {
    amount: params.amountCents,
    currency: params.currency,
    payment_methods: paymentMethodIds,
    special_reference: params.transactionId,
    redirection_url: redirectionUrl,
    notification_url: notificationUrl,
    billing_data: billingData,
    customer: {
      first_name: billingData.first_name,
      last_name: billingData.last_name,
      email: billingData.email,
      phone_number: billingData.phone_number,
    },
    extras: {
      transactionId: params.transactionId,
      purpose: params.purpose,
      orderId: params.context.orderId ?? null,
      membershipId: params.context.membershipId ?? null,
      offerId: params.context.offerId ?? null,
      paymentMethod: params.context.paymentMethod ?? null,
    },
    items: [],
  };

  const endpoint = `${getRegionBase()}/v1/intention/`;
  const authorizationHeaders = [`Token ${secretKey}`, `Bearer ${secretKey}`];
  let lastError = "";

  for (const authorization of authorizationHeaders) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      lastError = `Paymob intention creation failed (${response.status}): ${text.slice(0, 500)}`;
      if (response.status === 401 || response.status === 403) {
        continue;
      }
      throw new Error(lastError);
    }

    const payload = (await response.json()) as PaymobIntentionResponse;
    if (!payload.client_secret) {
      throw new Error("Paymob intention creation did not return a client secret.");
    }

    return {
      intentionId: payload.id != null ? String(payload.id) : null,
      clientSecret: payload.client_secret,
      paymentMethods: Array.isArray(payload.payment_methods) ? payload.payment_methods : [],
      paymentMethodIds,
      enabledMethodLabels: getEnabledMethodLabels(params.settings),
      notificationUrl,
      redirectionUrl,
    };
  }

  throw new Error(lastError || "Paymob intention creation failed.");
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

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const settings = await getPaymentSettings();
  const amountCents = Math.round(input.amount * 100);

  if (!settings.enabled) {
    throw new Error("Paymob is disabled in admin settings.");
  }

  if (amountCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const publicKey = getPublicKey(settings);
  const intention = await createUnifiedIntention({
    amountCents,
    currency: input.currency || "EGP",
    transactionId: input.transactionId,
    settings,
    customer: input.customer,
    purpose: input.purpose,
    context: input.context,
  });

  const checkoutUrl = buildHostedCheckoutPageUrl(settings.returnUrl, input.transactionId);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  console.info("[PAYMOB] Unified checkout prepared", {
    transactionId: input.transactionId,
    intentionId: intention.intentionId,
    allowedPaymentMethodIds: intention.paymentMethodIds,
    returnedPaymentMethods: intention.paymentMethods.map((method) => method.name ?? method.id ?? "unknown"),
    enabledMethodLabels: intention.enabledMethodLabels.map((method) => method.label),
  });

  return {
    provider: "paymob",
    status: "pending",
    message: "Paymob unified checkout session created successfully.",
    checkoutUrl,
    iframeUrl: null,
    providerReference: intention.intentionId,
    externalReference: null,
    expiresAt,
    payload: {
      providerMode: "paymob_unified_checkout",
      intentionId: intention.intentionId,
      clientSecret: intention.clientSecret,
      publicKey,
      paymobScriptUrl: PAYMOB_JS_URL,
      paymentMethodIds: intention.paymentMethodIds,
      paymentMethods: intention.paymentMethods,
      enabledMethodLabels: intention.enabledMethodLabels,
      sandboxMode: settings.sandboxMode,
      merchantId: settings.merchantId || null,
      returnUrl: buildReturnUrl(input.returnUrl ?? settings.returnUrl, input.transactionId),
      cancelUrl: buildReturnUrl(input.cancelUrl ?? settings.cancelUrl, input.transactionId, "cancel"),
      notificationUrl: intention.notificationUrl,
      checkoutUrl,
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

      console.info("[PAYMOB] Verification result", {
        transactionId: transaction.id,
        externalReference: transaction.externalReference,
        status,
      });

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

  const transactionId = body.obj.order?.merchant_order_id ?? body.obj.special_reference ?? null;
  if (!transactionId) {
    return { ok: false, message: "Paymob webhook did not include merchant_order_id." };
  }

  const status = mapAcceptanceStatus(body.obj);
  console.info("[PAYMOB] Webhook received", {
    transactionId,
    paymobOrderId: body.obj.order?.id ?? null,
    paymobTransactionId: body.obj.id ?? null,
    status,
    sourceType: body.obj.source_data?.type ?? null,
    sourceSubtype: body.obj.source_data?.sub_type ?? null,
  });

  return {
    ok: true,
    transactionId,
    status,
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
