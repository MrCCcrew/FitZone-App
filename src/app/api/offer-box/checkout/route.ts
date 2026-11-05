import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { asDbTransactionClient, db } from "@/lib/db";
import { evaluateEgyptianNationalIdAgeEligibility, evaluateOfferAgeEligibility } from "@/lib/offer-age-eligibility";
import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing";
import { isOfferBoxPaymobCheckoutReady } from "@/lib/payments/offer-box-checkout-readiness";
import { getEligibilityPolicySnapshotForSource } from "@/lib/get-eligible-classes";
import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import {
  createPaymentTransaction,
  updatePaymentTransactionStatus,
} from "@/lib/payments/service";

type CheckoutBody = {
  offerId?: string | null;
  egyptianNationalId?: string | null;
  returnUrl?: string | null;
  cancelUrl?: string | null;
};

type LockedOfferRow = {
  id: string;
  title: string;
  titleEn: string | null;
  type: string;
  discount: number;
  description: string | null;
  descriptionEn: string | null;
  appliesTo: string | null;
  appliesToEn: string | null;
  expiresAt: Date;
  isActive: boolean | number;
  membershipId: string | null;
  specialPrice: number | null;
  maxSubscribers: number | null;
  currentSubscribers: number;
  offerBoxEnabled: boolean | number;
  offerBoxApplyDiscount: boolean | number;
  offerBoxReservedCount: number;
  sessionsCount: number | null;
  durationDays: number | null;
  priceBefore: number | null;
  features: string | null;
  featuresEn: string | null;
  requiresBirthDate: boolean | number;
  requiresEgyptianNationalId: boolean | number;
  minAgeYears: number | null;
  maxAgeYears: number | null;
};

type PendingBoxRow = {
  id: string;
  holdExpiresAt: Date | null;
};

class OfferBoxCheckoutError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "OfferBoxCheckoutError";
    this.status = status;
    this.code = code;
  }
}

function isTrue(value: boolean | number | null | undefined) {
  return value === true || Number(value ?? 0) === 1;
}

function parseJsonArray(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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
    const body = (await req.json()) as CheckoutBody;
    const offerId =
      typeof body.offerId === "string"
        ? body.offerId.trim()
        : "";

    if (!offerId) {
      throw new OfferBoxCheckoutError(
        "يرجى اختيار العرض أولًا.",
        400,
        "OFFER_ID_REQUIRED",
      );
    }

    // Definitive local configuration failures must not reserve an offer
    // or create an orphan payment. No Paymob network request happens here.
    if (!(await isOfferBoxPaymobCheckoutReady())) {
      throw new OfferBoxCheckoutError(
        "الدفع الإلكتروني غير متاح مؤقتًا. يرجى المحاولة لاحقًا.",
        503,
        "OFFER_BOX_PAYMENT_PROVIDER_NOT_READY",
      );
    }

    const now = new Date();

    // Conservative fallback only for an ambiguous provider failure.
    // Successful checkout creation replaces this with provider expiresAt.
    const provisionalHoldExpiresAt = new Date(
      now.getTime() + 60 * 60 * 1000,
    );

    const reserved = await db.$transaction(
      async (tx) => {
        const offerRows =
          await tx.$queryRaw<LockedOfferRow[]>`
            SELECT
              id,
              title,
              titleEn,
              type,
              discount,
              description,
              descriptionEn,
              appliesTo,
              appliesToEn,
              expiresAt,
              isActive,
              membershipId,
              specialPrice,
              maxSubscribers,
              currentSubscribers,
              offerBoxEnabled,
              offerBoxApplyDiscount,
              offerBoxReservedCount,
              sessionsCount,
              durationDays,
              priceBefore,
              features,
              featuresEn,
              requiresBirthDate,
              requiresEgyptianNationalId,
              minAgeYears,
              maxAgeYears
            FROM Offer
            WHERE id = ${offerId}
            LIMIT 1
            FOR UPDATE
          `;

        const offer = offerRows[0];

        if (!offer) {
          throw new OfferBoxCheckoutError(
            "العرض غير موجود.",
            404,
            "OFFER_NOT_FOUND",
          );
        }

        if (
          !isTrue(offer.isActive) ||
          offer.expiresAt.getTime() <= now.getTime()
        ) {
          throw new OfferBoxCheckoutError(
            "العرض غير متاح للشراء الآن.",
            409,
            "OFFER_NOT_AVAILABLE",
          );
        }

        if (!isTrue(offer.offerBoxEnabled)) {
          throw new OfferBoxCheckoutError(
            "خاصية حفظ هذا العرض في Offer Box غير مفعلة.",
            409,
            "OFFER_BOX_DISABLED",
          );
        }

        const existingPending =
          await tx.$queryRaw<PendingBoxRow[]>`
            SELECT
              id,
              holdExpiresAt
            FROM OfferBoxPurchase
            WHERE
              userId = ${user.id}
              AND offerId = ${offer.id}
              AND status = 'pending_payment'
            ORDER BY createdAt DESC
            LIMIT 1
            FOR UPDATE
          `;

        if (existingPending.length > 0) {
          throw new OfferBoxCheckoutError(
            "لديك عملية دفع معلقة بالفعل لهذا العرض.",
            409,
            "OFFER_BOX_PENDING_CHECKOUT_EXISTS",
          );
        }

        const maxSubscribers =
          offer.maxSubscribers != null
            ? Number(offer.maxSubscribers)
            : null;

        const currentSubscribers =
          Number(offer.currentSubscribers ?? 0);

        const reservedCount =
          Number(offer.offerBoxReservedCount ?? 0);

        if (
          maxSubscribers != null &&
          maxSubscribers > 0 &&
          currentSubscribers + reservedCount >= maxSubscribers
        ) {
          throw new OfferBoxCheckoutError(
            "اكتمل العدد المتاح لهذا العرض.",
            409,
            "OFFER_BOX_SOLD_OUT",
          );
        }

        const requiresBirthDate =
          isTrue(offer.requiresBirthDate);

        const minAgeYears =
          offer.minAgeYears != null
            ? Number(offer.minAgeYears)
            : null;

        const maxAgeYears =
          offer.maxAgeYears != null
            ? Number(offer.maxAgeYears)
            : null;

        const isEgyptianIdOffer = isTrue(offer.requiresEgyptianNationalId);
        const ageSubject =
          !isEgyptianIdOffer && (
            requiresBirthDate ||
            minAgeYears != null ||
            maxAgeYears != null
          )
            ? await tx.user.findUnique({
                where: {
                  id: user.id,
                },
                select: {
                  birthDate: true,
                },
              })
            : null;

        const ageEligibility = isEgyptianIdOffer
          ? evaluateEgyptianNationalIdAgeEligibility({
              egyptianNationalId: body.egyptianNationalId,
              minAgeYears,
              maxAgeYears,
              now,
            })
          : evaluateOfferAgeEligibility({
              requiresBirthDate,
              minAgeYears,
              maxAgeYears,
              birthDate: ageSubject?.birthDate ?? null,
              now,
            });

        if (!ageEligibility.eligible) {
          throw new OfferBoxCheckoutError(
            ageEligibility.message,
            400,
            ageEligibility.code,
          );
        }

        const membership = offer.membershipId
          ? await tx.membership.findUnique({
              where: {
                id: offer.membershipId,
              },
              select: {
                id: true,
                name: true,
                nameEn: true,
                kind: true,
                isActive: true,
                price: true,
                priceBefore: true,
                priceAfter: true,
                duration: true,
                sessionsCount: true,
                walletBonus: true,
                productRewards: true,
            coachMembershipEnabled: true,
              },
            })
          : null;

        if (
          offer.membershipId &&
          (!membership || !membership.isActive)
        ) {
          throw new OfferBoxCheckoutError(
            "الباقة المرتبطة بهذا العرض غير متاحة.",
            409,
            "OFFER_MEMBERSHIP_NOT_AVAILABLE",
          );
        }

        if (membership?.coachMembershipEnabled) {
          throw new OfferBoxCheckoutError(
            "اشتراكات المدرب لا يمكن حفظها في Offer Box قبل اختيار المدرب.",
            409,
            "OFFER_BOX_COACH_MEMBERSHIP_UNSUPPORTED",
          );
        }

        const basePrice =
          membership != null
            ? Number(membership.price)
            : Number(offer.specialPrice ?? 0);

        let finalPrice: number;
        try {
          finalPrice = calculateOfferBoxFinalPrice({
            offerType: offer.type,
            discount: Number(offer.discount),
            specialPrice: offer.specialPrice != null ? Number(offer.specialPrice) : null,
            membershipPriceAfter: membership?.priceAfter ?? null,
            basePrice,
            applyOfferDiscount: isTrue(offer.offerBoxApplyDiscount),
          });
        } catch {
          throw new OfferBoxCheckoutError(
            "إعدادات سعر العرض غير صالحة.", 409, "OFFER_BOX_INVALID_DISCOUNT",
          );
        }

        if (
          !Number.isFinite(finalPrice) ||
          finalPrice <= 0
        ) {
          throw new OfferBoxCheckoutError(
            "سعر العرض غير صالح للشراء عبر Offer Box.",
            409,
            "OFFER_BOX_INVALID_PRICE",
          );
        }

        const originalPrice =
          membership?.priceBefore &&
          membership.priceBefore > 0
            ? Number(membership.priceBefore)
            : basePrice;

        const effectiveDurationDays =
          offer.durationDays ??
          membership?.duration ??
          30;

        const effectiveSessionsCount =
          offer.sessionsCount ??
          membership?.sessionsCount ??
          null;

        const eligibilitySnapshot =
          await getEligibilityPolicySnapshotForSource(
            {
              type: "offer",
              id: offer.id,
            },
            tx,
          );

        const commissionSnapshot =
          await buildMembershipCommissionSnapshotTx(
            asDbTransactionClient(tx),
            {
              partnerId: null,
              partnerCodeId: null,
              affiliateLinkId: null,

              salesAgentUserId: null,
              salesAgentId: null,

              staffReferralLinkId: null,
              trainerReferralLinkId: null,
              nutritionReferralLinkId: null,

              customerUserId: user.id,
              staffReferralAsOfDate: now,

              partnerCommissionBase: finalPrice,
              customerPaidAmount: finalPrice,
            },
          );

        const snapshot = {
          version: 1,
          purchasedAt: now.toISOString(),

          offer: {
            id: offer.id,
            title: offer.title,
            titleEn: offer.titleEn,
            type: offer.type,
            discount: Number(offer.discount),
            offerBoxApplyDiscount: isTrue(offer.offerBoxApplyDiscount),
            description: offer.description,
            descriptionEn: offer.descriptionEn,
            appliesTo: offer.appliesTo,
            appliesToEn: offer.appliesToEn,
            expiresAtAtPurchase:
              offer.expiresAt.toISOString(),
            membershipId: offer.membershipId,
            sessionsCount: effectiveSessionsCount,
            durationDays: effectiveDurationDays,
            priceBefore:
              offer.priceBefore ??
              originalPrice,
            specialPrice: finalPrice,
            features:
              parseJsonArray(offer.features),
            featuresEn:
              parseJsonArray(offer.featuresEn),
          },

          membershipTemplate: {
            sourceMembershipId:
              membership?.id ?? null,
            name:
              membership?.name ?? offer.title,
            nameEn:
              membership?.nameEn ??
              offer.titleEn ??
              offer.title,
            kind:
              membership?.kind ??
              "subscription",
            durationDays:
              effectiveDurationDays,
            sessionsCount:
              effectiveSessionsCount,
            walletBonus:
              Number(
                membership?.walletBonus ?? 0,
              ),
            productRewards:
              membership?.productRewards ?? null,
          },

          commercial: {
            currency: "EGP",
            originalPrice,
            finalPrice,
          },

          eligibilitySnapshot,

          economics: {
            commissionSnapshot,
            attributionMode: "direct_offer_box",
          },

          ageEligibility: {
            requiresBirthDate,
            verificationMethod: isEgyptianIdOffer ? "egyptian_national_id" : "account_birth_date",
            minAgeYears,
            maxAgeYears,
            ageYearsAtPurchase:
              ageEligibility.ageYears,
            validatedAt: now.toISOString(),
          },
        };

        const purchaseId = randomUUID();

        const capacityClaim =
          await tx.$executeRaw`
            UPDATE Offer
            SET
              offerBoxReservedCount =
                offerBoxReservedCount + 1
            WHERE
              id = ${offer.id}
              AND (
                maxSubscribers IS NULL
                OR maxSubscribers <= 0
                OR (
                  currentSubscribers +
                  offerBoxReservedCount
                ) < maxSubscribers
              )
          `;

        if (Number(capacityClaim) !== 1) {
          throw new OfferBoxCheckoutError(
            "اكتمل العدد المتاح لهذا العرض.",
            409,
            "OFFER_BOX_SOLD_OUT",
          );
        }

        await tx.$executeRaw`
          INSERT INTO OfferBoxPurchase (
            id,
            userId,
            offerId,
            status,
            offerSnapshot,
            snapshotVersion,
            priceSnapshot,
            currency,
            paymentMethod,
            holdExpiresAt,
            paymentTransactionId,
            createdAt,
            updatedAt
          )
          VALUES (
            ${purchaseId},
            ${user.id},
            ${offer.id},
            'pending_payment',
            ${JSON.stringify(snapshot)},
            1,
            ${finalPrice},
            'EGP',
            'paymob',
            ${provisionalHoldExpiresAt},
            NULL,
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
          )
        `;

        return {
          purchaseId,
          offerId: offer.id,
          offerTitle: offer.title,
          amount: finalPrice,
          holdExpiresAt:
            provisionalHoldExpiresAt,

          /*
           * Immutable invoice presentation/economic snapshot.
           * Membership dates remain redemption-time facts.
           */
          invoiceSnapshot: {
            version: 1,
            customerName:
              user.name ?? "",
            customerEmail:
              user.email ?? "",
            membershipName:
              snapshot.membershipTemplate.name,
            membershipNameEn:
              snapshot.membershipTemplate.nameEn,
            offerTitle:
              snapshot.offer.title,
            offerTitleEn:
              snapshot.offer.titleEn,
            originalPrice:
              Number(snapshot.offer.priceBefore),
            membershipDiscount:
              Math.max(
                0,
                Number(snapshot.offer.priceBefore) -
                  Number(snapshot.commercial.finalPrice),
              ),
            discountCodeAmount: 0,
            discountCode: null,
            walletDeduct: 0,
            pointsDeduct: 0,
            finalAmount:
              Number(snapshot.commercial.finalPrice),
            paymentMethod: "paymob",
          },
        };
      },
      {
        timeout: 15000,
      },
    );

    /*
     * External checkout creation deliberately happens AFTER the
     * capacity reservation transaction.
     *
     * If the provider call becomes ambiguous, we retain the temporary
     * reservation rather than risk overselling a checkout that may
     * still complete. Cleanup will handle the expired hold later.
     */
    const payment =
      await createPaymentTransaction({
        userId: user.id,
        provider: "paymob",
        purpose: "offer_box",
        businessUnit: "club",
        amount: reserved.amount,
        currency: "EGP",
        paymentMethod: "paymob",
        offerId: reserved.offerId,
        returnUrl:
          body.returnUrl ?? null,
        cancelUrl:
          body.cancelUrl ?? null,
        description:
          `حجز عرض ${reserved.offerTitle} في Offer Box`,
        provisionalExpiresAt:
          reserved.holdExpiresAt,
        metadata: {
          offerBoxPurchaseId:
            reserved.purchaseId,
          offerBoxSnapshotVersion: 1,

          /*
           * Persisted in PaymentTransaction before the external provider
           * call, so it survives checkout crash/ambiguity recovery too.
           */
          offerBoxInvoiceSnapshot:
            reserved.invoiceSnapshot,
        },
        customer: {
          name: user.name,
          email: user.email,
          phone: null,
        },
      });

    const resolvedExpiry =
      payment.expiresAt instanceof Date
        ? payment.expiresAt
        : reserved.holdExpiresAt;

    await db.$transaction(async (tx) => {
      const rows =
        await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            paymentTransactionId: string | null;
          }>
        >`
          SELECT
            id,
            status,
            paymentTransactionId
          FROM OfferBoxPurchase
          WHERE id = ${reserved.purchaseId}
          LIMIT 1
          FOR UPDATE
        `;

      const purchase = rows[0];

      if (!purchase) {
        throw new Error(
          "OFFER_BOX_PURCHASE_DISAPPEARED",
        );
      }

      if (
        purchase.paymentTransactionId != null &&
        purchase.paymentTransactionId !== payment.id
      ) {
        throw new Error(
          "OFFER_BOX_PAYMENT_TRANSACTION_MISMATCH",
        );
      }

      await tx.$executeRaw`
        UPDATE OfferBoxPurchase
        SET
          paymentTransactionId =
            COALESCE(
              paymentTransactionId,
              ${payment.id}
            ),
          holdExpiresAt =
            CASE
              WHEN status = 'pending_payment'
              THEN ${resolvedExpiry}
              ELSE NULL
            END,
          updatedAt = CURRENT_TIMESTAMP(3)
        WHERE id = ${purchase.id}
      `;
    });

    if (
      payment.status === "paid" ||
      payment.status === "failed" ||
      payment.status === "cancelled" ||
      payment.status === "expired"
    ) {
      await updatePaymentTransactionStatus(
        payment.id,
        payment.status,
      );
    }

    return NextResponse.json({
      success: true,
      purchaseId: reserved.purchaseId,
      transaction: payment,
    });
  } catch (error) {
    if (error instanceof OfferBoxCheckoutError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: error.status,
        },
      );
    }

    console.error(
      "[OFFER_BOX_CHECKOUT_POST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر إنشاء عملية شراء Offer Box حاليًا.",
        code: "OFFER_BOX_CHECKOUT_FAILED",
      },
      { status: 500 },
    );
  }
}