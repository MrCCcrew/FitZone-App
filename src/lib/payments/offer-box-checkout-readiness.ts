import { getPaymentSettings } from "@/lib/payments/settings";

/**
 * Verify only LOCAL configuration, before reserving a customer's Offer Box
 * capacity or persisting a payment. Never contact Paymob in this check.
 *
 * Network timeouts or ambiguous provider responses must remain subject to
 * the existing paid-wins reconciliation; they are NOT grounds for releasing
 * a live reservation.
 */
export async function isOfferBoxPaymobCheckoutReady(): Promise<boolean> {
  if (
    (process.env.APP_ENV === "test" ||
      process.env.APP_ENV === "staging") &&
    process.env.ALLOW_EXTERNAL_SIDE_EFFECTS !== "true"
  ) {
    return false;
  }

  const settings = await getPaymentSettings();
  if (
    !settings.enabled ||
    !String(settings.publicKey ?? "").trim() ||
    !String(process.env.PAYMOB_SECRET_KEY ?? "").trim()
  ) {
    return false;
  }

  const methodGroups = [
    [settings.enableCards, settings.cardIntegrationId || settings.integrationId],
    [settings.enableWallets, settings.walletIntegrationId],
    [settings.enableValu, settings.valuIntegrationId],
    [settings.enableSympl, settings.symplIntegrationId],
    [settings.enableSouhoola, settings.souhoolaIntegrationId],
  ] as const;

  return methodGroups.some(([enabled, ids]) =>
    enabled && String(ids ?? "").split(",").some(value => {
      const trimmed = value.trim();
      const n = Number(trimmed);
      return /^\d+$/.test(trimmed) &&
        Number.isSafeInteger(n) && n > 0;
    })
  );
}
