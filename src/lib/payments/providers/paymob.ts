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
const FLASH_API_BASE = "https://flashapi.paymob.com";
const PAYMOB_JS_URL = "https://nextstagingenv.s3.amazonaws.com/js/v1/paymob.js";
const FETCH_TIMEOUT_MS = 20_000;

type PaymobSettings = Awaited<ReturnType<typeof getPaymentSettings>>;

type PaymobIntentionResponse = {
  id?: string | number;
  client_secret?: string;
  special_reference?: string | null;
  status?: string | null;
  payment_methods?: Array<{ name?: string | null; live?: boolean | null }>;
};

type PaymobIntentionDetailsResponse = {
  id?: string | number;
  client_secret?: string;
  payment_methods?: Array<{ name?: string | null; live?: boolean | null }>;
  transactions?: Array<Record<string, unknown>>;
  transaction_records?: Array<Record<string, unknown>>;
  confirmed?: boolean;
  status?: string | null;
  intention_detail?: Record<string, unknown> | null;
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

function requireSecret(name: "PAYMOB_API_KEY" | "PAYMOB_SECRET_KEY" | "PAYMOB_HMAC_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

function getRegionBase() {
  return process.env.PAYMOB_REGION_BASE?.trim() || REGION_BASE;
}

function getFlashBase() {
  return process.env.PAYMOB_FLASH_API_BASE?.trim() || FLASH_API_BASE;
}

function getPaymobScriptUrl() {
  return process.env.PAYMOB_FLASH_SCRIPT_URL?.trim() || PAYMOB_JS_URL;
}

function getIntegrationIds(settings: PaymobSettings) {
  const raw = String(settings.integrationId ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return Array.from(new Set(raw));
}

function buildBillingData(customer: PaymentCheckoutInput["customer"]) {
  const nameParts = (customer.name ?? "FitZone Member").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "FitZone";
  const lastName = nameParts.slice(1).join(" ") || "Member";

  return {
    first_name: firstName,
    last_name: lastName,
    email: customer.email ?? "noreply@fitzoneland.com",
    phone_number: customer.phone?.trim() || "+201000000000",
  };
}

function buildReturnUrl(base: string, transactionId: string, state: "return" | "cancel") {
  const fallback = `/payment/verify?transactionId=${encodeURIComponent(transactionId)}${state === "cancel" ? "&state=cancel" : ""}`;
  const baseValue = String(base || "").trim();
  if (!baseValue) return fallback;

  try {
    const url = new URL(baseValue);
    url.searchParams.set("transactionId", transactionId);
    url.searchParams.set("payment", state);
    return url.toString();
  } catch {
    return fallback;
  }
}

function buildCheckoutUrl(transactionId: string) {
  return `/payment/checkout?transactionId=${encodeURIComponent(transactionId)}`;
}

async function createIntention(params: {
  settings: PaymobSettings;
  input: PaymentCheckoutInput;
  amountCents: number;
}) {
  const secretKey = requireSecret("PAYMOB_SECRET_KEY");
  const integrationIds = getIntegrationIds(params.settings);

  const body: Record<string, unknown> = {
    amount: params.amountCents,
    currency: params.input.currency || "EGP",
    billing_data: buildBillingData(params.input.customer),
    items: [],
    special_reference: params.input.transactionId,
    notification_url: params.settings.webhookUrl || undefined,
    redirection_url: buildReturnUrl(
      params.settings.returnUrl || "",
      params.input.transactionId,
      "return",
    ),
    expiration: 3600,
    extras: {
      transactionId: params.input.transactionId,
      purpose: params.input.purpose,
      orderId: params.input.context.orderId ?? null,
      membershipId: params.input.context.membershipId ?? null,
      offerId: params.input.context.offerId ?? null,
      description: params.input.context.description ?? null,
    },
  };

  if (integrationIds.length > 0) {
    body.payment_methods = integrationIds;
  }

  const res = await fetch(`${getRegionBase()}/v1/intention/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${secretKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paymob intention creation failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as PaymobIntentionResponse;
  if (!data.client_secret) {
    throw new Error("Paymob intention response did not include a client secret.");
  }

  return {
    intentionId: String(data.id ?? ""),
    clientSecret: data.client_secret,
    status: data.status ?? "intended",
    paymentMethods: data.payment_methods ?? [],
    integrationIds,
  };
}

function readStoredPayload(metadata: string | null | undefined) {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getStoredClientSecret(providerPayload: string | null | undefined) {
  const payload = readStoredPayload(providerPayload);
  const clientSecret = payload?.clientSecret;
  return typeof clientSecret === "string" && clientSecret.trim() ? clientSecret.trim() : null;
}

function mapIntentionState(data: PaymobIntentionDetailsResponse) {
  const normalizedStatus = String(data.status ?? "").toLowerCase();
  const allTransactions = [...(data.transactions ?? []), ...(data.transaction_records ?? [])];

  const hasPaidTransaction = allTransactions.some((item) => {
    const status = String(item.status ?? item.state ?? item.requirement ?? "").toLowerCase();
    const success = item.success === true || item.confirmed === true;
    return success || ["success", "paid", "confirmed"].includes(status);
  });

  const hasFailedTransaction = allTransactions.some((item) => {
    const status = String(item.status ?? item.state ?? item.requirement ?? "").toLowerCase();
    return item.success === false || ["failed", "declined", "cancelled", "canceled", "expired"].includes(status);
  });

  if (data.confirmed === true || hasPaidTransaction || ["paid", "confirmed", "processed", "success"].includes(normalizedStatus)) {
    return "paid" as const;
  }

  if (hasFailedTransaction || ["failed", "declined", "cancelled", "canceled", "expired"].includes(normalizedStatus)) {
    return "failed" as const;
  }

  return "pending" as const;
}

async function readIntentionDetails(publicKey: string, clientSecret: string) {
  const url = `${getFlashBase()}/v1/intention/element/${encodeURIComponent(publicKey)}/${encodeURIComponent(clientSecret)}/`;
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paymob intention inquiry failed (${res.status}): ${text.slice(0, 240)}`);
  }

  return (await res.json()) as PaymobIntentionDetailsResponse;
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
  if (transaction.error_occured === true || (transaction.success === false && transaction.pending === false)) return "failed" as const;
  return "pending" as const;
}

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const settings = await getPaymentSettings();
  const publicKey = String(settings.publicKey ?? "").trim();
  const amountCents = Math.round(input.amount * 100);

  if (!settings.enabled) {
    throw new Error("Paymob is disabled in admin settings.");
  }
  if (!publicKey) {
    throw new Error("Paymob public key is not configured.");
  }
  if (amountCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const intention = await createIntention({
    settings,
    input,
    amountCents,
  });

  const checkoutUrl = buildCheckoutUrl(input.transactionId);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  return {
    provider: "paymob",
    status: "pending",
    message: "Paymob payment intention created successfully.",
    checkoutUrl,
    iframeUrl: null,
    providerReference: intention.intentionId || null,
    externalReference: null,
    expiresAt,
    payload: {
      providerMode: "paymob_flash",
      paymobScriptUrl: getPaymobScriptUrl(),
      publicKey,
      clientSecret: intention.clientSecret,
      intentionId: intention.intentionId,
      paymentMethods: intention.paymentMethods,
      integrationIds: intention.integrationIds,
      redirectUrl: buildReturnUrl(settings.returnUrl, input.transactionId, "return"),
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
  const settings = await getPaymentSettings();
  const publicKey = String(settings.publicKey ?? "").trim();
  const clientSecret = getStoredClientSecret(transaction.providerPayload);

  if (publicKey && clientSecret) {
    const intention = await readIntentionDetails(publicKey, clientSecret);
    const status = mapIntentionState(intention);
    const externalReference = (() => {
      const transactionItem = [...(intention.transactions ?? []), ...(intention.transaction_records ?? [])].find(Boolean);
      const id = transactionItem?.id;
      return id == null ? transaction.externalReference ?? null : String(id);
    })();

    return {
      status,
      message:
        status === "paid"
          ? "Paymob confirmed the payment."
          : status === "failed"
            ? "Paymob marked the payment as failed."
            : "Payment is still being processed by Paymob.",
      providerReference: transaction.providerReference ?? (intention.id != null ? String(intention.id) : null),
      externalReference,
      payload: {
        clientSecret,
        intentionId: intention.id ?? null,
        intentionStatus: intention.status ?? null,
        confirmed: intention.confirmed ?? false,
        paymentMethods: intention.payment_methods ?? [],
      },
    };
  }

  if (transaction.externalReference) {
    const apiKey = process.env.PAYMOB_API_KEY?.trim();
    if (apiKey) {
      const auth = await fetch(`${getRegionBase()}/api/auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (auth.ok) {
        const authData = (await auth.json()) as { token?: string };
        if (authData.token) {
          const res = await fetch(`${getRegionBase()}/api/acceptance/transactions/${transaction.externalReference}`, {
            headers: { Authorization: `Token ${authData.token}` },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });

          if (res.ok) {
            const acceptance = (await res.json()) as PaymobAcceptanceTransaction;
            const status = mapAcceptanceStatus(acceptance);
            return {
              status,
              message:
                status === "paid"
                  ? "Paymob confirmed the payment."
                  : status === "failed"
                    ? "Paymob marked the payment as failed."
                    : "Payment is still being processed by Paymob.",
              providerReference: acceptance.order?.id != null ? String(acceptance.order.id) : transaction.providerReference ?? null,
              externalReference: acceptance.id != null ? String(acceptance.id) : transaction.externalReference,
              payload: {
                paymobOrderId: acceptance.order?.id ?? null,
                paymobTransactionId: acceptance.id ?? null,
                success: acceptance.success ?? false,
                pending: acceptance.pending ?? true,
              },
            };
          }
        }
      }
    }
  }

  return {
    status: "pending",
    message: "Paymob verification is waiting for the initial callback.",
    providerReference: transaction.providerReference ?? null,
    externalReference: transaction.externalReference ?? null,
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

  const status = mapAcceptanceStatus(body.obj);

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
