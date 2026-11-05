import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// HTTP contract tests: fetch is always mocked. They NEVER send requests to
// Paymob, create real Intention objects, or charge any payment method.
vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: vi.fn(),
}));

import { renewExistingMembershipPaymobIntention } from "@/lib/payments/providers/paymob";

const ORIGINAL_ID = "pi_test_fitzone123";
const ORIGINAL_ORDER = "8675309";
const ORIGINAL_SECRET = "egy_csk_test_originalabc";
const TRANSACTION = "fitzone-transaction-123";
const originalPayload = JSON.stringify({
  providerMode: "paymob_unified_checkout",
  intentionId: ORIGINAL_ID,
  intentionOrderId: ORIGINAL_ORDER,
  clientSecret: ORIGINAL_SECRET,
  publicKey: "egy_pk_test_example",
  paymentMethodIds: [123, 456],
  notificationUrl: "https://test.example.invalid/api/payments/webhook/paymob",
  returnUrl: "https://test.example.invalid/payment/verify",
});

function request() {
  return {
    transactionId: TRANSACTION,
    providerReference: ORIGINAL_ID,
    providerPayload: originalPayload,
    amount: 90,
    currency: "EGP",
    pendingExpiresAt: new Date(Date.now() + 20 * 60_000),
    customer: {
      id: "user-123",
      name: "Test Customer",
      email: "test@example.invalid",
    },
  };
}

function positiveResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: ORIGINAL_ID,
    intention_order_id: Number(ORIGINAL_ORDER),
    client_secret: "egy_csk_test_renewedabc",
    special_reference: TRANSACTION,
    confirmed: false,
    status: "intended",
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

describe("Paymob Update Intention HTTP contract (no outbound requests)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("PAYMOB_SECRET_KEY", "egy_sk_test_local_mock_only");
    vi.stubEnv("PAYMOB_REGION_BASE", "https://accept.paymob.com");
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(positiveResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("updates the SAME intention and order, preserving amount and local merchant reference", async () => {
    const renewed = await renewExistingMembershipPaymobIntention(request());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://accept.paymob.com/v1/intention/egy_csk_test_originalabc/",
    );
    expect(options.method).toBe("PUT");
    expect(options.headers).toMatchObject({
      Authorization: "Token egy_sk_test_local_mock_only",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body.accept_order_id).toBe(Number(ORIGINAL_ORDER));
    expect(body.amount).toBe(9000);
    expect(body.currency).toBe("EGP");
    expect(body.special_reference).toBe(TRANSACTION);
    expect(body.payment_methods).toEqual([123, 456]);
    expect(Number(body.expiration)).toBeGreaterThan(0);
    expect(Number(body.expiration)).toBeLessThan(20 * 60);
    expect(body.notification_url).toBe(
      "https://test.example.invalid/api/payments/webhook/paymob",
    );
    expect(body.redirection_url).toContain(
      "transactionId=fitzone-transaction-123",
    );

    const urlResult = new URL(renewed.checkoutUrl);
    expect(urlResult.pathname).toBe("/unifiedcheckout/");
    expect(urlResult.searchParams.get("clientSecret")).toBe(
      "egy_csk_test_renewedabc",
    );
    expect(renewed.providerReference).toBe(ORIGINAL_ID);
    expect(renewed.expiresAt.getTime()).toBeLessThan(
      request().pendingExpiresAt.getTime(),
    );
  });

  it.each([
    ["different intention", { id: "pi_test_other" }],
    ["different Paymob order", { intention_order_id: 12345 }],
    ["different merchant reference", { special_reference: "other-transaction" }],
    ["already confirmed", { confirmed: true }],
    ["unexpected status", { status: "paid" }],
    ["no client secret", { client_secret: "" }],
  ])("rejects %s without yielding any checkout", async (_name, override) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(positiveResponse(override)), {
        status: 200,
      }),
    );
    await expect(
      renewExistingMembershipPaymobIntention(request()),
    ).rejects.toThrow("PAYMOB_RENEWAL_RESULT_REQUIRES_RECONCILIATION");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps non-2xx API results blocked without fallback Intention creation", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "expired" }), {
        status: 400,
      }),
    );

    await expect(
      renewExistingMembershipPaymobIntention(request()),
    ).rejects.toThrow("PAYMOB_RENEWAL_PROVIDER_REJECTED_400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a checkout whose original 60-minute hold has ended", async () => {
    await expect(
      renewExistingMembershipPaymobIntention({
        ...request(),
        pendingExpiresAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow("PAYMOB_CHECKOUT_HOLD_TOO_CLOSE_TO_EXPIRY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks corrupted original order identity without contacting Paymob", async () => {
    const invalid = JSON.stringify({
      ...JSON.parse(originalPayload),
      intentionOrderId: "not-a-provider-order",
    });
    await expect(
      renewExistingMembershipPaymobIntention({
        ...request(),
        providerPayload: invalid,
      }),
    ).rejects.toThrow("PAYMOB_RENEWAL_IDENTITY_INVALID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
