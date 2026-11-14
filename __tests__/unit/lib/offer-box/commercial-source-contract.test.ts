import { describe, expect, it } from "vitest";

import {
  assertSameCommercialPurchaseSource,
  createCommercialPurchaseSource,
  readCommercialPurchaseSource,
  isCommercialPurchaseKind,
} from "@/lib/offer-box/commercial-source-contract";

const offerBox = {
  commercialKind: "offer_box",
  offerId: "offer-1",
  catalogMembershipId: null,
};

const directOffer = {
  commercialKind: "direct_offer",
  offerId: "offer-2",
  catalogMembershipId: "catalog-1",
};

const packageSource = {
  commercialKind: "package",
  offerId: null,
  catalogMembershipId: "package-1",
};

const friendOffer = {
  commercialKind: "friend_offer",
  offerId: "friend-offer-1",
  catalogMembershipId: "catalog-2",
};

describe("commercial purchase source contract", () => {
  it("accepts a valid new offer box source", () => {
    expect(
      createCommercialPurchaseSource(offerBox),
    ).toEqual(offerBox);
  });

  it("accepts a valid new direct offer source", () => {
    expect(
      createCommercialPurchaseSource(directOffer),
    ).toEqual(directOffer);
  });

  it("accepts an independent package without an offer", () => {
    expect(
      createCommercialPurchaseSource(packageSource),
    ).toEqual(packageSource);
  });

  it("accepts a friend offer source identity", () => {
    expect(
      createCommercialPurchaseSource(friendOffer),
    ).toEqual(friendOffer);
  });

  it("rejects an ordinary subscription as a commercial kind", () => {
    expect(
      isCommercialPurchaseKind("subscription"),
    ).toBe(false);

    expect(() =>
      createCommercialPurchaseSource({
        ...packageSource,
        commercialKind: "subscription",
      }),
    ).toThrow("UNKNOWN_COMMERCIAL_KIND");
  });

  it("rejects an unknown or missing commercial kind", () => {
    for (const commercialKind of [
      undefined,
      null,
      "",
      "unknown",
    ]) {
      expect(() =>
        createCommercialPurchaseSource({
          ...offerBox,
          commercialKind,
        }),
      ).toThrow("UNKNOWN_COMMERCIAL_KIND");
    }
  });

  it("rejects a package without its catalog identity", () => {
    expect(() =>
      createCommercialPurchaseSource({
        ...packageSource,
        catalogMembershipId: null,
      }),
    ).toThrow("PACKAGE_CATALOG_REQUIRED");
  });

  it("rejects an offer ID on a package source", () => {
    expect(() =>
      createCommercialPurchaseSource({
        ...packageSource,
        offerId: "offer-1",
      }),
    ).toThrow("PACKAGE_OFFER_NOT_ALLOWED");
  });

  it("requires an offer identity for every new offer purchase", () => {
    for (const source of [
      offerBox,
      directOffer,
      friendOffer,
    ]) {
      expect(() =>
        createCommercialPurchaseSource({
          ...source,
          offerId: null,
        }),
      ).toThrow("OFFER_ID_REQUIRED");
    }
  });

  it("rejects blank, oversized and non-string source IDs", () => {
    for (const value of [
      "",
      " ",
      " offer-1",
      "offer-1 ",
      "x".repeat(192),
      undefined,
      123,
    ]) {
      expect(() =>
        createCommercialPurchaseSource({
          ...offerBox,
          offerId: value,
        }),
      ).toThrow("INVALID_SOURCE_ID");
    }
  });

  it("retains legacy offer box identity after live offer deletion", () => {
    const legacy = {
      commercialKind: "offer_box",
      offerId: null,
      catalogMembershipId: null,
    };

    expect(
      readCommercialPurchaseSource(legacy),
    ).toEqual(legacy);

    expect(() =>
      createCommercialPurchaseSource(legacy),
    ).toThrow("OFFER_ID_REQUIRED");
  });

  it("retains historical direct offer identity without requiring a live offer", () => {
    const historical = {
      ...directOffer,
      offerId: null,
    };

    expect(
      readCommercialPurchaseSource(historical),
    ).toEqual(historical);
  });

  it("allows identical source identity during replay", () => {
    expect(() =>
      assertSameCommercialPurchaseSource(
        packageSource,
        { ...packageSource },
      ),
    ).not.toThrow();
  });

  it("rejects a different commercial kind during replay", () => {
    expect(() =>
      assertSameCommercialPurchaseSource(
        offerBox,
        {
          ...offerBox,
          commercialKind: "direct_offer",
        },
      ),
    ).toThrow("COMMERCIAL_SOURCE_MISMATCH");
  });

  it("rejects a changed offer identity during replay", () => {
    expect(() =>
      assertSameCommercialPurchaseSource(
        directOffer,
        {
          ...directOffer,
          offerId: "different-offer",
        },
      ),
    ).toThrow("COMMERCIAL_SOURCE_MISMATCH");
  });

  it("rejects a changed catalog identity during replay", () => {
    expect(() =>
      assertSameCommercialPurchaseSource(
        packageSource,
        {
          ...packageSource,
          catalogMembershipId: "package-2",
        },
      ),
    ).toThrow("COMMERCIAL_SOURCE_MISMATCH");
  });

  it("does not infer package ownership from a catalog ID alone", () => {
    const legacy = {
      ...offerBox,
      catalogMembershipId: "package-1",
    };

    expect(
      readCommercialPurchaseSource(legacy)
        .commercialKind,
    ).toBe("offer_box");
  });
});
