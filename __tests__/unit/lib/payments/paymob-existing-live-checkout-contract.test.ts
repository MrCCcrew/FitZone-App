import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  findSettings: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { siteContent: { findUnique: fixtures.findSettings } },
}));

// Actual Paymob provider and actual settings normalization, with HTTP mocked.
// No Paymob network, Live credentials or Production database access.
import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";

describe("Existing Live Paymob checkout compatibility (network is always mocked)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("PAYMOB_ENV", "live");
    vi.stubEnv("PAYMOB_SECRET_KEY", "egy_sk_live_FAKE_NOT_A_REAL_SECRET");
    vi.stubEnv("PAYMOB_PUBLIC_KEY", "egy_pk_live_FAKE_NOT_A_REAL_KEY");
    vi.stubEnv("PAYMOB_INTEGRATION_ID", "7654321");
    vi.stubEnv("PAYMOB_CARD_INTEGRATION_ID", "");
    vi.stubEnv("PAYMOB_WALLET_INTEGRATION_ID", "2345678");
    vi.stubEnv("PAYMOB_REGION_BASE", "https://accept.paymob.com");

    fixtures.findSettings.mockResolvedValue({
      content: JSON.stringify({
        enabled: true,
        enableCards: true,
        enableWallets: true,
        webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
        returnUrl: "https://fitzoneland.com/payment/verify",
        cancelUrl: "https://fitzoneland.com/payment/verify?state=cancel",
      }),
    });

    fixtures.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "pi_live_FAKE_PROVIDER_RESPONSE",
          intention_order_id: 1234567,
          client_secret: "egy_csk_live_FAKE_PROVIDER_RESPONSE",
          payment_methods: [
            { integration_id: 7654321, name: "Card" },
            { integration_id: 2345678, name: "Wallet" },
          ],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fixtures.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("preserves the current Live API request with existing env aliases and existing callbacks", async () => {
    const result = await paymobPaymentProvider.createCheckout({
      transactionId: "fitzone-fixture-payment-1",
      amount: 300,
      currency: "EGP",
      purpose: "membership",
      membershipHoldExpiresAt: new Date(Date.now() + 60 * 60_000),
      customer: {
        id: "user-fixture",
        name: "QA Customer",
        phone: "+201000000000",
      },
      context: {
        membershipId: "membership-fixture",
        paymentMethod: "paymob",
      },
    });

    expect(fixtures.fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fixtures.fetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://accept.paymob.com/v1/intention/");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Token egy_sk_live_FAKE_NOT_A_REAL_SECRET",
    });

    const body = JSON.parse(String(options.body));
    expect(body.payment_methods).toEqual([7654321, 2345678]);
    expect(body.amount).toBe(30_000);
    expect(body.currency).toBe("EGP");
    expect(body.special_reference).toBe("fitzone-fixture-payment-1");
    expect(body.notification_url).toBe(
      "https://fitzoneland.com/api/payments/webhook/paymob",
    );
    const redirect = new URL(body.redirection_url);
    expect(redirect.origin).toBe("https://fitzoneland.com");
    expect(redirect.searchParams.get("transactionId")).toBe(
      "fitzone-fixture-payment-1",
    );

    expect(result.provider).toBe("paymob");
    expect(result.status).toBe("pending");
    expect(result.payload?.paymentMethodIds).toEqual([7654321, 2345678]);
    expect(result.payload?.sandboxMode).toBe(false);
    expect(result.payload?.notificationUrl).toBe(body.notification_url);
    expect(result.checkoutUrl).toContain("/unifiedcheckout/");
  });
});
