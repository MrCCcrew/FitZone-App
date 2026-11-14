/**
 * Display-only title for an independent Offer Box commission.
 * The purchase snapshot is authoritative for historical titles.
 * This helper never calculates or settles commission amounts.
 */
export function getOfferBoxCommissionTitle(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;

  try {
    const snapshot = JSON.parse(raw) as {
      offer?: { title?: unknown };
      membershipTemplate?: { name?: unknown };
    } | null;

    const title = snapshot?.offer?.title;

    if (typeof title === "string" && title.trim()) {
      return title;
    }

    const legacyTitle = snapshot?.membershipTemplate?.name;

    if (
      typeof legacyTitle === "string" &&
      legacyTitle.trim()
    ) {
      return legacyTitle;
    }
  } catch {
    // A malformed historical display snapshot must not
    // hide the earned commission or change its amount.
  }

  return "\u0639\u0631\u0636 \u0645\u0634\u062a\u0631\u0649";
}