import { readDirectCommercialConsideration } from "./direct-commercial-consideration";
import { getOfferBoxCommissionTitle } from "./commission-display";

export type OfferBoxCollectionPayment = {
  id: string;
  userId: string;
  purpose: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: Date | null;
  membershipId: string | null;
  offerId: string | null;
  metadata: string | null;
};

export type OfferBoxCollectionPurchase = {
  id: string;
  userId: string;
  offerId: string | null;
  status: string;
  priceSnapshot: number;
  currency: string;
  offerSnapshot: string;
  paymentTransactionId: string | null;
  redeemedUserMembershipId: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export function readOfferBoxCollection(
  purchase: OfferBoxCollectionPurchase,
  payment: OfferBoxCollectionPayment | null,
) {
  const title =
    getOfferBoxCommissionTitle(purchase.offerSnapshot) ??
    "Offer Box";

  let metadataPurchaseId: unknown = null;
  let economicMarker: any = null;

  try {
    if (payment?.metadata) {
      const metadata = JSON.parse(payment.metadata);
      metadataPurchaseId = metadata?.offerBoxPurchaseId;
      economicMarker = metadata?.directCommercialEconomics;
    }
  } catch {
    // Invalid payment metadata must never prove collection.
  }

  const price = Number(purchase.priceSnapshot);
  const amount = Number(payment?.amount);

  const independent =
    purchase.redeemedUserMembershipId === null;

  const reconciled =
    purchase.status === "available" ||
    purchase.status === "redeemed" ||
    purchase.status === "paid_activation_pending" ||
    purchase.status === "paid_review";

  const confirmed =
    independent &&
    reconciled &&
    purchase.paidAt != null &&
    payment != null &&
    payment.id === purchase.paymentTransactionId &&
    payment.userId === purchase.userId &&
    payment.offerId === purchase.offerId &&
    payment.purpose === "offer_box" &&
    payment.provider === "paymob" &&
    payment.status === "paid" &&
    payment.membershipId === null &&
    payment.paidAt != null &&
    metadataPurchaseId === purchase.id &&
    purchase.currency === "EGP" &&
    payment.currency === purchase.currency &&
    Number.isFinite(price) &&
    Number.isFinite(amount) &&
    price > 0 &&
    Math.round(price * 100) === Math.round(amount * 100);

  let consideration: ReturnType<typeof readDirectCommercialConsideration> = null;
  try { consideration = readDirectCommercialConsideration(purchase.offerSnapshot, price); } catch { /* Invalid split is never proof. */ }
  const internalConfirmed = Boolean(consideration && consideration.externalMinor === 0 && purchase.status === "redeemed" && independent && purchase.paidAt && payment && payment.id === purchase.paymentTransactionId && payment.userId === purchase.userId && payment.purpose === "offer_box" && payment.provider === "manual" && payment.status === "paid" && payment.amount === 0 && payment.currency === "EGP" && purchase.currency === "EGP" && payment.membershipId === null && payment.paidAt && metadataPurchaseId === purchase.id && economicMarker?.purchaseId === purchase.id && economicMarker?.state === "settled");
  const needsFinancialReview =
    independent &&
    (
      purchase.status === "paid_review" ||
      (
        !confirmed && !internalConfirmed &&
        (
          reconciled ||
          purchase.paidAt !== null ||
          payment?.status === "paid"
        )
      )
    );

  return {
    id: purchase.id,
    offerTitle: title,
    kind: "offer_box" as const,
    status: purchase.status,
    currency: purchase.currency,
    quotedAmount: price,
    confirmedPaidAmount: confirmed ? amount : 0,
    ...(consideration ? {
      confirmedConsiderationAmount: (confirmed || internalConfirmed) && purchase.status === "redeemed" && economicMarker?.state === "settled" ? consideration.totalMinor / 100 : 0,
      walletPaidAmount: purchase.status === "redeemed" && economicMarker?.state === "settled" ? consideration.walletMinor / 100 : 0,
      pointsPaidAmount: purchase.status === "redeemed" && economicMarker?.state === "settled" ? consideration.pointsMinor / 100 : 0,
    } : {}),
    paymentEvidence: confirmed || internalConfirmed
      ? "reconciled_offer_box_payment"
      : independent
        ? "unverified"
        : "legacy_membership",
    needsFinancialReview,
    independent,
    paidAt: confirmed || internalConfirmed
      ? payment!.paidAt!.toISOString()
      : null,
    createdAt: purchase.createdAt.toISOString(),
    paymentTransactionId: purchase.paymentTransactionId,
  };
}