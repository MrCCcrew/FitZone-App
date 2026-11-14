import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));

vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: vi.fn(),
}));

import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";

describe("Paymob stored webhook fallback financial identity", () => {
  beforeEach(() => {
    process.env.PAYMOB_API_KEY = "unit_test_only_not_real";
  });

  afterEach(() => {
    delete process.env.PAYMOB_API_KEY;
    vi.unstubAllGlobals();
  });

  it("must not accept a stored paid webhook belonging to another transaction", async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const endpoint = String(url);

      if (endpoint.includes("/api/auth/tokens")) {
        return {
          ok: true,
          json: async () => ({ token: "unit_test_token" }),
        };
      }

      if (endpoint.includes("/api/acceptance/transactions/891234")) {
        return {
          ok: false,
          status: 503,
        };
      }

      throw new Error("UNEXPECTED_EXTERNAL_REQUEST");
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await paymobPaymentProvider.verifyTransaction({
      id: "payment-test-1",
      providerReference: "pi_test_001",
      externalReference: "891234",
      amount: 90,
      currency: "EGP",
      providerPayload: JSON.stringify({
        intentionOrderId: "123456",
        webhookType: "TRANSACTION",
        paymobTransactionId: 891233,
        success: true,
        pending: false,
        error_occured: false,
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Historical evidence for 891233 cannot prove payment 891234.
    expect(result.status).toBe("pending");
  });
});
