import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { siteContent: { findUnique: mocks.settings } },
}));

import { getPaymentSettings } from "@/lib/payments/settings";

describe("Paymob existing Production environment compatibility (no provider network)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.settings.mockResolvedValue(null);
    vi.stubEnv("PAYMOB_ENV", "live");
    vi.stubEnv("PAYMOB_INTEGRATION_ID", "5613515");
    vi.stubEnv("PAYMOB_CARD_INTEGRATION_ID", "");
    vi.stubEnv("PAYMOB_PUBLIC_KEY", "egy_pk_live_FAKE_FIXTURE_NOT_A_KEY");
    vi.stubEnv("PAYMOB_MERCHANT_ID", "1152714");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the existing PAYMOB_INTEGRATION_ID without requiring a renamed env variable", async () => {
    const s = await getPaymentSettings();
    expect(s.cardIntegrationId).toBe("5613515");
    expect(s.integrationId).toBe("5613515");
    expect(s.publicKey).toBe("egy_pk_live_FAKE_FIXTURE_NOT_A_KEY");
    expect(s.sandboxMode).toBe(false);
    expect(mocks.settings).toHaveBeenCalledWith({
      where: { section: "paymentSettings" },
    });
  });

  it("honors the original card env variable if the Live server defines both aliases", async () => {
    vi.stubEnv("PAYMOB_CARD_INTEGRATION_ID", "2222222");
    const s = await getPaymentSettings();
    expect(s.cardIntegrationId).toBe("2222222");
    expect(s.integrationId).toBe("2222222");
  });

  it("preserves stored Production callback settings and cards/wallet switches while mapping Live ID", async () => {
    mocks.settings.mockResolvedValue({
      content: JSON.stringify({
        webhookUrl: "https://existing-live.example.test/api/payments/webhook/paymob",
        returnUrl: "https://existing-live.example.test/payment/verify",
        enableCards: true,
        enableWallets: true,
        walletIntegrationId: "7654321",
      }),
    });
    const s = await getPaymentSettings();
    expect(s.webhookUrl).toBe(
      "https://existing-live.example.test/api/payments/webhook/paymob",
    );
    expect(s.returnUrl).toBe("https://existing-live.example.test/payment/verify");
    expect(s.enableCards).toBe(true);
    expect(s.enableWallets).toBe(true);
    expect(s.walletIntegrationId).toBe("7654321");
    expect(s.cardIntegrationId).toBe("5613515");
  });
});
