import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));
vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: vi.fn(),
}));

import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";

const base = {
  id: 891234,
  amount_cents: 9000,
  currency: "EGP",
  success: true,
  pending: false,
  error_occured: false,
  is_voided: false,
  is_refunded: false,
  refunded_amount_cents: 0,
  order: { id: 123456, merchant_order_id: "payment-test-1" },
  special_reference: "payment-test-1",
};
const transaction = {
  id: "payment-test-1",
  providerReference: "pi_test_001",
  externalReference: "891234",
  amount: 90,
  currency: "EGP",
  providerPayload: JSON.stringify({ intentionOrderId: "123456" }),
};

async function inquire(
  changes: Record<string, unknown> = {},
  txChanges: Record<string, unknown> = {},
) {
  const acceptance = { ...base, ...changes };
  const fetchMock = vi.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).includes("/api/auth/tokens")) {
      return { ok: true, json: async () => ({ token: "test_auth_token" }) };
    }
    expect(String(url)).toContain("/api/acceptance/transactions/891234");
    expect((options?.headers as Record<string, string>).Authorization)
      .toBe("Bearer test_auth_token");
    return { ok: true, json: async () => acceptance };
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await paymobPaymentProvider.verifyTransaction({
    ...transaction,
    ...txChanges,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  return result.status;
}

describe("Paymob acceptance inquiry: exact transaction identity", () => {
  beforeEach(() => {
    process.env.PAYMOB_API_KEY = "unit_test_only_not_real";
  });
  afterEach(() => {
    delete process.env.PAYMOB_API_KEY;
    vi.unstubAllGlobals();
  });

  it("accepts the exact paid amount, currency, order and transaction", async () => {
    expect(await inquire()).toBe("paid");
  });
  it("rejects a foreign Paymob transaction ID", async () => {
    expect(await inquire({ id: 111 })).toBe("pending");
  });
  it("rejects a different amount", async () => {
    expect(await inquire({ amount_cents: 9100 })).toBe("pending");
  });
  it("rejects a different currency", async () => {
    expect(await inquire({ currency: "USD" })).toBe("pending");
  });
  it("rejects a foreign provider order", async () => {
    expect(await inquire({ order: { id: 999, merchant_order_id: "payment-test-1" } })).toBe("pending");
  });
  it("rejects another local payment owner", async () => {
    expect(await inquire({ order: { id: 123456, merchant_order_id: "other-payment" } })).toBe("pending");
  });
  it("rejects a foreign special reference", async () => {
    expect(await inquire({ special_reference: "other-payment" })).toBe("pending");
  });
  it("does not activate a refunded payment", async () => {
    expect(await inquire({ is_refunded: true })).toBe("pending");
  });
  it("does not activate a partially refunded payment", async () => {
    expect(await inquire({ refunded_amount_cents: 500 })).toBe("pending");
  });
  it("does not activate a voided payment", async () => {
    expect(await inquire({ is_voided: true })).toBe("pending");
  });
  it("does not activate an erroneous payment", async () => {
    expect(await inquire({ error_occured: true })).toBe("pending");
  });
  it("does not activate without the provider safety flags", async () => {
    expect(await inquire({ is_refunded: undefined })).toBe("pending");
  });
  it("requires transaction ownership when provider order was not saved", async () => {
    const tx = { providerPayload: "{}" };
    expect(await inquire({ order: { id: 123456, merchant_order_id: "other-payment" }, special_reference: null }, tx))
      .toBe("pending");
  });
  it("supports exact transaction ownership for legacy rows without order ID", async () => {
    expect(await inquire({}, { providerPayload: "{}" })).toBe("paid");
  });
});