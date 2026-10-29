import { assessPaymobUnpaidOrder, type PaymobUnpaidOrderProof } from "@/lib/payments/paymob-order-unpaid-proof";
import { assessPaymobOrderPositiveProof, assessPaymobOrderAndAcceptanceProof } from "@/lib/payments/paymob-order-positive-proof";
import { isFinalRetainedPaymobPayment } from "@/lib/payments/paymob-retained-payment-proof";
import { resolvePaymobIntentionExpiration } from "@/lib/payments/paymob-membership-expiration";
import crypto from "crypto";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";
import { getPaymentSettings } from "@/lib/payments/settings";
import { assertExternalSideEffectsAllowed } from "@/lib/staging-safety";

const REGION_BASE = "https://accept.paymob.com";
const FETCH_TIMEOUT_MS = 20_000;
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
  refunded_amount_cents?: number;
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
    ...(settings.enableCards ? parseIntegrationIds(settings.cardIntegrationId || settings.integrationId) : []),
    ...(settings.enableWallets ? parseIntegrationIds(settings.walletIntegrationId) : []),
    ...(settings.enableValu ? parseIntegrationIds(settings.valuIntegrationId) : []),
    ...(settings.enableSympl ? parseIntegrationIds(settings.symplIntegrationId) : []),
    ...(settings.enableSouhoola ? parseIntegrationIds(settings.souhoolaIntegrationId) : []),
  ].filter((value, index, values) => values.indexOf(value) === index);

  if (ids.length === 0) {
    throw new Error("No Paymob electronic integration IDs are configured.");
  }

  return ids;
}

function getEnabledMethodLabels(settings: PaymobSettings) {
  return [
    { key: "card", label: "Card", configured: settings.enableCards && parseIntegrationIds(settings.cardIntegrationId || settings.integrationId).length > 0 },
    { key: "wallet", label: "Wallet", configured: settings.enableWallets && parseIntegrationIds(settings.walletIntegrationId).length > 0 },
    { key: "valu", label: "valU", configured: settings.enableValu && parseIntegrationIds(settings.valuIntegrationId).length > 0 },
    { key: "sympl", label: "Sympl", configured: settings.enableSympl && parseIntegrationIds(settings.symplIntegrationId).length > 0 },
    { key: "souhoola", label: "Souhoola", configured: settings.enableSouhoola && parseIntegrationIds(settings.souhoolaIntegrationId).length > 0 },
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

function buildUnifiedCheckoutUrl(publicKey: string, clientSecret: string) {
  const url = new URL("/unifiedcheckout/", getRegionBase());
  url.searchParams.set("publicKey", publicKey);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

async function authenticate() {
  assertExternalSideEffectsAllowed("Paymob authentication");
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
  expirationSeconds: number;
}) {
  assertExternalSideEffectsAllowed("Paymob intention creation");
  const secretKey = requireSecret("PAYMOB_SECRET_KEY");
  const paymentMethodIds = getAllowedPaymentMethodIds(params.settings);
  const billingData = buildBillingData(params.customer);
  const redirectionUrl = buildReturnUrl(params.settings.returnUrl, params.transactionId);
  const notificationUrl = String(params.settings.webhookUrl || "").trim();

  const body = {
    amount: params.amountCents,
    currency: params.currency,
    expiration: params.expirationSeconds,
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
      intentionOrderId:
        String(
          (payload as PaymobIntentionResponse & {
            intention_order_id?: number | string | null;
          }).intention_order_id ?? "",
        ) || null,
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

  if (input.purpose === "membership" && !input.membershipHoldExpiresAt) {
    throw new Error("PAYMOB_MEMBERSHIP_HOLD_EXPIRY_REQUIRED");
  }

  const checkoutStartedAt = new Date();

  const expirationSeconds = resolvePaymobIntentionExpiration({
    membershipHoldExpiresAt:
      input.purpose === "membership"
        ? input.membershipHoldExpiresAt
        : null,
    now: checkoutStartedAt,
  });
  const publicKey = getPublicKey(settings);
  const intention = await createUnifiedIntention({
    expirationSeconds,
    amountCents,
    currency: input.currency || "EGP",
    transactionId: input.transactionId,
    settings,
    customer: input.customer,
    purpose: input.purpose,
    context: input.context,
  });

  const checkoutUrl = buildUnifiedCheckoutUrl(publicKey, intention.clientSecret);
  const expiresAt = new Date(checkoutStartedAt.getTime() + expirationSeconds * 1000);

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
    message: "Paymob hosted unified checkout session created successfully.",
    checkoutUrl,
    iframeUrl: null,
    providerReference: intention.intentionId,
    externalReference: null,
    expiresAt,
    payload: {
      providerMode: "paymob_unified_checkout",
      checkoutExperience: "redirect",
      intentionId: intention.intentionId,
      intentionOrderId: intention.intentionOrderId,
      clientSecret: intention.clientSecret,
      publicKey,
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

/*
 * Renew the SAME Paymob Intention.
 *
 * This is not permission to create a second charge.
 * Caller must claim the membership/payment retry atomically,
 * and must block any unresolved paid/in-flight outcome.
 */
export async function renewExistingMembershipPaymobIntention(input: {
  transactionId: string;
  providerReference: string | null;
  providerPayload: string | null;
  amount: number;
  currency: string;
  pendingExpiresAt: Date;
  customer: PaymentCheckoutInput["customer"];
}) {
  assertExternalSideEffectsAllowed("Paymob membership intention renewal");

  const stored = readStoredPayload(input.providerPayload);

  if (stored?.providerMode !== "paymob_unified_checkout") {
    throw new Error("PAYMOB_RENEWAL_UNSUPPORTED_CHECKOUT");
  }

  const clientSecret = String(stored.clientSecret ?? "").trim();
  const intentionId = String(stored.intentionId ?? "").trim();
  const orderIdText = String(stored.intentionOrderId ?? "").trim();
  const orderId = Number(orderIdText);

  const methods = stored.paymentMethodIds;

  if (
    !clientSecret ||
    clientSecret.length > 500 ||
    !/^[a-zA-Z0-9_-]+$/.test(clientSecret) ||
    !intentionId ||
    intentionId !== input.providerReference ||
    !/^[0-9]+$/.test(orderIdText) ||
    !Number.isSafeInteger(orderId) ||
    orderId <= 0 ||
    !Array.isArray(methods) ||
    methods.length === 0 ||
    !methods.every(
      (id) => Number.isSafeInteger(id) && id > 0,
    )
  ) {
    throw new Error("PAYMOB_RENEWAL_IDENTITY_INVALID");
  }

  const amountCents = Math.round(input.amount * 100);
  const currency = input.currency.trim().toUpperCase();

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    currency !== "EGP"
  ) {
    throw new Error("PAYMOB_RENEWAL_ECONOMICS_INVALID");
  }

  const now = new Date();

  const expirationSeconds = resolvePaymobIntentionExpiration({
    membershipHoldExpiresAt: input.pendingExpiresAt,
    now,
  });

  /*
   * Paymob Update Intention requires the original accept_order_id.
   * All payment economics and the original special_reference stay fixed.
   */
  const body = {
    accept_order_id: orderId,
    amount: amountCents,
    currency,
    payment_methods: methods,
    items: [],
    billing_data: buildBillingData(input.customer),
    special_reference: input.transactionId,
    expiration: expirationSeconds,
    notification_url: String(stored.notificationUrl ?? ""),
    redirection_url: buildReturnUrl(
      String(stored.returnUrl ?? ""),
      input.transactionId,
    ),
  };

  const secretKey = requireSecret("PAYMOB_SECRET_KEY");

  const response = await fetch(
    `${getRegionBase()}/v1/intention/${encodeURIComponent(clientSecret)}/`,
    {
      method: "PUT",
      headers: {
        Authorization: `Token ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    // Do not include provider response body: it might contain credentials.
    throw new Error(
      `PAYMOB_RENEWAL_PROVIDER_REJECTED_${response.status}`,
    );
  }

  const renewed = (await response.json()) as {
    id?: string;
    intention_order_id?: string | number;
    client_secret?: string;
    special_reference?: string;
    confirmed?: boolean;
    status?: string;
  };

  /*
   * Accept only an explicitly unconfirmed update to the same
   * Intention and Paymob order.
   *
   * An ambiguous response must never authorize another checkout.
   */
  if (
    renewed.confirmed !== false ||
    renewed.id !== intentionId ||
    String(renewed.intention_order_id ?? "") !== orderIdText ||
    renewed.special_reference !== input.transactionId ||
    renewed.status !== "intended" ||
    !renewed.client_secret
  ) {
    throw new Error("PAYMOB_RENEWAL_RESULT_REQUIRES_RECONCILIATION");
  }

  const checkoutUrl = buildUnifiedCheckoutUrl(
    String(stored.publicKey ?? ""),
    renewed.client_secret,
  );

  return {
    checkoutUrl,
    expiresAt: new Date(
      now.getTime() + expirationSeconds * 1000,
    ),
    providerReference: intentionId,
    providerPayload: {
      ...stored,
      clientSecret: renewed.client_secret,
      checkoutUrl,
      renewalUpdatedAt: new Date().toISOString(),
    },
  };
}
// PAYMOB_RECOVERY_LIVE_ORDER_AUTHORITY_V1
// Acceptance verification alone must never activate a recovered payment.
export async function confirmPaymobOrderPaidForRecovery(input: {
  paymentId: string;
  paymobOrderId: number | string | null;
  paymobTransactionId: string;
  amount: number;
  currency: string;
}): Promise<boolean> {
  const orderId = String(input.paymobOrderId ?? "").trim();
  const expectedAmountCents = Math.round(input.amount * 100);

  if (
    !/^[1-9][0-9]*$/.test(orderId) ||
    !Number.isSafeInteger(Number(orderId)) ||
    !/^[0-9]+$/.test(input.paymobTransactionId) ||
    !Number.isSafeInteger(expectedAmountCents) ||
    expectedAmountCents <= 0 ||
    !input.currency.trim()
  ) {
    return false;
  }

  try {
    assertExternalSideEffectsAllowed("Paymob recovery order inquiry");
    const token = await authenticate();

    const response = await fetch(
      `${getRegionBase()}/api/ecommerce/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!response.ok) return false;

    const order: unknown = await response.json();

    const orderTransactions =
      order && typeof order === "object" && !Array.isArray(order)
        ? (order as Record<string, unknown>).transactions
        : undefined;

    // Preserve the original multi-transaction proof when available.
    if (Array.isArray(orderTransactions)) {
      const confirmedId = assessPaymobOrderPositiveProof({
        order,
        expectedOrderId: orderId,
        expectedMerchantOrderId: input.paymentId,
        expectedAmountCents,
        expectedCurrency: input.currency,
      });

      return confirmedId === input.paymobTransactionId;
    }

    // A malformed list is inconclusive, not permission to bypass it.
    if (orderTransactions !== undefined) return false;

    // Live Paymob Orders may not include transactions.
    // Independently obtain the exact Acceptance Transaction.
    const acceptanceResponse = await fetch(
      `${getRegionBase()}/api/acceptance/transactions/${encodeURIComponent(input.paymobTransactionId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!acceptanceResponse.ok) return false;

    const acceptance: unknown = await acceptanceResponse.json();

    return assessPaymobOrderAndAcceptanceProof({
      order,
      acceptance,
      expectedOrderId: orderId,
      expectedMerchantOrderId: input.paymentId,
      expectedTransactionId: input.paymobTransactionId,
      expectedAmountCents,
      expectedCurrency: input.currency,
    });
  } catch (error) {
    console.warn(
      "[PAYMOB_RECOVERY_ORDER_INCONCLUSIVE]",
      error instanceof Error ? error.name : "unknown",
    );
    return false;
  }
}

export async function inquirePaymobUnpaidOrder(input: {
  paymentId: string;
  providerPayload: string | null;
  amount: number;
  currency: string;
}): Promise<PaymobUnpaidOrderProof | null> {
  const stored = readStoredPayload(input.providerPayload);
  const orderId = String(stored?.intentionOrderId ?? "").trim();
  const cents = Math.round(input.amount * 100);

  if (!/^[0-9]+$/.test(orderId) ||
      !Number.isSafeInteger(cents) || cents <= 0) return null;

  try {
    assertExternalSideEffectsAllowed("Paymob unpaid order inquiry");
    const token = await authenticate();

    const response = await fetch(
      `${getRegionBase()}/api/ecommerce/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!response.ok) return null;

    const order: unknown = await response.json();

    return assessPaymobUnpaidOrder({
      order,
      paymentId: input.paymentId,
      expectedOrderId: orderId,
      expectedAmountCents: cents,
      expectedCurrency: input.currency,
      checkedAt: new Date(),
    });
  } catch (error) {
    console.warn(
      "[PAYMOB_UNPAID_ORDER_INQUIRY_INCONCLUSIVE]",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  }
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
  /*
   * PAYMOB_ORDER_PAID_RECONCILIATION_V1
   *
   * An intention may have succeeded before we received its webhook.
   * When no acceptance transaction ID was stored, consult the
   * provider order's complete transaction list if available.
   *
   * Only positive, single-payment proof may change status.
   * Missing/ambiguous results never authorize retry or refund.
   */
  const savedPayload = readStoredPayload(transaction.providerPayload);
  const storedOrderId = String(savedPayload?.intentionOrderId ?? "").trim();

  if (
    !transaction.externalReference &&
    /^[0-9]+$/.test(storedOrderId)
  ) {
    try {
      assertExternalSideEffectsAllowed("Paymob order reconciliation");

      const token = await authenticate();

      const response = await fetch(
        `${getRegionBase()}/api/ecommerce/orders/${encodeURIComponent(storedOrderId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );

      if (response.ok) {
        const order: unknown = await response.json();

        // First use the order's complete transaction list when provided.
        // An absent list is not a failed payment: independently inquire by
        // our merchant reference, then require fresh Order + Acceptance proof.
        let confirmedTransactionId = assessPaymobOrderPositiveProof({
          order,
          expectedOrderId: storedOrderId,
          expectedMerchantOrderId: transaction.id,
          expectedAmountCents: Math.round(transaction.amount * 100),
          expectedCurrency: transaction.currency,
        });
        let reconciliationSource = "paymob_order_transactions";

        if (
          !confirmedTransactionId &&
          order &&
          typeof order === "object" &&
          !Array.isArray(order) &&
          (order as Record<string, unknown>).transactions === undefined
        ) {
          const inquiry = await inquirePaymobTransactionByMerchantReference(
            transaction.id,
          );
          const candidateId = inquiry.paymobTransactionId;
          const expectedAmountCents = Math.round(transaction.amount * 100);

          if (
            inquiry.found &&
            inquiry.status === "paid" &&
            inquiry.success === true &&
            inquiry.pending === false &&
            inquiry.merchantOrderId === transaction.id &&
            inquiry.amountCents === expectedAmountCents &&
            inquiry.currency === transaction.currency.trim().toUpperCase() &&
            candidateId &&
            /^[1-9][0-9]*$/.test(candidateId) &&
            await confirmPaymobOrderPaidForRecovery({
              paymentId: transaction.id,
              paymobOrderId: storedOrderId,
              paymobTransactionId: candidateId,
              amount: transaction.amount,
              currency: transaction.currency,
            })
          ) {
            confirmedTransactionId = candidateId;
            reconciliationSource = "paymob_merchant_reference_order_acceptance";
          }
        }

        if (confirmedTransactionId) {
          return {
            status: "paid",
            message: "Paymob order confirmed one matching successful payment.",
            providerReference: transaction.providerReference ?? null,
            externalReference: confirmedTransactionId,
            payload: {
              ...(savedPayload ?? {}),
              paymobOrderId: storedOrderId,
              paymobTransactionId: confirmedTransactionId,
              reconciliationSource,
            },
          };
        }
      }
    } catch (error) {
      console.warn(
        "[PAYMOB] Order reconciliation inconclusive",
        error instanceof Error ? error.name : "unknown_error",
      );
    }
  }
  if (transaction.externalReference) {
    assertExternalSideEffectsAllowed("Paymob transaction verification");
    const authToken = await authenticate();
    const response = await fetch(`${getRegionBase()}/api/acceptance/transactions/${transaction.externalReference}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      const acceptance = (await response.json()) as PaymobAcceptanceTransaction;
      const status = mapAcceptanceStatus(acceptance);
      // PAYMOB_ACCEPTANCE_INQUIRY_IDENTITY_V1
      // A provider response must belong to THIS stored transaction.
      // Missing or inconsistent evidence never settles a payment.
      const savedIdentity = readStoredPayload(transaction.providerPayload);
      const expectedOrderId = String(savedIdentity?.intentionOrderId ?? "").trim();
      const merchantOrderId = acceptance.order?.merchant_order_id ?? null;
      const specialReference = acceptance.special_reference ?? null;
      const expectedAmountCents = Math.round(transaction.amount * 100);
      const orderProven = /^[0-9]+$/.test(expectedOrderId)
        ? String(acceptance.order?.id ?? "") === expectedOrderId
        : merchantOrderId === transaction.id || specialReference === transaction.id;
      const identityMatches =
        Number.isSafeInteger(acceptance.id) &&
        String(acceptance.id) === transaction.externalReference &&
        Number.isSafeInteger(expectedAmountCents) &&
        expectedAmountCents > 0 &&
        Number.isSafeInteger(acceptance.amount_cents) &&
        acceptance.amount_cents === expectedAmountCents &&
        String(acceptance.currency ?? "").trim().toUpperCase() ===
          transaction.currency.trim().toUpperCase() &&
        orderProven &&
        (merchantOrderId === null || merchantOrderId === transaction.id) &&
        (specialReference === null || specialReference === transaction.id);
      const positivePaymentSafe =
        status !== "paid" ||
        (acceptance.success === true &&
          acceptance.pending === false &&
          acceptance.error_occured === false &&
          acceptance.is_refunded === false &&
          Number(acceptance.refunded_amount_cents ?? 0) === 0 &&
          acceptance.is_voided === false);
      if (!identityMatches || !positivePaymentSafe) {
        console.warn("[PAYMOB_ACCEPTANCE_RECONCILIATION_REQUIRED]", {
          transactionId: transaction.id,
        });
        return {
          status: "pending",
          message: "Payment identity requires reconciliation.",
          providerReference: transaction.providerReference ?? null,
          externalReference: transaction.externalReference ?? null,
          payload: savedIdentity,
        };
      }

      // PAYMOB_ORDER_FINAL_AUTHORITY_V1
      // Acceptance proves transaction identity, not final Order payment.
      // Never promote a Paymob payment to paid without a live Order
      // containing the same uniquely confirmed successful transaction.
      if (status === "paid") {
        const orderIdForProof = /^[0-9]+$/.test(expectedOrderId)
          ? expectedOrderId
          : String(acceptance.order?.id ?? "").trim();

        let confirmedOrderTransactionId: string | null = null;

        if (/^[0-9]+$/.test(orderIdForProof)) {
          try {
            const orderResponse = await fetch(
              `${getRegionBase()}/api/ecommerce/orders/${encodeURIComponent(orderIdForProof)}`,
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${authToken}`,
                },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                cache: "no-store",
              },
            );

            if (orderResponse.ok) {
              const liveOrder: unknown = await orderResponse.json();

              confirmedOrderTransactionId =
                assessPaymobOrderPositiveProof({
                  order: liveOrder,
                  expectedOrderId: orderIdForProof,
                  expectedMerchantOrderId: transaction.id,
                  expectedAmountCents,
                  expectedCurrency: transaction.currency,
                });

              // The live Order may omit transactions. Do not downgrade to
              // Acceptance-only proof: verify both independent responses.
              if (
                !confirmedOrderTransactionId &&
                liveOrder &&
                typeof liveOrder === "object" &&
                !Array.isArray(liveOrder) &&
                (liveOrder as Record<string, unknown>).transactions === undefined &&
                assessPaymobOrderAndAcceptanceProof({
                  order: liveOrder,
                  acceptance,
                  expectedOrderId: orderIdForProof,
                  expectedMerchantOrderId: transaction.id,
                  expectedTransactionId: String(acceptance.id ?? ""),
                  expectedAmountCents,
                  expectedCurrency: transaction.currency,
                })
              ) {
                confirmedOrderTransactionId = String(acceptance.id);
              }
            }
          } catch (error) {
            console.warn(
              "[PAYMOB_ORDER_FINAL_AUTHORITY_INCONCLUSIVE]",
              error instanceof Error ? error.name : "unknown",
            );
          }
        }

        if (
          confirmedOrderTransactionId !== String(acceptance.id)
        ) {
          console.warn(
            "[PAYMOB_ORDER_PAID_PROOF_REQUIRED]",
            { transactionId: transaction.id },
          );

          return {
            status: "pending",
            message:
              "Paymob Order payment confirmation is required before activation.",
            providerReference: transaction.providerReference ?? null,
            externalReference: transaction.externalReference ?? null,
            payload: savedIdentity,
          };
        }
      }

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
        providerReference: transaction.providerReference ?? null,
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

    // A stored HMAC-verified webhook proves the origin of an event,
    // not the current financial finality of this Paymob order.
    // Without live provider proof, do not infer paid or failed.
    // Preserve the saved evidence for later financial reconciliation.
    console.warn(
      "[PAYMOB_ACCEPTANCE_UNAVAILABLE_PENDING_RECONCILIATION]",
      { transactionId: transaction.id },
    );

  }

  return {
    status: "pending",
    message: "Payment is still pending until Paymob sends a callback or transaction reference.",
    providerReference: transaction.providerReference ?? null,
    externalReference: transaction.externalReference ?? null,
    payload: readStoredPayload(transaction.providerPayload),
  };
}

async function handleWebhook(
  payload: unknown,
  headers: Headers,
  queryHmac?: string | null,
): Promise<PaymentWebhookResult> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "invalid_payload" };
  }

  const body = payload as any;

  // Detect payload format
  const isNestedFormat = body.type === "TRANSACTION" && body.obj;
  const isFlatFormat = body.id && body.merchant_order_id;

  if (!isNestedFormat && !isFlatFormat) {
    return { ok: false, message: "Unsupported Paymob webhook payload." };
  }

  // Extract HMAC (query param takes priority)
  const providedHmac = String(queryHmac || body.hmac || "").trim();
  if (!providedHmac) {
    return { ok: false, code: "MISSING_HMAC", message: "Paymob webhook HMAC is required." };
  }

  // Handle nested format (Acceptance API)
  if (isNestedFormat) {
    const expected = computePaymobHmac(body.obj, requireSecret("PAYMOB_HMAC_SECRET"));
    if (!verifyHmac(providedHmac, expected)) {
      return { ok: false, code: "INVALID_HMAC", message: "Paymob webhook HMAC verification failed." };
    }

    const transactionId = body.obj.order?.merchant_order_id ?? body.obj.special_reference ?? null;
    if (!transactionId) {
      return { ok: false, message: "Paymob webhook did not include merchant_order_id." };
    }

    const status = mapAcceptanceStatus(body.obj);
    console.info("[PAYMOB] Webhook received (nested)", {
      transactionId,
      paymobOrderId: body.obj.order?.id ?? null,
      paymobTransactionId: body.obj.id ?? null,
      status,
    });

    return {
      ok: true,
      transactionId,
      status,
      providerReference: null,
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

  // Handle flat format (Unified Checkout)
  if (isFlatFormat) {
    const expected = computePaymobHmac(body, requireSecret("PAYMOB_HMAC_SECRET"));
    if (!verifyHmac(providedHmac, expected)) {
      return { ok: false, code: "INVALID_HMAC", message: "Paymob webhook HMAC verification failed." };
    }

    const transactionId = String(body.merchant_order_id ?? "").trim();
    if (!transactionId) {
      return { ok: false, message: "Paymob webhook did not include merchant_order_id." };
    }

    // Parse boolean fields (handle both boolean and string values)
    const success = body.success === true || body.success === "true";
    const pending = body.pending === true || body.pending === "true";
    const errorOccured = body.error_occured === true || body.error_occured === "true";

    const status = mapAcceptanceStatus({
      id: body.id ? Number(body.id) : undefined,
      success,
      pending,
      error_occured: errorOccured,
    });

    console.info("[PAYMOB] Webhook received (flat)", {
      transactionId,
      paymobTransactionId: body.id,
      status,
      success,
      pending,
    });

    return {
      ok: true,
      transactionId,
      status,
      providerReference: null, // Flat format doesn't include order.id
      externalReference: body.id ? String(body.id) : null,
      message: "Paymob Unified Checkout callback received.",
      payload: {
        webhookType: "UNIFIED_CHECKOUT",
        success,
        pending,
        sourceType: body.source_data_type ?? null,
        sourceSubtype: body.source_data_sub_type ?? null,
        txnResponseCode: body.txn_response_code ?? null,
        acqResponseCode: body.acq_response_code ?? null,
      },
    };
  }

  return { ok: false, message: "Unknown webhook format." };
}

/**
 * Remote Paymob Transaction Verification Result
 *
 * Used for recovery to verify transaction independently via Paymob API
 * BEFORE any local mutations.
 */
export type PaymobRemoteVerificationResult = {
  verified: boolean;
  transactionId: string;
  success: boolean;
  pending: boolean;
  amountCents: number;
  currency: string;
  paymobOrderId: number | null;
  specialReference: string | null;
  sourceType: string | null;
  isRefunded: boolean;
  isVoided: boolean;
  errorOccured: boolean;
  failureReason?: string;
};

/**
 * Verify a Paymob transaction remotely for recovery.
 *
 * CRITICAL: This function performs EXTERNAL verification via Paymob API
 * to ensure transaction exists, is successful, matches expected values,
 * AND belongs to the expected intention BEFORE any local database mutations.
 *
 * Used by recoverVerifiedPaymobPayment to validate:
 * - Transaction exists in Paymob
 * - Transaction belongs to expected intention (via special_reference linkage)
 * - Transaction is successful (not failed/pending/refunded/voided)
 * - Amount and currency match expected values
 * - FitZone reference matches if Paymob returns it
 *
 * INTENTION LINKAGE PROOF:
 * - Paymob returns transaction.special_reference (our PaymentTransaction.id)
 * - We verify local PaymentTransaction.providerReference === expectedIntentionId
 * - This proves transaction was created through the expected intention
 *
 * @param paymobTransactionId - Paymob transaction ID (e.g., "512944958")
 * @param expectedLocalTransactionId - Our PaymentTransaction.id (links to intention via special_reference)
 * @param expectedAmount - Expected amount in base currency units (e.g., 333 for 333 EGP)
 * @param expectedCurrency - Expected currency code (e.g., "EGP")
 * @param expectedFitZoneReference - Expected FitZone reference (e.g., "FZ-Offers-0000017")
 * @returns Remote verification result with transaction details and validation status
 */
export type PaymobMerchantReferenceInquiryResult = {
  found: boolean;
  status: "paid" | "failed" | "pending";
  paymobTransactionId: string | null;
  merchantOrderId: string | null;
  amountCents: number | null;
  currency: string | null;
  pending: boolean | null;
  success: boolean | null;
};

/**
 * Read-only recovery for the checkout-creation ambiguity window.
 *
 * Intention creation sends our PaymentTransaction.id as special_reference.
 * Paymob exposes it later as merchant_order_id, so this lookup remains
 * possible even when the intention response was lost before providerReference,
 * externalReference, providerPayload or expiresAt were persisted locally.
 *
 * This function performs NO local mutation and creates NO new checkout.
 */
export async function inquirePaymobTransactionByMerchantReference(
  localTransactionId: string,
): Promise<PaymobMerchantReferenceInquiryResult> {
  const merchantOrderId = String(
    localTransactionId ?? "",
  ).trim();

  if (!merchantOrderId) {
    throw new Error(
      "PAYMOB_MERCHANT_REFERENCE_REQUIRED",
    );
  }

  assertExternalSideEffectsAllowed(
    "Paymob transaction inquiry by merchant reference",
  );

  const authToken = await authenticate();

  const response = await fetch(
    `${getRegionBase()}/api/ecommerce/orders/transaction_inquiry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_token: authToken,
        merchant_order_id: merchantOrderId,
      }),
      signal: AbortSignal.timeout(
        FETCH_TIMEOUT_MS,
      ),
    },
  );

  if (response.status === 404) {
    return {
      found: false,
      status: "pending",
      paymobTransactionId: null,
      merchantOrderId,
      amountCents: null,
      currency: null,
      pending: null,
      success: null,
    };
  }

  if (!response.ok) {
    const text = await response
      .text()
      .catch(() => "");

    throw new Error(
      `PAYMOB_MERCHANT_REFERENCE_INQUIRY_FAILED:${response.status}:${text.slice(0, 300)}`,
    );
  }

  const transaction =
    (await response.json()) as PaymobAcceptanceTransaction;

  const returnedMerchantOrderId =
    transaction.order?.merchant_order_id != null
      ? String(
          transaction.order.merchant_order_id,
        )
      : transaction.special_reference != null
        ? String(transaction.special_reference)
        : null;

  if (
    returnedMerchantOrderId !== null &&
    returnedMerchantOrderId !== merchantOrderId
  ) {
    throw new Error(
      "PAYMOB_MERCHANT_REFERENCE_INQUIRY_LINK_MISMATCH",
    );
  }

  // A successful attempt is not proof of retained funds. Refunded,
  // voided, partially refunded and provider-error payments need review.
  const mappedStatus = mapAcceptanceStatus(transaction);
  const finalPaid = mappedStatus === "paid" &&
    isFinalRetainedPaymobPayment(transaction);
  const safeStatus = mappedStatus === "paid" && !finalPaid
    ? "pending" as const : mappedStatus;

  return {
    found: true,

    /*
     * mapAcceptanceStatus is deliberately normalized to:
     * paid | failed | pending
     */
    status: safeStatus,

    paymobTransactionId:
      transaction.id != null
        ? String(transaction.id)
        : null,

    merchantOrderId:
      returnedMerchantOrderId,

    amountCents:
      typeof transaction.amount_cents === "number"
        ? transaction.amount_cents
        : null,

    currency:
      typeof transaction.currency === "string"
        ? transaction.currency.toUpperCase()
        : null,

    pending:
      typeof transaction.pending === "boolean"
        ? transaction.pending
        : null,

    success:
      typeof transaction.success === "boolean"
        ? transaction.success
        : null,
  };
}
export async function verifyPaymobTransactionForRecovery(
  paymobTransactionId: string,
  expectedLocalTransactionId: string,
  expectedAmount: number,
  expectedCurrency: string,
  expectedFitZoneReference: string,
): Promise<PaymobRemoteVerificationResult> {
  const authToken = await authenticate();

  const response = await fetch(`${getRegionBase()}/api/acceptance/transactions/${paymobTransactionId}`, {
    headers: { Authorization: `Bearer ${authToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      verified: false,
      transactionId: paymobTransactionId,
      success: false,
      pending: true,
      amountCents: 0,
      currency: "",
      paymobOrderId: null,
      specialReference: null,
      sourceType: null,
      isRefunded: false,
      isVoided: false,
      errorOccured: true,
      failureReason: `Paymob API returned ${response.status}. Transaction may not exist or API is unavailable.`,
    };
  }

  const tx = (await response.json()) as PaymobAcceptanceTransaction;
  const amountCents = tx.amount_cents ?? 0;
  const amountInCurrency = amountCents / 100;
  const currency = (tx.currency ?? "").toUpperCase();
  const success = tx.success ?? false;
  const pending = tx.pending ?? true;
  const isRefunded = tx.is_refunded ?? false;
  const isVoided = tx.is_voided ?? false;
  const errorOccured = tx.error_occured ?? false;
  const specialReference = tx.special_reference ?? null;
  const sourceType = tx.source_data?.type ?? null;
  const paymobOrderId = tx.order?.id ?? null;

  // Extract merchant_order_id from order (LIVE PAYMOB: this is the actual linkage field)
  const merchantOrderId = tx.order?.merchant_order_id ?? null;

  // Validation checks
  const checks = {
    exists: response.ok,
    transactionIdMatch: String(tx.id ?? "") === paymobTransactionId,
    success: success === true,
    notPending: pending === false,
    amountMatch: amountInCurrency === expectedAmount,
    currencyMatch: currency === expectedCurrency.toUpperCase(),
    notRefunded: isRefunded === false,
    notVoided: isVoided === false,
    noError: errorOccured === false,
    // CRITICAL: Verify transaction belongs to our PaymentTransaction via merchant_order_id
    // LIVE PAYMOB PROOF: order.merchant_order_id === our PaymentTransaction.id
    transactionLinkage: merchantOrderId === expectedLocalTransactionId,
  };

  const verified = Object.values(checks).every((check) => check === true);

  const failureReasons: string[] = [];
  if (!checks.transactionIdMatch) failureReasons.push("transaction_id_mismatch");
  if (!checks.success) failureReasons.push("success=false");
  if (!checks.notPending) failureReasons.push("pending=true");
  if (!checks.amountMatch) failureReasons.push(`amount=${amountInCurrency} (expected ${expectedAmount})`);
  if (!checks.currencyMatch) failureReasons.push(`currency=${currency} (expected ${expectedCurrency})`);
  if (!checks.notRefunded) failureReasons.push("refunded");
  if (!checks.notVoided) failureReasons.push("voided");
  if (!checks.noError) failureReasons.push("error_occured=true");
  if (!checks.transactionLinkage) failureReasons.push(`merchant_order_id=${merchantOrderId} (expected ${expectedLocalTransactionId} to prove transaction linkage)`);

  return {
    verified,
    transactionId: String(tx.id ?? paymobTransactionId),
    success,
    pending,
    amountCents,
    currency,
    paymobOrderId,
    specialReference,
    sourceType,
    isRefunded,
    isVoided,
    errorOccured,
    failureReason: failureReasons.length > 0 ? failureReasons.join(", ") : undefined,
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
