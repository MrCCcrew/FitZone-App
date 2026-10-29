import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));
vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: vi.fn(),
}));

import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";

const merchantId = "cmvr1hocs0060l1ifchv0qp2f";
const orderId = 640961343;
const acceptanceId = 987654321;
const amountCents = 34300;

function acceptance(overrides: Record<string, unknown> = {}) {
  return {
    id: acceptanceId,
    order: { id: orderId, merchant_order_id: merchantId },
    special_reference: merchantId,
    amount_cents: amountCents,
    currency: "EGP",
    success: true,
    pending: false,
    error_occured: false,
    is_refunded: false,
    refunded_amount_cents: 0,
    is_voided: false,
    ...overrides,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    merchant_order_id: merchantId,
    amount_cents: amountCents,
    currency: "EGP",
    paid_amount_cents: amountCents,
    ...overrides,
  };
}

function mockPaymob(input: {
  order?: Record<string, unknown>;
  inquiry?: Record<string, unknown>;
  acceptance?: Record<string, unknown>;
} = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (request: string | URL | Request) => {
    const url = String(request);
    calls.push(url);
    let body: unknown;

    if (url.endsWith("/api/auth/tokens")) {
      body = { token: "test-auth-token" };
    } else if (url.endsWith("/api/ecommerce/orders/transaction_inquiry")) {
      body = input.inquiry ?? acceptance();
    } else if (url.endsWith(`/api/ecommerce/orders/${orderId}`)) {
      body = input.order ?? order();
    } else if (url.endsWith(`/api/acceptance/transactions/${acceptanceId}`)) {
      body = input.acceptance ?? acceptance();
    } else {
      throw new Error(`Unexpected Paymob URL: ${url}`);
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function payment(externalReference: string | null = null) {
  return {
    id: merchantId,
    providerReference: "intention-test",
    externalReference,
    amount: 343,
    currency: "EGP",
    metadata: "{}",
    providerPayload: JSON.stringify({ intentionOrderId: String(orderId) }),
  };
}

describe("Paymob late paid membership recovery", () => {
  beforeEach(() => {
    vi.stubEnv("PAYMOB_API_KEY", "test-api-key");
    vi.stubEnv("PAYMOB_REGION_BASE", "https://paymob.example.test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("discovers a missing Acceptance ID via merchant reference and requires independent Order + Acceptance proof", async () => {
    const { calls } = mockPaymob();
    const result = await paymobPaymentProvider.verifyTransaction(payment());
    expect(result.status).toBe("paid");
    expect(result.externalReference).toBe(String(acceptanceId));
    expect((result.payload as Record<string, unknown>).reconciliationSource)
      .toBe("paymob_merchant_reference_order_acceptance");
    expect(calls.some((url) => url.endsWith("/api/ecommerce/orders/transaction_inquiry"))).toBe(true);
    expect(calls.some((url) => url.endsWith(`/api/acceptance/transactions/${acceptanceId}`))).toBe(true);
  });

  it("accepts the same independently verified proof on the second status-finalization check", async () => {
    const { calls } = mockPaymob();
    const result = await paymobPaymentProvider.verifyTransaction(payment(String(acceptanceId)));
    expect(result.status).toBe("paid");
    expect(result.externalReference).toBe(String(acceptanceId));
    expect(calls.some((url) => url.endsWith(`/api/ecommerce/orders/${orderId}`))).toBe(true);
    expect(calls.some((url) => url.endsWith(`/api/acceptance/transactions/${acceptanceId}`))).toBe(true);
  });

  it("does not bypass a malformed transaction list", async () => {
    const { calls } = mockPaymob({ order: order({ transactions: "invalid" }) });
    const result = await paymobPaymentProvider.verifyTransaction(payment());
    expect(result.status).toBe("pending");
    expect(calls.some((url) => url.endsWith("/api/ecommerce/orders/transaction_inquiry"))).toBe(false);
  });

  it("does not auto-activate a different merchant order", async () => {
    mockPaymob({
      inquiry: acceptance({
        special_reference: "different-merchant",
        order: { id: orderId, merchant_order_id: "different-merchant" },
      }),
    });
    const result = await paymobPaymentProvider.verifyTransaction(payment());
    expect(result.status).toBe("pending");
  });

  it("does not accept refunded Acceptance proof", async () => {
    mockPaymob({
      inquiry: acceptance({ is_refunded: true, refunded_amount_cents: amountCents }),
      acceptance: acceptance({ is_refunded: true, refunded_amount_cents: amountCents }),
    });
    const result = await paymobPaymentProvider.verifyTransaction(payment());
    expect(result.status).toBe("pending");
  });

  it("does not accept an Order with a contradictory captured total", async () => {
    mockPaymob({ order: order({ paid_amount_cents: amountCents * 2 }) });
    const result = await paymobPaymentProvider.verifyTransaction(payment());
    expect(result.status).toBe("pending");
  });

  it("does not accept a different Acceptance transaction on finalization", async () => {
    mockPaymob({
      acceptance: acceptance({ id: acceptanceId + 1 }),
    });
    const result = await paymobPaymentProvider.verifyTransaction(payment(String(acceptanceId)));
    expect(result.status).toBe("pending");
  });
});
