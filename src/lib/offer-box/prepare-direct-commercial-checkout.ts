import { readDirectCommercialConsideration, type DirectCommercialConsideration } from "@/lib/offer-box/direct-commercial-consideration";
import { parseMembershipCommissionSnapshot } from "@/lib/commissions/membership-commission-contract";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import {
  createCommercialPurchaseSource,
} from "@/lib/offer-box/commercial-source-contract";

import {
  createPendingCommercialPurchaseTx,
} from "@/lib/offer-box/create-commercial-purchase";

import {
  resolveOfferBoxEntitlementTerms,
  type OfferBoxFrozenTerms,
} from "@/lib/offer-box/entitlement-contract";

import {
  addCairoCalendarDays,
} from "@/lib/fitzone-time";

import {
  lockMembershipLifecycleUserTx,
} from "@/lib/membership-lifecycle-lock";

type DirectCommercialSnapshot =
  OfferBoxFrozenTerms & {
    version: 1;
    purchasedAt: string;
    offer: {
      id: string | null;
      title: string;
      titleEn?: string | null;
    };
    membershipTemplate:
      OfferBoxFrozenTerms["membershipTemplate"] & {
        sourceMembershipId: string | null;
        name: string;
        nameEn?: string | null;
        kind: string;
        walletBonus: number;
        productRewards: string | null;
      };
    commercial: {
      currency: "EGP";
      originalPrice: number;
      finalPrice: number;
    };
    economics: {
      commissionSnapshot: string;
      attributionMode: "direct_commercial";
    };
    ageEligibility?: object | null;
    directConsideration?: DirectCommercialConsideration;
    directCheckoutAttemptId?: string | null;
    subscribeAttemptFingerprint?: object;
  };

export type PrepareDirectCommercialCheckoutInput = {
  userId: string;

  kind: "package" | "direct_offer";

  offerId: string | null;
  catalogMembershipId: string | null;

  snapshot: DirectCommercialSnapshot;

  startDate: Date;
  selectedScheduleIds: string[];

  serverNow: Date;
};

function isValidDate(value: Date): boolean {
  return (
    value instanceof Date &&
    Number.isFinite(value.getTime())
  );
}

function isMoney(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isSafeInteger(Math.round(value * 100)) &&
    Math.abs(
      value * 100 - Math.round(value * 100),
    ) < 0.000001
  );
}

/**
 * Internal direct commercial checkout preparation.
 *
 * The caller must resolve and validate price, age,
 * eligibility, attribution and discounts on the server.
 *
 * This service currently supports only positive
 * external Paymob amounts, without wallet/point debits.
 *
 * Selected schedules are frozen, not reserved here.
 * Paid activation and booking reservation require
 * their own authoritative transaction.
 *
 * Do not expose as a public route before those
 * payment and lifecycle contracts are implemented.
 */
export async function prepareDirectCommercialCheckoutTx(
  tx: Prisma.TransactionClient,
  input: PrepareDirectCommercialCheckoutInput,
) {
  if (!input.userId.trim()) {
    throw new Error("DIRECT_COMMERCIAL_USER_REQUIRED");
  }

  const source = createCommercialPurchaseSource({
    commercialKind: input.kind,
    offerId: input.offerId,
    catalogMembershipId: input.catalogMembershipId,
  });

  if (
    source.commercialKind !== "package" &&
    source.commercialKind !== "direct_offer"
  ) {
    throw new Error("INVALID_DIRECT_COMMERCIAL_KIND");
  }

  const snapshot = input.snapshot;

  const terms = resolveOfferBoxEntitlementTerms(
    snapshot,
  );

  if (
    snapshot.version !== 1 ||
    snapshot.offer.id !== source.offerId ||
    snapshot.membershipTemplate.sourceMembershipId !==
      source.catalogMembershipId ||
    !snapshot.offer.title.trim() ||
    !snapshot.membershipTemplate.name.trim() ||
    snapshot.commercial.currency !== "EGP" ||
    !isMoney(snapshot.commercial.originalPrice) ||
    !isMoney(snapshot.commercial.finalPrice) ||
    (snapshot.commercial.finalPrice === 0 && !readDirectCommercialConsideration(snapshot, 0)) ||
    snapshot.commercial.finalPrice >
      snapshot.commercial.originalPrice ||
    snapshot.economics.attributionMode !==
      "direct_commercial" ||
    !snapshot.economics.commissionSnapshot.trim()
  ) {
    throw new Error("INVALID_DIRECT_COMMERCIAL_SNAPSHOT");
  }

  const consideration = readDirectCommercialConsideration(snapshot, snapshot.commercial.finalPrice);
  if (consideration && consideration.totalMinor > Math.round(snapshot.commercial.originalPrice * 100)) throw new Error("DIRECT_ECONOMICS_TOTAL_EXCEEDS_ORIGINAL");

  // Reject malformed economics before any hold or payment.
  parseMembershipCommissionSnapshot(
    snapshot.economics.commissionSnapshot,
  );

  if (
    !isValidDate(input.serverNow) ||
    !isValidDate(input.startDate)
  ) {
    throw new Error("INVALID_DIRECT_COMMERCIAL_DATES");
  }

  const endDate = addCairoCalendarDays(
    input.startDate,
    terms.durationDays,
  );

  if (
    !isValidDate(endDate) ||
    endDate <= input.startDate ||
    endDate <= input.serverNow
  ) {
    throw new Error("INVALID_DIRECT_COMMERCIAL_PERIOD");
  }

  const scheduleIds = input.selectedScheduleIds;

  if (
    !Array.isArray(scheduleIds) ||
    scheduleIds.some(
      (id) =>
        typeof id !== "string" ||
        !id.trim() ||
        id !== id.trim(),
    ) ||
    new Set(scheduleIds).size !== scheduleIds.length ||
    (
      terms.totalSessions !== null &&
      scheduleIds.length > terms.totalSessions
    )
  ) {
    throw new Error("INVALID_DIRECT_COMMERCIAL_SCHEDULES");
  }

  await lockMembershipLifecycleUserTx(
    tx,
    input.userId,
  );

  // Do not create a second pending checkout
  // for the same commercial source.
  //
  // Expired/ambiguous payments require the
  // authoritative reconciliation path first.

  const pending = await tx.offerBoxPurchase.findFirst({
    where: {
      userId: input.userId,
      commercialKind: source.commercialKind,
      offerId: source.offerId,
      catalogMembershipId: source.catalogMembershipId,
      status: "pending_payment",
    },
    select: { id: true },
  });

  if (pending) {
    throw new Error(
      "DIRECT_COMMERCIAL_PENDING_ALREADY_EXISTS",
    );
  }

  if (source.commercialKind === "package") {
    const plan = await tx.membership.findUnique({
      where: {
        id: source.catalogMembershipId!,
      },
      select: {
        id: true,
        kind: true,
        isActive: true,
      },
    });

    if (
      !plan ||
      plan.kind !== "package" ||
      !plan.isActive
    ) {
      throw new Error(
        "DIRECT_COMMERCIAL_PACKAGE_UNAVAILABLE",
      );
    }
  } else {
    // The same shared offer capacity is used
    // by Offer Box and direct offer checkout.

    const claimed = await tx.$executeRaw`
      UPDATE Offer
      SET offerBoxReservedCount =
        offerBoxReservedCount + 1
      WHERE id = ${source.offerId}
        AND isActive = 1
        AND type = 'special'
        AND expiresAt > ${input.serverNow}
        AND (
          maxSubscribers IS NULL
          OR maxSubscribers <= 0
          OR currentSubscribers +
            offerBoxReservedCount < maxSubscribers
        )
    `;

    if (Number(claimed) !== 1) {
      throw new Error(
        "DIRECT_COMMERCIAL_OFFER_UNAVAILABLE",
      );
    }
  }

  const purchaseId = randomUUID();

  // Keep the original sixty-minute local hold.
  // A provider response must not extend it.
  const holdExpiresAt = new Date(
    input.serverNow.getTime() + 60 * 60 * 1000,
  );

  const frozenSnapshot = {
    ...snapshot,

    purchasedAt: input.serverNow.toISOString(),

    directActivation: {
      version: 1,
      startDate: input.startDate.toISOString(),
      endDate: endDate.toISOString(),
      selectedScheduleIds: [...scheduleIds],
    },
  };

  await createPendingCommercialPurchaseTx(tx, {
    purchaseId,
    userId: input.userId,
    source,
    snapshot: frozenSnapshot,
    amount: snapshot.commercial.finalPrice,
    holdExpiresAt,
  });

  return {
    purchaseId,
    source,
    startDate: input.startDate,
    endDate,
    holdExpiresAt,
    amount: snapshot.commercial.finalPrice,
  };
}
