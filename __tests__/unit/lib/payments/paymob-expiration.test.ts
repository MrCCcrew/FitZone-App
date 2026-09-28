import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  getPaymentSettingsMock,
  assertExternalSideEffectsAllowedMock,
} = vi.hoisted(() => ({
  getPaymentSettingsMock: vi.fn(),
  assertExternalSideEffectsAllowedMock: vi.fn(),
}));

vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: getPaymentSettingsMock,
}));

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed:
    assertExternalSideEffectsAllowedMock,
}));

import {
  paymobPaymentProvider,
} from "@/lib/payments/providers/paymob";

describe("Paymob checkout expiration alignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-09-28T00:00:00.000Z"),
    );

    process.env.PAYMOB_SECRET_KEY =
      "test_secret_key_not_real";

    getPaymentSettingsMock.mockResolvedValue({
      enabled: true,
      publicKey: "test_public_key_not_real",

      enableCards: true,
      cardIntegrationId: "123456",
      integrationId: "",

      enableWallets: false,
      walletIntegrationId: "",

      enableValu: false,
      valuIntegrationId: "",

      enableSympl: false,
      symplIntegrationId: "",

      enableSouhoola: false,
      souhoolaIntegrationId: "",

      returnUrl:
        "https://example.test/payment/verify",
      cancelUrl:
        "https://example.test/payment/cancel",
      webhookUrl:
        "https://example.test/api/payments/webhook/paymob",

      sandboxMode: true,
      merchantId: "test-merchant",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: "test-intention-1",
          client_secret:
            "test_client_secret_not_real",
          payment_methods: [],
        }),
        text: vi.fn().mockResolvedValue(""),
      }),
    );
  });

  afterEach(() => {
    delete process.env.PAYMOB_SECRET_KEY;

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the same 30-minute expiration remotely and locally", async () => {
    const result =
      await paymobPaymentProvider.createCheckout({
        transactionId: "tx-expiration-test",
        amount: 150,
        currency: "EGP",
        purpose: "order",

        returnUrl:
          "https://example.test/payment/verify",
        cancelUrl:
          "https://example.test/payment/cancel",

        customer: {
          id: "user-test",
          name: "Test User",
          email: "test@example.test",
          phone: "+201000000000",
        },

        context: {
          orderId: "order-test",
          paymentMethod: "paymob",
        },
      });

    const fetchMock =
      vi.mocked(globalThis.fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit =
      fetchMock.mock.calls[0]?.[1] as RequestInit;

    const requestBody =
      JSON.parse(String(requestInit.body));

    expect(requestBody.expiration).toBe(1800);

    expect(result.expiresAt).toEqual(
      new Date("2026-09-28T00:30:00.000Z"),
    );

    expect(
      result.expiresAt!.getTime() -
        Date.now(),
    ).toBe(requestBody.expiration * 1000);
  });
});