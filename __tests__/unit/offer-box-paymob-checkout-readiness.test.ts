import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ settings: vi.fn() }));

vi.mock("@/lib/payments/settings", () => ({
  getPaymentSettings: mocks.settings,
}));

import { isOfferBoxPaymobCheckoutReady } from
  "@/lib/payments/offer-box-checkout-readiness";

const configured = {
  enabled: true,
  publicKey: "test-public-key",
  cardIntegrationId: "10001",
  integrationId: "10001",
  walletIntegrationId: "",
  valuIntegrationId: "",
  symplIntegrationId: "",
  souhoolaIntegrationId: "",
  enableCards: true,
  enableWallets: false,
  enableValu: false,
  enableSympl: false,
  enableSouhoola: false,
};

describe("Offer Box Paymob local readiness before any reservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("ALLOW_EXTERNAL_SIDE_EFFECTS", "false");
    vi.stubEnv("PAYMOB_SECRET_KEY", "synthetic-test-secret");
    mocks.settings.mockResolvedValue({ ...configured });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing public key before checkout", async () => {
    mocks.settings.mockResolvedValue({
      ...configured, publicKey: "",
    });
    expect(await isOfferBoxPaymobCheckoutReady()).toBe(false);
  });

  it("rejects disabled provider and missing private key", async () => {
    mocks.settings.mockResolvedValue({ ...configured, enabled: false });
    expect(await isOfferBoxPaymobCheckoutReady()).toBe(false);
    mocks.settings.mockResolvedValue({ ...configured });
    vi.stubEnv("PAYMOB_SECRET_KEY", "");
    expect(await isOfferBoxPaymobCheckoutReady()).toBe(false);
  });

  it("rejects missing or invalid enabled integration IDs", async () => {
    mocks.settings.mockResolvedValue({
      ...configured, cardIntegrationId: "invalid", integrationId: "",
    });
    expect(await isOfferBoxPaymobCheckoutReady()).toBe(false);
  });

  it("keeps isolated test and staging payment side effects disabled", async () => {
    for (const appEnv of ["test", "staging"]) {
      vi.stubEnv("APP_ENV", appEnv);
      expect(await isOfferBoxPaymobCheckoutReady()).toBe(false);
    }
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("accepts locally valid production configuration without calling Paymob", async () => {
    expect(await isOfferBoxPaymobCheckoutReady()).toBe(true);
    expect(mocks.settings).toHaveBeenCalledOnce();
  });
});
