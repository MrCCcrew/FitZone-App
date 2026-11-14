import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import {
  asDbTransactionClient,
  db,
} from "@/lib/db";
import {
  applyOfferBoxBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import { getPaymentProvider } from "@/lib/payments/registry";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";
import { prepareConfirmedOfferBoxActivation } from "@/lib/offer-box/entitlement-contract";
import { settleIndependentOfferBoxActivationTx } from "@/lib/offer-box/redemption-settlement";

type RedeemBody = {
  purchaseId?: string | null;
  scheduleIds?: string[] | null;
  confirmed?: boolean;
};

type FrozenEligibility = {
  classIds?: string[];
  classTypes?: string[];
  classTypeIds?: string[];
  [key: string]: unknown;
};

type OfferBoxSnapshot = {
  version: number;
  purchasedAt: string;

  offer: {
    id: string;
    title: string;
    titleEn: string | null;
    type: string;
    discount: number;
    description: string | null;
    descriptionEn: string | null;
    appliesTo: string | null;
    appliesToEn: string | null;
    expiresAtAtPurchase: string;
    membershipId: string | null;
    sessionsCount: number | null;
    durationDays: number;
    priceBefore: number;
    specialPrice: number;
    features: unknown[];
    featuresEn: unknown[];
  };

  membershipTemplate: {
    sourceMembershipId: string | null;
    name: string;
    nameEn: string;
    kind: string;
    durationDays: number;
    sessionsCount: number | null;
    walletBonus: number;
    productRewards: string | null;
  };

  commercial: {
    currency: string;
    originalPrice: number;
    finalPrice: number;
  };

  economics: {
    commissionSnapshot: string;
    attributionMode: "direct_offer_box";
  };

  eligibilitySnapshot: FrozenEligibility;

  ageEligibility: {
    requiresBirthDate: boolean;
    minAgeYears: number | null;
    maxAgeYears: number | null;
    ageYearsAtPurchase: number | null;
    validatedAt: string;
  };
};

class OfferBoxRedeemError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "OfferBoxRedeemError";
    this.status = status;
    this.code = code;
  }
}

function parseSnapshot(raw: string): OfferBoxSnapshot {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OfferBoxRedeemError(
      "بيانات العرض المحفوظ غير صالحة.",
      409,
      "OFFER_BOX_SNAPSHOT_INVALID",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new OfferBoxRedeemError(
      "بيانات العرض المحفوظ غير صالحة.",
      409,
      "OFFER_BOX_SNAPSHOT_INVALID",
    );
  }

  const snapshot = parsed as Partial<OfferBoxSnapshot>;

  if (
    snapshot.version !== 1 ||
    !snapshot.offer ||
    !snapshot.membershipTemplate ||
    !snapshot.commercial ||
    !snapshot.economics ||
    typeof snapshot.economics.commissionSnapshot !== "string" ||
    snapshot.economics.commissionSnapshot.trim() === "" ||
    snapshot.economics.attributionMode !== "direct_offer_box" ||
    !snapshot.eligibilitySnapshot
  ) {
    throw new OfferBoxRedeemError(
      "إصدار بيانات Offer Box غير مدعوم.",
      409,
      "OFFER_BOX_SNAPSHOT_UNSUPPORTED",
    );
  }

  const durationDays = Number(
    snapshot.membershipTemplate.durationDays,
  );

  const sessionsCount =
    snapshot.membershipTemplate.sessionsCount;

  const finalPrice = Number(
    snapshot.commercial.finalPrice,
  );

  if (
    !Number.isInteger(durationDays) ||
    durationDays <= 0 ||
    (
      sessionsCount != null &&
      (
        !Number.isInteger(sessionsCount) ||
        sessionsCount < 0
      )
    ) ||
    !Number.isFinite(finalPrice) ||
    finalPrice <= 0
  ) {
    throw new OfferBoxRedeemError(
      "شروط الاشتراك المحفوظة غير صالحة.",
      409,
      "OFFER_BOX_CONTRACT_INVALID",
    );
  }

  return snapshot as OfferBoxSnapshot;
}

/**
 * Offer Box redemption is independent of the membership lifecycle.
 *
 * A purchase already redeemed under the historical membership model
 * remains historical. New redemptions create exactly one entitlement.
 */
export async function POST(req: Request) {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return NextResponse.json(
      {
        error: "يجب تسجيل الدخول أولًا.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }

  try {
    const body = (await req.json()) as RedeemBody;

    const purchaseId =
      typeof body.purchaseId === "string"
        ? body.purchaseId.trim()
        : "";

    if (!purchaseId) {
      throw new OfferBoxRedeemError(
        "لم يتم تحديد العرض المحفوظ.",
        400,
        "PURCHASE_ID_REQUIRED",
      );
    }

    if (
      body.scheduleIds != null &&
      !Array.isArray(body.scheduleIds)
    ) {
      throw new OfferBoxRedeemError(
        "المواعيد المختارة غير صالحة.",
        400,
        "INVALID_SCHEDULE_SELECTION",
      );
    }

    const rawScheduleIds = body.scheduleIds ?? [];

    if (
      rawScheduleIds.length > 20 ||
      rawScheduleIds.some(
        (id) => typeof id !== "string" || !id.trim(),
      )
    ) {
      throw new OfferBoxRedeemError(
        "المواعيد المختارة غير صالحة.",
        400,
        "INVALID_SCHEDULE_SELECTION",
      );
    }

    const scheduleIds = rawScheduleIds.map(
      (id) => id.trim(),
    );

    if (
      new Set(scheduleIds).size !== scheduleIds.length
    ) {
      throw new OfferBoxRedeemError(
        "لا يمكن اختيار نفس الموعد أكثر من مرة.",
        400,
        "DUPLICATE_SCHEDULE_SELECTION",
      );
    }

    /*
     * Ownership must be checked before querying Paymob.
     * This read is not the final authorization: the transaction
     * repeats the checks after acquiring its locks.
     */
    const initialPurchase =
      await db.offerBoxPurchase.findUnique({
        where: { id: purchaseId },
      });

    if (!initialPurchase) {
      throw new OfferBoxRedeemError(
        "العرض المحفوظ غير موجود.",
        404,
        "OFFER_BOX_PURCHASE_NOT_FOUND",
      );
    }

    if (initialPurchase.userId !== user.id) {
      throw new OfferBoxRedeemError(
        "غير مسموح باستخدام هذا العرض.",
        403,
        "OFFER_BOX_NOT_OWNED",
      );
    }

    /*
     * Historical and independently redeemed purchases are read-only
     * replays. They do not create a new right, change membership status,
     * or rerun payment effects.
     */
    if (initialPurchase.status === "redeemed") {
      return replayRedeemedPurchase(
        purchaseId,
        user.id,
      );
    }

    if (initialPurchase.status !== "available") {
      throw new OfferBoxRedeemError(
        initialPurchase.status === "pending_payment"
          ? "الدفع لم يكتمل بعد."
          : "هذا العرض غير متاح للاستخدام.",
        409,
        initialPurchase.status === "pending_payment"
          ? "OFFER_BOX_PAYMENT_PENDING"
          : "OFFER_BOX_NOT_AVAILABLE",
      );
    }

    if (body.confirmed !== true) {
      throw new OfferBoxRedeemError(
        "يجب تأكيد تفعيل العرض أولًا.",
        400,
        "OFFER_BOX_ACTIVATION_CONFIRMATION_REQUIRED",
      );
    }

    if (!initialPurchase.paymentTransactionId) {
      throw new Error("OFFER_BOX_PAYMENT_LINK_MISSING");
    }

    const payment =
      await db.paymentTransaction.findUnique({
        where: {
          id: initialPurchase.paymentTransactionId,
        },
      });

    if (
      !payment ||
      payment.userId !== user.id ||
      payment.purpose !== "offer_box" ||
      payment.provider !== "paymob" ||
      payment.status !== "paid" ||
      payment.membershipId !== null
    ) {
      throw new OfferBoxRedeemError(
        "لا يمكن استخدام العرض قبل تأكيد الدفع.",
        409,
        "OFFER_BOX_PAYMENT_NOT_CONFIRMED",
      );
    }

    /*
     * Reuse the exact central Paymob Order verifier.
     * A local paid status is never the payment proof.
     */
    const provider = getPaymentProvider("paymob");

    if (!provider) {
      throw new OfferBoxRedeemError(
        "تعذر التحقق من الدفع حاليًا.",
        503,
        "PAYMOB_ORDER_VERIFIER_UNAVAILABLE",
      );
    }

    const verification =
      await provider.verifyTransaction({
        id: payment.id,
        providerReference: payment.providerReference,
        externalReference: payment.externalReference,
        amount: payment.amount,
        currency: payment.currency,
        metadata: payment.metadata,
        providerPayload: payment.providerPayload,
      });

    if (verification.status !== "paid") {
      throw new OfferBoxRedeemError(
        "لم يتم تأكيد عملية الدفع من مزود الخدمة.",
        409,
        "PAYMOB_ORDER_PAID_PROOF_REQUIRED",
      );
    }

    /*
     * Repair a missing purchase-time commission using the existing
     * central paid reconciliation. That service independently verifies
     * authoritative Paymob proof and protects legacy HR identities.
     *
     * It does not activate memberships for offer_box payments.
     */
    await updatePaymentTransactionStatus(
      payment.id,
      "paid",
    );

    const result = await db.$transaction(
      async (tx) => {
        /*
         * Shared per-customer lifecycle lock.
         * Prevent concurrent booking/activation changes for this user.
         */
        await lockMembershipLifecycleUserTx(
          asDbTransactionClient(tx),
          user.id,
        );

        await tx.$queryRaw`
          SELECT id
          FROM OfferBoxPurchase
          WHERE id = ${purchaseId}
          FOR UPDATE
        `;

        const purchase =
          await tx.offerBoxPurchase.findUnique({
            where: { id: purchaseId },
          });

        if (
          !purchase ||
          purchase.userId !== user.id
        ) {
          throw new OfferBoxRedeemError(
            "العرض المحفوظ غير متاح.",
            404,
            "OFFER_BOX_PURCHASE_NOT_FOUND",
          );
        }

        if (purchase.status === "redeemed") {
          return readRedeemedPurchaseTx(
            tx,
            purchase,
            user.id,
          );
        }

        if (
          purchase.status !== "available" ||
          purchase.redeemedUserMembershipId !== null ||
          purchase.paymentTransactionId !== payment.id
        ) {
          throw new Error(
            "OFFER_BOX_REDEEM_STATE_CHANGED",
          );
        }

        if (
          purchase.offerSnapshot !==
            initialPurchase.offerSnapshot ||
          purchase.snapshotVersion !== 1 ||
          purchase.currency !== payment.currency ||
          purchase.priceSnapshot !==
            initialPurchase.priceSnapshot ||
          Math.round(purchase.priceSnapshot * 100) !==
            Math.round(payment.amount * 100)
        ) {
          throw new Error(
            "OFFER_BOX_REDEEM_PURCHASE_CONTRACT_CHANGED",
          );
        }

        const snapshot =
          parseSnapshot(purchase.offerSnapshot);

        /*
         * Freeze the period at server-side confirmation.
         * No lookup of the original live membership definition.
         */
        const activation =
          prepareConfirmedOfferBoxActivation(
            snapshot,
            body.confirmed === true,
            scheduleIds,
            new Date(),
          );

        const existingEntitlement =
          await tx.offerBoxEntitlement.findUnique({
            where: { purchaseId: purchase.id },
            select: { id: true },
          });

        if (existingEntitlement) {
          throw new Error(
            "OFFER_BOX_AVAILABLE_ENTITLEMENT_REVIEW_REQUIRED",
          );
        }

        const entitlement =
          await tx.offerBoxEntitlement.create({
            data: {
              purchaseId: purchase.id,
              userId: user.id,
              status: "active",
              startDate: activation.startDate,
              endDate: activation.endDate,
              totalSessions: activation.totalSessions,
              eligibilitySnapshot:
                activation.eligibilitySnapshot,
              allowedClassTypesSnapshot:
                activation.allowedClassTypesSnapshot,
            },
          });

        const bookingResult =
          await applyOfferBoxBookingPlanTx({
            tx,
            userId: user.id,
            offerBoxEntitlementId: entitlement.id,
            startDate: entitlement.startDate,
            endDate: entitlement.endDate,
            selectedScheduleIds:
              activation.selectedScheduleIds,
            source: {
              type: "offer",
              id: snapshot.offer.id,
            },
            plan: {
              kind:
                snapshot.membershipTemplate.kind ||
                "subscription",
              sessionsCount:
                activation.totalSessions,
              duration:
                activation.durationDays,
            },
          });

        /*
         * Financial posting, wallet/points/product rewards and
         * the exact-once marker participate in the same transaction.
         */
        await settleIndependentOfferBoxActivationTx(
          tx,
          {
            purchaseId: purchase.id,
            entitlementId: entitlement.id,
            userId: user.id,
            verifiedPayment: {
              verified: true,
              id: payment.id,
              providerReference:
                payment.providerReference,
              externalReference:
                payment.externalReference,
              providerPayload:
                payment.providerPayload,
              amount: payment.amount,
              currency: payment.currency,
            },
          },
        );

        /*
         * Convert the existing paid reservation exactly once.
         * A deleted source offer remains redeemable from its snapshot.
         */
        if (purchase.offerId) {
          const converted = await tx.$executeRaw`
            UPDATE Offer
            SET
              offerBoxReservedCount =
                offerBoxReservedCount - 1,
              currentSubscribers =
                currentSubscribers + 1
            WHERE id = ${purchase.offerId}
              AND offerBoxReservedCount > 0
          `;

          if (Number(converted) !== 1) {
            throw new Error(
              "OFFER_BOX_RESERVED_COUNT_INTEGRITY_ERROR",
            );
          }
        }

        /*
         * Final claim. Never link the purchase or payment to
         * a UserMembership for independent redemption.
         */
        const redeemed =
          await tx.offerBoxPurchase.updateMany({
            where: {
              id: purchase.id,
              userId: user.id,
              status: "available",
              redeemedUserMembershipId: null,
              paymentTransactionId: payment.id,
            },
            data: {
              status: "redeemed",
              redeemedAt: new Date(),
              holdExpiresAt: null,
            },
          });

        if (redeemed.count !== 1) {
          throw new Error(
            "OFFER_BOX_REDEEM_CLAIM_LOST",
          );
        }

        return {
          alreadyRedeemed: false,
          redemptionType: "independent" as const,
          membership: null,
          entitlement: {
            id: entitlement.id,
            startDate: entitlement.startDate,
            endDate: entitlement.endDate,
            status: entitlement.status,
            totalSessions:
              entitlement.totalSessions,
          },
          bookedSchedules:
            bookingResult.bookedSchedules,
          carryover: null,
        };
      },
      { timeout: 20000 },
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof MembershipBookingPlanError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "OFFER_BOX_SCHEDULE_INVALID",
          action: error.action,
        },
        { status: 409 },
      );
    }

    if (error instanceof OfferBoxRedeemError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    console.error(
      "[OFFER_BOX_REDEEM_POST]",
      error,
    );

    return NextResponse.json(
      {
        error: "تعذر استخدام العرض المحفوظ حاليًا.",
        code: "OFFER_BOX_REDEEM_FAILED",
      },
      { status: 500 },
    );
  }
}

type RedeemedPurchaseIdentity = {
  id: string;
  userId: string;
  status: string;
  redeemedUserMembershipId: string | null;
};

type RedeemTransaction =
  Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Read-only replay. Historical and independent identities must never
 * coexist for the same purchase.
 */
async function readRedeemedPurchaseTx(
  tx: RedeemTransaction,
  purchase: RedeemedPurchaseIdentity,
  userId: string,
) {
  if (
    purchase.userId !== userId ||
    purchase.status !== "redeemed"
  ) {
    throw new Error(
      "OFFER_BOX_REDEEMED_PURCHASE_IDENTITY_MISMATCH",
    );
  }

  const entitlement =
    await tx.offerBoxEntitlement.findUnique({
      where: { purchaseId: purchase.id },
      select: {
        id: true,
        userId: true,
        status: true,
        startDate: true,
        endDate: true,
        totalSessions: true,
      },
    });

  if (purchase.redeemedUserMembershipId) {
    if (entitlement) {
      throw new Error(
        "OFFER_BOX_DUAL_REDEMPTION_REVIEW_REQUIRED",
      );
    }

    const membership =
      await tx.userMembership.findUnique({
        where: {
          id: purchase.redeemedUserMembershipId,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          startDate: true,
          endDate: true,
          totalSessions: true,
          offerId: true,
        },
      });

    if (
      !membership ||
      membership.userId !== userId
    ) {
      throw new Error(
        "OFFER_BOX_LEGACY_REDEMPTION_IDENTITY_MISMATCH",
      );
    }

    const {
      userId: _owner,
      ...membershipData
    } = membership;

    return {
      alreadyRedeemed: true,
      redemptionType: "legacy_membership" as const,
      membership: membershipData,
      entitlement: null,
      bookedSchedules: [],
      carryover: null,
    };
  }

  if (
    !entitlement ||
    entitlement.userId !== userId
  ) {
    throw new Error(
      "OFFER_BOX_REDEEMED_ENTITLEMENT_MISSING",
    );
  }

  const {
    userId: _owner,
    ...entitlementData
  } = entitlement;

  return {
    alreadyRedeemed: true,
    redemptionType: "independent" as const,
    membership: null,
    entitlement: entitlementData,
    bookedSchedules: [],
    carryover: null,
  };
}

async function replayRedeemedPurchase(
  purchaseId: string,
  userId: string,
) {
  const result = await db.$transaction(
    async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM OfferBoxPurchase
        WHERE id = ${purchaseId}
        FOR UPDATE
      `;

      const purchase =
        await tx.offerBoxPurchase.findUnique({
          where: { id: purchaseId },
        });

      if (!purchase) {
        throw new Error(
          "OFFER_BOX_REDEEMED_PURCHASE_MISSING",
        );
      }

      return readRedeemedPurchaseTx(
        tx,
        purchase,
        userId,
      );
    },
    { timeout: 10000 },
  );

  return NextResponse.json({
    success: true,
    ...result,
  });
}
