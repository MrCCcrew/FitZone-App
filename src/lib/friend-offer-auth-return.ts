export const FRIEND_OFFER_RETURN_COOKIE = "oauth_friend_offer_return";

/**
 * Only an existing Friend Offer invitation may use this auth continuation.
 * Never accept arbitrary external or protocol-relative redirect targets.
 */
export function normalizeFriendOfferReturn(raw: string | null): string | null {
  if (!raw || raw.length > 512 ||
      !raw.startsWith("/") || raw.startsWith("//") ||
      raw.includes(String.fromCharCode(92)) ||
      Array.from(raw).some((ch) => ch.charCodeAt(0) < 32)) {
    return null;
  }

  // A creator may resume the Offers page before an invite exists.
  // Accept only this exact local destination.
  if (raw === "/?page=offers") return raw;

  try {
    const url = new URL(raw, "https://fitzoneland.com");
    if (url.origin !== "https://fitzoneland.com" ||
        url.pathname !== "/" ||
        url.searchParams.getAll("page").length !== 1 ||
        url.searchParams.get("page") !== "offers" ||
        url.searchParams.getAll("friendOffer").length !== 1) {
      return null;
    }

    const token = url.searchParams.get("friendOffer");
    if (!token || !/^[A-Za-z0-9_-]{24}$/.test(token)) return null;

    return `/?page=offers&friendOffer=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export function withFriendOfferReturn(
  path: string,
  friendReturn: string | null,
): string {
  const valid = normalizeFriendOfferReturn(friendReturn);
  if (!valid) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}callbackUrl=${encodeURIComponent(valid)}`;
}
