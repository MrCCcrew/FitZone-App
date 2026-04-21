import crypto from "crypto";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";
import { getPaymentSettings } from "@/lib/payments/settings";

const PAYMOB_BASE = "https://accept.paymob.com";
const FETCH_TIMEOUT_MS = 20_000;

// ── Env-only secrets (never stored in DB) ─────────────────────────────────────

function requireSecret(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} غير مُعيَّن في متغيرات البيئة على السيرفر.`);
  return value;
}

// ── Paymob v1 API helpers ─────────────────────────────────────────────────────

async function authenticate(apiKey: string): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paymob auth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Paymob: لم يُستلم token المصادقة.");
  return data.token;
}

async function createPaymobOrder(params: {
  authToken: string;
  amountCents: number;
  currency: string;
  merchantOrderId: string;
}): Promise<number> {
  const res = await fetch(`${PAYMOB_BASE}/api/ecommerce/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      delivery_needed: false,
      amount_cents: params.amountCents,
      currency: params.currency,
      merchant_order_id: params.merchantOrderId,
      items: [],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paymob order creation failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: number };
  if (!data.id) throw new Error("Paymob: لم يُستلم معرّف الطلب.");
  return data.id;
}

async function getPaymentKey(params: {
  authToken: string;
  amountCents: number;
  currency: string;
  orderId: number;
  integrationId: number;
  billingData: Record<string, string>;
}): Promise<string> {
  const res = await fetch(`${PAYMOB_BASE}/api/acceptance/payment_keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: params.authToken,
      amount_cents: params.amountCents,
      currency: params.currency,
      order_id: params.orderId,
      billing_data: params.billingData,
      integration_id: params.integrationId,
      lock_order_when_paid: "true",
      expiration: 3600,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Paymob payment key failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Paymob: لم يُستلم مفتاح الدفع.");
  return data.token;
}

function buildBillingData(customer: PaymentCheckoutInput["customer"]): Record<string, string> {
  const parts = (customer.name ?? "FitZone Member").trim().split(/\s+/);
  const firstName = parts[0] ?? "FitZone";
  const lastName = parts.slice(1).join(" ") || "Member";
  return {
    apartment: "NA",
    email: customer.email ?? "noreply@fitzoneland.com",
    floor: "NA",
    first_name: firstName,
    last_name: lastName,
    street: "NA",
    building: "NA",
    phone_number: customer.phone?.trim() || "N/A",
    shipping_method: "NA",
    postal_code: "NA",
    city: "Cairo",
    country: "EG",
    state: "Cairo",
  };
}

// ── HMAC Verification ─────────────────────────────────────────────────────────

type PaymobTransactionObj = {
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  id: number;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  order: { id: number; merchant_order_id?: string | null };
  owner: number;
  pending: boolean;
  source_data: { pan?: string | null; sub_type?: string | null; type?: string | null };
  success: boolean;
};

type PaymobWebhookBody = {
  type?: string;
  obj?: PaymobTransactionObj;
  hmac?: string;
};

function computePaymobHmac(obj: PaymobTransactionObj, secret: string): string {
  const message = [
    String(obj.amount_cents),
    String(obj.created_at),
    String(obj.currency),
    String(obj.error_occured),
    String(obj.has_parent_transaction),
    String(obj.id),
    String(obj.integration_id),
    String(obj.is_3d_secure),
    String(obj.is_auth),
    String(obj.is_capture),
    String(obj.is_refunded),
    String(obj.is_standalone_payment),
    String(obj.is_voided),
    String(obj.order.id),
    String(obj.owner),
    String(obj.pending),
    String(obj.source_data?.pan ?? ""),
    String(obj.source_data?.sub_type ?? ""),
    String(obj.source_data?.type ?? ""),
    String(obj.success),
  ].join("");

  return crypto.createHmac("sha512", secret).update(message).digest("hex");
}

function verifyHmac(provided: string, computed: string): boolean {
  try {
    const a = Buffer.from(provided.toLowerCase(), "hex");
    const b = Buffer.from(computed.toLowerCase(), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function mapStatus(obj: PaymobTransactionObj): "paid" | "failed" | "pending" {
  if (obj.success === true && obj.pending === false) return "paid";
  if (obj.error_occured === true || (obj.success === false && obj.pending === false)) return "failed";
  return "pending";
}

// ── createCheckout ────────────────────────────────────────────────────────────

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const settings = await getPaymentSettings();
  const apiKey = requireSecret("PAYMOB_SECRET_KEY");

  // integrationId = Paymob card integration ID (for payment key)
  // iframeId = Paymob iframe ID (for hosted checkout URL)
  const integrationId = Number(settings.integrationId || settings.iframeId || "0");
  const iframeId = settings.iframeId?.trim();

  if (!integrationId || Number.isNaN(integrationId)) {
    throw new Error("Paymob: Integration ID غير مُعيَّن في إعدادات الدفع.");
  }
  if (!iframeId) {
    throw new Error("Paymob: Iframe ID غير مُعيَّن في إعدادات الدفع.");
  }

  const amountCents = Math.round(input.amount * 100);
  if (amountCents <= 0) throw new Error("Paymob: قيمة الدفع يجب أن تكون أكبر من صفر.");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const authToken = await authenticate(apiKey);
  const paymobOrderId = await createPaymobOrder({
    authToken,
    amountCents,
    currency: input.currency || "EGP",
    merchantOrderId: input.transactionId, // our internal ID → merchant_order_id
  });

  const paymentKey = await getPaymentKey({
    authToken,
    amountCents,
    currency: input.currency || "EGP",
    orderId: paymobOrderId,
    integrationId,
    billingData: buildBillingData(input.customer),
  });

  const checkoutUrl = `${PAYMOB_BASE}/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;

  return {
    provider: "paymob",
    status: "pending",
    message: "تم إنشاء جلسة الدفع. سيتم توجيه العميل لصفحة الدفع الآمنة.",
    checkoutUrl,
    iframeUrl: checkoutUrl,
    providerReference: String(paymobOrderId),
    externalReference: null, // will be set later from webhook/verify
    expiresAt,
    payload: { paymobOrderId, integrationId, iframeId, amountCents },
  };
}

// ── verifyTransaction ─────────────────────────────────────────────────────────

async function verifyTransaction(transaction: {
  id: string;
  providerReference?: string | null;
  externalReference?: string | null;
  amount: number;
  currency: string;
  metadata?: string | null;
}): Promise<PaymentVerificationResult> {
  // externalReference = Paymob transaction ID (numeric), set after webhook or prior verify
  if (!transaction.externalReference) {
    return {
      status: "pending",
      message: "لم يتم استلام تأكيد الدفع من Paymob بعد.",
      providerReference: transaction.providerReference,
      externalReference: null,
    };
  }

  const apiKey = requireSecret("PAYMOB_SECRET_KEY");
  const authToken = await authenticate(apiKey);

  const res = await fetch(
    `${PAYMOB_BASE}/api/acceptance/transactions/${transaction.externalReference}`,
    {
      headers: { Authorization: `Token ${authToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );

  if (!res.ok) {
    return {
      status: "pending",
      message: `Paymob verify returned status ${res.status}.`,
      providerReference: transaction.providerReference,
      externalReference: transaction.externalReference,
    };
  }

  const obj = (await res.json()) as PaymobTransactionObj;
  const status = mapStatus(obj);

  return {
    status,
    message: obj.success ? "تم تأكيد الدفع من Paymob." : obj.pending ? "الدفع قيد المعالجة." : "لم يكتمل الدفع.",
    providerReference: String(obj.order?.id ?? transaction.providerReference ?? ""),
    externalReference: String(obj.id),
    payload: {
      paymobTransactionId: obj.id,
      paymobOrderId: obj.order?.id,
      success: obj.success,
      pending: obj.pending,
    },
  };
}

// ── handleWebhook ─────────────────────────────────────────────────────────────

async function handleWebhook(payload: unknown): Promise<PaymentWebhookResult> {
  const body = payload as PaymobWebhookBody;

  if (body.type !== "TRANSACTION" || !body.obj) {
    return { ok: false, message: "Paymob webhook: نوع الحدث غير مدعوم." };
  }

  const obj = body.obj;

  // Verify HMAC signature
  const providedHmac = body.hmac;
  if (providedHmac) {
    let hmacSecret: string;
    try {
      hmacSecret = requireSecret("PAYMOB_HMAC_SECRET");
    } catch {
      console.error("[PAYMOB_WEBHOOK] PAYMOB_HMAC_SECRET not configured.");
      return { ok: false, message: "HMAC secret غير مُعيَّن على السيرفر." };
    }

    const expected = computePaymobHmac(obj, hmacSecret);
    if (!verifyHmac(providedHmac, expected)) {
      console.error("[PAYMOB_WEBHOOK] HMAC mismatch — possible spoofing attempt.");
      return { ok: false, message: "HMAC verification failed." };
    }
  } else {
    console.warn("[PAYMOB_WEBHOOK] No HMAC provided in payload — processing with caution.");
  }

  const internalTransactionId = obj.order?.merchant_order_id ?? null;
  if (!internalTransactionId) {
    console.error("[PAYMOB_WEBHOOK] merchant_order_id missing from order object.");
    return { ok: false, message: "Paymob webhook: merchant_order_id مفقود." };
  }

  const status = mapStatus(obj);

  return {
    ok: true,
    transactionId: internalTransactionId,
    status,
    providerReference: String(obj.order.id),
    externalReference: String(obj.id),
    message: obj.success ? "تم تأكيد الدفع." : obj.pending ? "الدفع قيد المعالجة." : "فشل الدفع.",
    payload: {
      paymobTransactionId: obj.id,
      paymobOrderId: obj.order.id,
      success: obj.success,
      pending: obj.pending,
    },
  };
}

// ── Provider export ───────────────────────────────────────────────────────────

export const paymobPaymentProvider: PaymentProviderDefinition = {
  key: "paymob",
  label: "Paymob",
  enabled: !!process.env.PAYMOB_SECRET_KEY?.trim(),
  supportsCards: true,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
