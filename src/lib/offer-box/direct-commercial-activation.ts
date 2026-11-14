import { assertDirectCommercialEconomicsTx } from "@/lib/offer-box/direct-commercial-economics";
import { parseMembershipCommissionSnapshot } from "@/lib/commissions/membership-commission-contract";
import { db, asDbTransactionClient } from "@/lib/db";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import {
  resolveOfferBoxEntitlementTerms,
  type OfferBoxFrozenTerms,
} from "@/lib/offer-box/entitlement-contract";
import {
  applyOfferBoxBookingPlanTx,
} from "@/lib/payments/membership-booking-plan";
import {
  settleIndependentOfferBoxActivationTx,
} from "@/lib/offer-box/redemption-settlement";
import {
  preparePaidOfferBoxStaffCommission,
} from "@/lib/offer-box/paid-staff-commission";
import {
  accruePreparedOfferBoxStaffCommissionTx,
} from "@/lib/offer-box/paid-staff-commission-tx";
import { addCairoCalendarDays } from "@/lib/fitzone-time";

type Tx =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

type DirectSnapshot = OfferBoxFrozenTerms & {
  version: number;
  offer: {
    id: string | null;
  };
  membershipTemplate:
    OfferBoxFrozenTerms["membershipTemplate"] & {
      kind: string;
      sourceMembershipId: string | null;
    };
  directActivation: {
    version: number;
    startDate: string;
    endDate: string;
    selectedScheduleIds: string[];
  };
};

/**
 * Internal paid activation.
 *
 * The caller must obtain fresh authoritative Paymob proof.
 * All rights, bookings and financial effects are atomic.
 */
export async function activatePaidDirectCommercialPurchaseTx(
  tx: Tx,
  input: {
    purchaseId: string;
    transactionId: string;
    userId: string;
    paymobOrderPaidVerified: boolean;
    internalConsideration?: boolean;
  },
) {
  if (input.paymobOrderPaidVerified !== true && input.internalConsideration !== true) {
    throw new Error("DIRECT_ACTIVATION_PAID_PROOF_REQUIRED");
  }

  await lockMembershipLifecycleUserTx(
    asDbTransactionClient(tx),
    input.userId,
  );

  await tx.$queryRaw`
    SELECT id FROM OfferBoxPurchase
    WHERE id = ${input.purchaseId}
    FOR UPDATE
  `;

  const purchase =
    await tx.offerBoxPurchase.findUniqueOrThrow({
      where: { id: input.purchaseId },
    });

  if (
    purchase.userId !== input.userId ||
    purchase.paymentTransactionId !== input.transactionId ||
    purchase.redeemedUserMembershipId !== null ||
    !["package", "direct_offer"].includes(
      purchase.commercialKind,
    )
  ) {
    throw new Error("DIRECT_ACTIVATION_OWNER_MISMATCH");
  }

  await tx.$queryRaw`
    SELECT id FROM PaymentTransaction
    WHERE id = ${input.transactionId}
    FOR UPDATE
  `;

  const payment =
    await tx.paymentTransaction.findUniqueOrThrow({
      where: { id: input.transactionId },
    });

  if (
    payment.userId !== purchase.userId ||
    payment.purpose !== "offer_box" ||
    payment.businessUnit !== "club" ||
    (input.internalConsideration === true
      ? payment.provider !== "manual" || payment.amount !== 0 || input.paymobOrderPaidVerified === true
      : payment.provider !== "paymob" || payment.amount <= 0) ||
    payment.status !== "paid" ||
    payment.membershipId !== null ||
    payment.orderId !== null ||
    !payment.paidAt ||
    !purchase.paidAt ||
    payment.paidAt.getTime() !== purchase.paidAt.getTime() ||
    payment.currency !== "EGP" ||
    purchase.currency !== payment.currency ||
    !Number.isFinite(payment.amount) ||
    Math.round(payment.amount * 100) !==
      Math.round(purchase.priceSnapshot * 100)
  ) {
    throw new Error("DIRECT_ACTIVATION_PAYMENT_MISMATCH");
  }

  const metadata = JSON.parse(payment.metadata ?? "{}");

  const snapshot =
    JSON.parse(purchase.offerSnapshot) as DirectSnapshot;

  if (
    metadata.offerBoxPurchaseId !== purchase.id ||
    metadata.commercialKind !== purchase.commercialKind ||
    metadata.catalogMembershipId !== purchase.catalogMembershipId ||
    snapshot.version !== 1 ||
    snapshot.directActivation?.version !== 1 ||
    snapshot.offer?.id !== payment.offerId ||
    snapshot.membershipTemplate?.sourceMembershipId !==
      purchase.catalogMembershipId
  ) {
    throw new Error("DIRECT_ACTIVATION_SOURCE_MISMATCH");
  }

  const economicProof = await assertDirectCommercialEconomicsTx(
    asDbTransactionClient(tx), purchase, payment, purchase.status === "redeemed",
  );
  if (input.internalConsideration === true && (!economicProof || economicProof.consideration.externalMinor !== 0)) {
    throw new Error("DIRECT_ACTIVATION_INTERNAL_PROOF_REQUIRED");
  }

  const source =
    purchase.commercialKind === "package"
      ? {
          type: "package" as const,
          id: purchase.catalogMembershipId,
        }
      : {
          type: "offer" as const,
          id: snapshot.offer.id,
        };

  if (
    !source.id ||
    (
      purchase.commercialKind === "package" &&
      (payment.offerId !== null || purchase.offerId !== null)
    ) ||
    (
      purchase.offerId !== null &&
      purchase.offerId !== payment.offerId
    )
  ) {
    throw new Error("DIRECT_ACTIVATION_INVALID_SOURCE");
  }

  const terms = resolveOfferBoxEntitlementTerms(snapshot);

  const activation = snapshot.directActivation;
  const startDate = new Date(activation.startDate);
  const endDate = new Date(activation.endDate);
  const selectedScheduleIds = activation.selectedScheduleIds;

  if (
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(endDate.getTime()) ||
    endDate <= startDate ||
    endDate.getTime() !== addCairoCalendarDays(
      startDate,
      terms.durationDays,
    ).getTime() ||
    !Array.isArray(selectedScheduleIds) ||
    selectedScheduleIds.some(
      (id) => typeof id !== "string" || !id.trim(),
    ) ||
    new Set(selectedScheduleIds).size !== selectedScheduleIds.length
  ) {
    throw new Error("DIRECT_ACTIVATION_FROZEN_TERMS_INVALID");
  }

  const proof = {
    verified: true,
    internalConsideration: input.internalConsideration === true,
    id: payment.id,
    providerReference: payment.providerReference,
    externalReference: payment.externalReference,
    providerPayload: payment.providerPayload,
    amount: payment.amount,
    currency: payment.currency,
  };

  if (purchase.status === "redeemed") {
    const entitlement =
      await tx.offerBoxEntitlement.findUniqueOrThrow({
        where: { purchaseId: purchase.id },
      });

    if (
      entitlement.userId !== input.userId ||
      entitlement.startDate.getTime() !== startDate.getTime() ||
      entitlement.endDate.getTime() !== endDate.getTime() ||
      entitlement.totalSessions !== terms.totalSessions
    ) {
      throw new Error("DIRECT_ACTIVATION_REPLAY_MISMATCH");
    }

    await settleIndependentOfferBoxActivationTx(tx, {
      purchaseId: purchase.id,
      entitlementId: entitlement.id,
      userId: input.userId,
      verifiedPayment: proof,
    });

    return {
      alreadyActivated: true,
      entitlementId: entitlement.id,
    };
  }

  if (
    purchase.status !== "paid_activation_pending" ||
    purchase.redeemedAt !== null ||
    endDate <= new Date()
  ) {
    throw new Error("DIRECT_ACTIVATION_REQUIRES_REVIEW");
  }

  const existing =
    await tx.offerBoxEntitlement.findUnique({
      where: { purchaseId: purchase.id },
    });

  if (
    existing &&
    (
      existing.userId !== input.userId ||
      existing.status !== "pending_payment" ||
      existing.startDate.getTime() !== startDate.getTime() ||
      existing.endDate.getTime() !== endDate.getTime() ||
      existing.totalSessions !== terms.totalSessions ||
      existing.eligibilitySnapshot !== terms.eligibilitySnapshot
    )
  ) {
    throw new Error("DIRECT_ACTIVATION_EXISTING_RIGHT_REVIEW");
  }

  /*
   * New direct checkout holds its bookings before payment.
   * Convert that exact owner to active in this transaction.
   *
   * Internal purchases created without a provisional owner
   * keep the accepted create-on-activation behavior.
   */
  const entitlement = existing
    ? await tx.offerBoxEntitlement.update({
        where: { id: existing.id },
        data: { status: "active" },
      })
    : await tx.offerBoxEntitlement.create({
        data: {
          purchaseId: purchase.id,
          userId: input.userId,
          status: "active",
          startDate,
          endDate,
          totalSessions: terms.totalSessions,
          eligibilitySnapshot: terms.eligibilitySnapshot,
          allowedClassTypesSnapshot:
            terms.allowedClassTypesSnapshot,
        },
      });

  // Existing booking engine validates eligibility,
  // dates, capacity, conflicts and frozen policy.
  await applyOfferBoxBookingPlanTx({
    tx,
    userId: input.userId,
    offerBoxEntitlementId: entitlement.id,
    startDate,
    endDate,
    selectedScheduleIds,
    source: {
      type: source.type,
      id: source.id,
    },
    plan: {
      kind: snapshot.membershipTemplate.kind,
      sessionsCount: terms.totalSessions,
      duration: terms.durationDays,
    },
  });

  const commission = preparePaidOfferBoxStaffCommission({
    purchaseId: purchase.id,
    offerSnapshot: purchase.offerSnapshot,
    paidAmount: payment.amount,
    paidCurrency: payment.currency,
    paidAt: payment.paidAt,
  });

  await accruePreparedOfferBoxStaffCommissionTx(
    asDbTransactionClient(tx),
    commission,
  );
  // Consume only the exact frozen referral, once economic finalization succeeds.
  const frozenCommission = parseMembershipCommissionSnapshot(JSON.parse(purchase.offerSnapshot).economics.commissionSnapshot);
  if (frozenCommission.staff?.referralToken) {
    await tx.user.updateMany({ where: { id: input.userId, pendingStaffRef: frozenCommission.staff.referralToken }, data: { pendingStaffRef: null } });
  }

  await settleIndependentOfferBoxActivationTx(tx, {
    purchaseId: purchase.id,
    entitlementId: entitlement.id,
    userId: input.userId,
    verifiedPayment: proof,
  });

  if (
    purchase.commercialKind === "direct_offer" &&
    purchase.offerId
  ) {
    const changed = await tx.$executeRaw`
      UPDATE Offer
      SET offerBoxReservedCount = offerBoxReservedCount - 1,
          currentSubscribers = currentSubscribers + 1
      WHERE id = ${purchase.offerId}
        AND offerBoxReservedCount > 0
    `;

    if (Number(changed) !== 1) {
      throw new Error("DIRECT_ACTIVATION_RESERVED_COUNT_INVALID");
    }
  }

  const completed =
    await tx.offerBoxPurchase.updateMany({
      where: {
        id: purchase.id,
        userId: input.userId,
        status: "paid_activation_pending",
        paymentTransactionId: payment.id,
        redeemedAt: null,
        redeemedUserMembershipId: null,
      },
      data: {
        status: "redeemed",
        redeemedAt: new Date(),
        holdExpiresAt: null,
      },
    });

  if (completed.count !== 1) {
    throw new Error("DIRECT_ACTIVATION_CLAIM_LOST");
  }

  return {
    alreadyActivated: false,
    entitlementId: entitlement.id,
  };
}
