import { assertDirectCommercialEconomicsTx } from "@/lib/offer-box/direct-commercial-economics";
import { asDbTransactionClient, db } from "@/lib/db";
import {
  postOfferBoxActivationJournal,
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
} from "@/lib/accounting-service";
import { calcTier, getRewardSettings } from "@/lib/reward-settings";

type TransactionClient =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

type VerifiedPaymentIdentity = {
  verified: boolean;
  internalConsideration?: boolean;
  id: string;
  providerReference: string | null;
  externalReference: string | null;
  providerPayload: string | null;
  amount: number;
  currency: string;
};

type SettlementInput = {
  purchaseId: string;
  entitlementId: string;
  userId: string;
  verifiedPayment: VerifiedPaymentIdentity;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function parseRecord(
  raw: string | null,
  code: string,
): JsonRecord {
  try {
    const value = asRecord(JSON.parse(raw ?? ""));

    if (!value) {
      throw new Error(code);
    }

    return value;
  } catch {
    throw new Error(code);
  }
}

function minorAmount(value: number): number {
  const minor = Math.round(value * 100);

  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(minor)
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_INVALID_AMOUNT");
  }

  return minor;
}

function validDate(value: Date | null): value is Date {
  return value instanceof Date &&
    Number.isFinite(value.getTime());
}

function parseProductRewards(raw: unknown) {
  if (raw == null) return [];

  if (typeof raw !== "string") {
    throw new Error("OFFER_BOX_PRODUCT_REWARDS_INVALID");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OFFER_BOX_PRODUCT_REWARDS_INVALID");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("OFFER_BOX_PRODUCT_REWARDS_INVALID");
  }

  const quantities = new Map<string, number>();

  for (const item of parsed) {
    const reward = asRecord(item);

    if (
      !reward ||
      typeof reward.productId !== "string" ||
      !reward.productId.trim() ||
      typeof reward.quantity !== "number" ||
      !Number.isSafeInteger(reward.quantity) ||
      reward.quantity <= 0
    ) {
      throw new Error("OFFER_BOX_PRODUCT_REWARD_INVALID");
    }

    const productId = reward.productId.trim();

    const quantity =
      (quantities.get(productId) ?? 0) + reward.quantity;

    if (!Number.isSafeInteger(quantity)) {
      throw new Error("OFFER_BOX_PRODUCT_REWARD_OVERFLOW");
    }

    quantities.set(productId, quantity);
  }

  return [...quantities.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
}

/**
 * Independently settle the economic effects of a confirmed Offer Box
 * activation.
 *
 * Preconditions:
 * - Caller already holds the purchase row and customer lifecycle locks.
 * - The same transaction creates the entitlement and its bookings.
 * - verifiedPayment comes from the central live Paymob Order authority.
 *
 * No membership, membership commission, trainer compensation,
 * membership referral conversion, or subscription supersession is
 * performed here.
 *
 * Payment metadata and GL reference jointly protect exact-once effects.
 */
export async function settleIndependentOfferBoxActivationTx(
  tx: TransactionClient,
  input: SettlementInput,
) {
  const proof = input.verifiedPayment;

  if (proof.verified !== true) {
    throw new Error("OFFER_BOX_ACTIVATION_PAID_PROOF_REQUIRED");
  }

  const purchase = await tx.offerBoxPurchase.findUnique({
    where: { id: input.purchaseId },
  });

  if (
    !purchase ||
    purchase.userId !== input.userId ||
    purchase.redeemedUserMembershipId !== null ||
    purchase.paymentTransactionId !== proof.id ||
    !validDate(purchase.paidAt)
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_PURCHASE_MISMATCH");
  }

  const entitlement = await tx.offerBoxEntitlement.findUnique({
    where: { id: input.entitlementId },
  });

  if (
    !entitlement ||
    entitlement.purchaseId !== purchase.id ||
    entitlement.userId !== input.userId
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_ENTITLEMENT_MISMATCH");
  }

  // Re-read payment under its exclusive lock.
  await tx.$queryRaw`
    SELECT \`id\`
    FROM \`PaymentTransaction\`
    WHERE \`id\` = ${proof.id}
    FOR UPDATE
  `;

  const payment = await tx.paymentTransaction.findUnique({
    where: { id: proof.id },
  });

  if (
    !payment ||
    payment.userId !== input.userId ||
    payment.purpose !== "offer_box" ||
    (proof.internalConsideration === true
      ? payment.provider !== "manual" || payment.amount !== 0
      : payment.provider !== "paymob" || payment.amount <= 0) ||
    payment.status !== "paid" ||
    payment.membershipId !== null ||
    !validDate(payment.paidAt) ||
    payment.providerReference !== proof.providerReference ||
    payment.externalReference !== proof.externalReference ||
    payment.providerPayload !== proof.providerPayload ||
    (
      purchase.offerId !== null &&
      payment.offerId !== purchase.offerId
    ) ||
    payment.currency !== "EGP" ||
    purchase.currency !== payment.currency ||
    proof.currency !== payment.currency ||
    minorAmount(payment.amount) < 0 ||
    minorAmount(payment.amount) !== minorAmount(proof.amount) ||
    minorAmount(payment.amount) !== minorAmount(purchase.priceSnapshot)
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_PAYMENT_MISMATCH");
  }

  const metadata = parseRecord(
    payment.metadata,
    "OFFER_BOX_SETTLEMENT_METADATA_INVALID",
  );

  if (metadata.offerBoxPurchaseId !== purchase.id) {
    throw new Error("OFFER_BOX_SETTLEMENT_PAYMENT_LINK_MISMATCH");
  }

  const directEconomics = await assertDirectCommercialEconomicsTx(
    asDbTransactionClient(tx), purchase, payment, purchase.status === "redeemed",
  );
  if (proof.internalConsideration === true && (!directEconomics || directEconomics.consideration.externalMinor !== 0)) {
    throw new Error("DIRECT_SETTLEMENT_INTERNAL_PROOF_REQUIRED");
  }

  const legacy = asRecord(metadata.postActivationReconciliation);

  if (
    legacy?.completed === true ||
    typeof legacy?.userMembershipId === "string"
  ) {
    throw new Error(
      "OFFER_BOX_LEGACY_SETTLEMENT_REVIEW_REQUIRED",
    );
  }

  const marker = asRecord(
    metadata.offerBoxActivationReconciliation,
  );

  if (metadata.offerBoxActivationReconciliation != null) {
    if (
      !marker ||
      marker.completed !== true ||
      marker.version !== 1 ||
      marker.purchaseId !== purchase.id ||
      marker.entitlementId !== entitlement.id ||
      typeof marker.journalId !== "string" ||
      purchase.status !== "redeemed"
    ) {
      throw new Error("OFFER_BOX_SETTLEMENT_MARKER_MISMATCH");
    }

    const journal = await tx.journal.findUnique({
      where: {
        referenceType_referenceId: {
          referenceType: "OfferBoxPurchase",
          referenceId: purchase.id,
        },
      },
      select: { id: true, status: true },
    });

    if (
      !journal ||
      journal.id !== marker.journalId ||
      journal.status !== "posted"
    ) {
      throw new Error("OFFER_BOX_SETTLEMENT_JOURNAL_MISMATCH");
    }

    return {
      alreadyCompleted: true,
      journalId: journal.id,
    };
  }

  if (
    (
      purchase.status !== "available" &&
      !(
        purchase.status === "paid_activation_pending" &&
        (
          purchase.commercialKind === "package" ||
          purchase.commercialKind === "direct_offer"
        )
      )
    ) ||
    entitlement.status !== "active"
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_STATE_INVALID");
  }

  const snapshot = parseRecord(
    purchase.offerSnapshot,
    "OFFER_BOX_SETTLEMENT_SNAPSHOT_INVALID",
  );

  const template = asRecord(snapshot.membershipTemplate);
  const commercial = asRecord(snapshot.commercial);

  if (
    snapshot.version !== 1 ||
    purchase.snapshotVersion !== 1 ||
    !template ||
    !commercial ||
    commercial.currency !== payment.currency ||
    typeof commercial.finalPrice !== "number" ||
    minorAmount(commercial.finalPrice) !== minorAmount(payment.amount) ||
    typeof template.walletBonus !== "number" ||
    !Number.isFinite(template.walletBonus) ||
    template.walletBonus < 0
  ) {
    throw new Error("OFFER_BOX_SETTLEMENT_CONTRACT_INVALID");
  }

  const offerName =
    typeof template.name === "string" && template.name.trim()
      ? template.name.trim()
      : "Offer Box";

  const walletBonus = template.walletBonus;

  const productRewards = parseProductRewards(
    template.productRewards,
  );

  /*
   * Preserve the points grant previously applied on Offer Box
   * redemption, but identify it as an independent offer reward.
   * Subscription referral/coach/commission side effects are excluded.
   */
  const rewardCfg = await getRewardSettings(
    asDbTransactionClient(tx),
  );

  const points = rewardCfg.pointsPerSubscription;
  const pointValue = rewardCfg.pointValueEGP;

  if (
    !Number.isSafeInteger(points) ||
    points < 0 ||
    !Number.isFinite(pointValue) ||
    pointValue < 0
  ) {
    throw new Error("OFFER_BOX_REWARD_SETTINGS_INVALID");
  }

  const journalId = directEconomics
    ? await postOfferBoxActivationJournal(tx,purchase.id,payment.amount,{
        walletAmount: directEconomics.consideration.walletMinor / 100,
        pointsAmount: directEconomics.consideration.pointsMinor / 100,
      })
    : await postOfferBoxActivationJournal(tx,purchase.id,payment.amount);

  /*
   * A journal without the atomic settlement marker is inconsistent.
   * Never silently repeat wallet/points/inventory effects.
   */
  if (!journalId) {
    throw new Error("OFFER_BOX_UNMARKED_JOURNAL_REVIEW_REQUIRED");
  }

  if (walletBonus > 0) {
    const wallet = await tx.wallet.upsert({
      where: { userId: input.userId },
      update: {
        balance: { increment: walletBonus },
      },
      create: {
        userId: input.userId,
        balance: walletBonus,
      },
    });

    const walletTransaction =
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: walletBonus,
          type: "credit",
          source: "offer_box_bonus",
          description: `Offer Box bonus: ${offerName}`,
        },
      });

    await postPromotionalWalletCreditJournal(
      tx,
      walletTransaction.id,
      walletBonus,
    );
  }

  if (points > 0) {
    const reward = await tx.rewardPoints.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });

    if (reward) {
      const updated = await tx.rewardPoints.update({
        where: { id: reward.id },
        data: {
          points: { increment: points },
        },
        select: { points: true },
      });

      await tx.rewardPoints.update({
        where: { id: reward.id },
        data: {
          tier: calcTier(
            updated.points,
            rewardCfg.tierThresholds,
          ),
        },
      });

      const history = await tx.rewardHistory.create({
        data: {
          rewardId: reward.id,
          points,
          reason: "offer_box_purchase",
        },
      });

      await postPromotionalPointsGrantJournal(
        tx,
        history.id,
        Math.round(points * pointValue * 100) / 100,
      );
    }
  }

  for (const reward of productRewards) {
    // Stable lock order across all rewards.
    await tx.$queryRaw`
      SELECT \`id\`
      FROM \`Product\`
      WHERE \`id\` = ${reward.productId}
      FOR UPDATE
    `;

    const product = await tx.product.findUnique({
      where: { id: reward.productId },
      select: {
        id: true,
        stock: true,
        trackInventory: true,
        averageCost: true,
      },
    });

    if (!product) {
      throw new Error("OFFER_BOX_REWARD_PRODUCT_MISSING");
    }

    let quantityAfter = product.stock;

    if (product.trackInventory) {
      const claimed = await tx.product.updateMany({
        where: {
          id: product.id,
          stock: { gte: reward.quantity },
        },
        data: {
          stock: { decrement: reward.quantity },
        },
      });

      if (claimed.count !== 1) {
        throw new Error(
          "OFFER_BOX_REWARD_STOCK_INSUFFICIENT",
        );
      }

      const latest = await tx.product.findUnique({
        where: { id: product.id },
        select: { stock: true },
      });

      if (!latest) {
        throw new Error("OFFER_BOX_REWARD_PRODUCT_MISSING");
      }

      quantityAfter = latest.stock;
    }

    await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        type: "package_consumption",
        quantityChange: -reward.quantity,
        quantityBefore: product.stock,
        quantityAfter,
        unitCost: product.averageCost,
        averageCostBefore: product.averageCost,
        averageCostAfter: product.averageCost,
        referenceType: "OfferBoxPurchase",
        referenceId: purchase.id,
        notes: `Offer Box activation: ${offerName}`,
      },
    });
  }

  await tx.notification.create({
    data: {
      userId: input.userId,
      title: `تم تفعيل عرضك: ${offerName}`,
      body: "تم تفعيل العرض المستقل بنجاح.",
      type: "success",
    },
  });

  // Written in the SAME transaction as all financial effects.
  await tx.paymentTransaction.update({
    where: { id: payment.id },
    data: {
      metadata: JSON.stringify({
        ...metadata,
        ...(directEconomics ? { directCommercialEconomics: { ...directEconomics.reservation, state: "settled" } } : {}),
        offerBoxActivationReconciliation: {
          version: 1,
          completed: true,
          completedAt: new Date().toISOString(),
          purchaseId: purchase.id,
          entitlementId: entitlement.id,
          journalId,
        },
      }),
    },
  });

  return {
    alreadyCompleted: false,
    journalId,
  };
}