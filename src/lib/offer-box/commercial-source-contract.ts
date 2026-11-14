export const COMMERCIAL_PURCHASE_KINDS = [
  "offer_box",
  "direct_offer",
  "package",
  "friend_offer",
] as const;

export type CommercialPurchaseKind =
  (typeof COMMERCIAL_PURCHASE_KINDS)[number];

export type CommercialPurchaseSource = Readonly<{
  commercialKind: CommercialPurchaseKind;
  offerId: string | null;
  catalogMembershipId: string | null;
}>;

type RawCommercialSource = {
  commercialKind: unknown;
  offerId: unknown;
  catalogMembershipId: unknown;
};

export class CommercialSourceError extends Error {
  constructor(
    public readonly code:
      | "UNKNOWN_COMMERCIAL_KIND"
      | "INVALID_SOURCE_ID"
      | "OFFER_ID_REQUIRED"
      | "PACKAGE_CATALOG_REQUIRED"
      | "PACKAGE_OFFER_NOT_ALLOWED"
      | "COMMERCIAL_SOURCE_MISMATCH",
  ) {
    super(code);
    this.name = "CommercialSourceError";
  }
}

export function isCommercialPurchaseKind(
  value: unknown,
): value is CommercialPurchaseKind {
  return (
    typeof value === "string" &&
    COMMERCIAL_PURCHASE_KINDS.some(
      (kind) => kind === value,
    )
  );
}

function readSourceId(
  value: unknown,
): string | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 191 ||
    value !== value.trim()
  ) {
    throw new CommercialSourceError(
      "INVALID_SOURCE_ID",
    );
  }

  return value;
}

/**
 * Decode an explicitly classified persisted source.
 *
 * This does not authorize a purchase, prove payment,
 * validate a live catalog item, or grant entitlement.
 *
 * A historical offer may have been deleted after
 * purchase. Its nullable live offerId must not
 * invalidate its frozen historical rights.
 */
export function readCommercialPurchaseSource(
  input: RawCommercialSource,
): CommercialPurchaseSource {
  if (
    !isCommercialPurchaseKind(input.commercialKind)
  ) {
    throw new CommercialSourceError(
      "UNKNOWN_COMMERCIAL_KIND",
    );
  }

  const source = {
    commercialKind: input.commercialKind,
    offerId: readSourceId(input.offerId),
    catalogMembershipId: readSourceId(
      input.catalogMembershipId,
    ),
  };

  if (source.commercialKind === "package") {
    if (!source.catalogMembershipId) {
      throw new CommercialSourceError(
        "PACKAGE_CATALOG_REQUIRED",
      );
    }

    if (source.offerId !== null) {
      throw new CommercialSourceError(
        "PACKAGE_OFFER_NOT_ALLOWED",
      );
    }
  }

  return source;
}

/**
 * Validate identity for a NEW commercial purchase.
 *
 * Inputs must be constructed from server-resolved
 * catalog records, not trusted directly from a client.
 *
 * Historical reads deliberately have separate rules.
 */
export function createCommercialPurchaseSource(
  input: RawCommercialSource,
): CommercialPurchaseSource {
  const source = readCommercialPurchaseSource(input);

  if (
    source.commercialKind !== "package" &&
    source.offerId === null
  ) {
    throw new CommercialSourceError(
      "OFFER_ID_REQUIRED",
    );
  }

  return source;
}

/**
 * Replay/reconciliation must preserve the source
 * originally recorded on the purchase.
 *
 * Compare historical identity without looking up
 * current catalog prices or eligibility.
 *
 * Callers must still separately verify user identity,
 * payment identity, amount, currency, and frozen terms.
 */
export function assertSameCommercialPurchaseSource(
  persisted: RawCommercialSource,
  expected: RawCommercialSource,
): void {
  const left = readCommercialPurchaseSource(
    persisted,
  );

  const right = readCommercialPurchaseSource(
    expected,
  );

  if (
    left.commercialKind !== right.commercialKind ||
    left.offerId !== right.offerId ||
    left.catalogMembershipId !==
      right.catalogMembershipId
  ) {
    throw new CommercialSourceError(
      "COMMERCIAL_SOURCE_MISMATCH",
    );
  }
}
