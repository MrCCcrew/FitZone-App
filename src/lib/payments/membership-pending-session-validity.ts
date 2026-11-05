/**
 * Read-only validation of an already-created membership checkout.
 * Does not authorize renewal, provider mutation, payment or activation.
 */
export function validReusableMembershipCheckoutUrl(input: {
  checkoutUrl: string | null;
  expiresAt: Date | null;
  holdExpiresAt: Date | null;
  now: Date;
}): string | null {
  const nowMs = input.now.getTime();
  const paymentExpiry = input.expiresAt?.getTime();
  const holdExpiry = input.holdExpiresAt?.getTime();

  if (
    !Number.isFinite(nowMs) ||
    paymentExpiry == null ||
    !Number.isFinite(paymentExpiry) ||
    holdExpiry == null ||
    !Number.isFinite(holdExpiry) ||
    paymentExpiry <= nowMs ||
    holdExpiry <= nowMs ||
    paymentExpiry > holdExpiry
  ) {
    return null;
  }

  const raw = input.checkoutUrl;

  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.trim() !== raw
  ) {
    return null;
  }

  try {
    const url = new URL(raw);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return raw;
  } catch {
    return null;
  }
}
