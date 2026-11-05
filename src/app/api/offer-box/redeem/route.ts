import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import {
  asDbTransactionClient,
  db,
} from "@/lib/db";
import { addCairoCalendarDays } from "@/lib/fitzone-time";
import {
  applyMembershipBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";
import {
  applyMembershipSessionCarryoverTx,
  isBlockingMembershipCarryoverReason,
} from "@/lib/membership-session-carryover";
import { lockMembershipLifecycleUserTx } from "@/lib/membership-lifecycle-lock";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";

type RedeemBody = {
  purchaseId?: string | null;
  scheduleIds?: string[] | null;
};

type OfferBoxPurchaseRow = {
  id: string;
  userId: string;
  offerId: string | null;
  status: string;
  offerSnapshot: string;
  snapshotVersion: number;
  priceSnapshot: number;
  currency: string;
  paymentMethod: string | null;
  paymentTransactionId: string | null;
  paidAt: Date | null;
  redeemedAt: Date | null;
  redeemedUserMembershipId: string | null;
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

async function lockPurchase(
  tx: any,
  purchaseId: string,
): Promise<OfferBoxPurchaseRow | null> {
  const rows =
    await tx.$queryRaw<OfferBoxPurchaseRow[]>`
      SELECT
        id,
        userId,
        offerId,
        status,
        offerSnapshot,
        snapshotVersion,
        priceSnapshot,
        currency,
        paymentMethod,
        paymentTransactionId,
        paidAt,
        redeemedAt,
        redeemedUserMembershipId
      FROM OfferBoxPurchase
      WHERE id = ${purchaseId}
      LIMIT 1
      FOR UPDATE
    `;

  return rows[0] ?? null;
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

    const scheduleIds = [
      ...new Set(
        (Array.isArray(body.scheduleIds)
          ? body.scheduleIds
          : []
        )
          .filter(
            (value): value is string =>
              typeof value === "string",
          )
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    if (scheduleIds.length > 20) {
      throw new OfferBoxRedeemError(
        "عدد المواعيد المختارة أكبر من المسموح.",
        400,
        "TOO_MANY_SCHEDULES",
      );
    }

    const result = await db.$transaction(
      async (tx) => {
        const purchase =
          await lockPurchase(tx, purchaseId);

        if (!purchase) {
          throw new OfferBoxRedeemError(
            "العرض المحفوظ غير موجود.",
            404,
            "OFFER_BOX_PURCHASE_NOT_FOUND",
          );
        }

        if (purchase.userId !== user.id) {
          throw new OfferBoxRedeemError(
            "غير مسموح باستخدام هذا العرض.",
            403,
            "OFFER_BOX_NOT_OWNED",
          );
        }

        if (
          purchase.status === "redeemed" &&
          purchase.redeemedUserMembershipId
        ) {
          const membership =
            await tx.userMembership.findUnique({
              where: {
                id:
                  purchase.redeemedUserMembershipId,
              },
              select: {
                id: true,
                startDate: true,
                endDate: true,
                status: true,
                totalSessions: true,
                offerId: true,
              },
            });

          if (!membership) {
            throw new Error(
              "OFFER_BOX_REDEEMED_MEMBERSHIP_MISSING",
            );
          }

          return {
            alreadyRedeemed: true,
            membership,
            bookedSchedules: [],
            carryover: null,
            paymentTransactionId:
              purchase.paymentTransactionId,
            offerSnapshot:
              purchase.offerSnapshot,
          };
        }

        if (purchase.status !== "available") {
          throw new OfferBoxRedeemError(
            purchase.status === "pending_payment"
              ? "الدفع لم يكتمل بعد."
              : "هذا العرض غير متاح للاستخدام.",
            409,
            purchase.status === "pending_payment"
              ? "OFFER_BOX_PAYMENT_PENDING"
              : "OFFER_BOX_NOT_AVAILABLE",
          );
        }

        if (!purchase.paymentTransactionId) {
          throw new Error(
            "OFFER_BOX_PAYMENT_LINK_MISSING",
          );
        }

        const payment =
          await tx.paymentTransaction.findUnique({
            where: {
              id:
                purchase.paymentTransactionId,
            },
            select: {
              id: true,
              userId: true,
              purpose: true,
              status: true,
              amount: true,
              currency: true,
            },
          });

        if (
          !payment ||
          payment.userId !== user.id ||
          payment.purpose !== "offer_box" ||
          payment.status !== "paid"
        ) {
          throw new OfferBoxRedeemError(
            "لا يمكن استخدام العرض قبل تأكيد الدفع.",
            409,
            "OFFER_BOX_PAYMENT_NOT_CONFIRMED",
          );
        }

        if (
          Math.abs(
            Number(payment.amount) -
            Number(purchase.priceSnapshot),
          ) > 0.001 ||
          String(payment.currency).toUpperCase() !==
            String(purchase.currency).toUpperCase()
        ) {
          throw new Error(
            "OFFER_BOX_PAYMENT_CONTRACT_MISMATCH",
          );
        }

        const snapshot =
          parseSnapshot(purchase.offerSnapshot);

        if (
          purchase.snapshotVersion !== 1 ||
          snapshot.version !== 1
        ) {
          throw new OfferBoxRedeemError(
            "إصدار Offer Box غير مدعوم.",
            409,
            "OFFER_BOX_SNAPSHOT_UNSUPPORTED",
          );
        }

        await lockMembershipLifecycleUserTx(
          asDbTransactionClient(tx),
          user.id,
        );

        const template =
          snapshot.membershipTemplate;

        let membershipId =
          template.sourceMembershipId;

        let membership =
          membershipId
            ? await tx.membership.findUnique({
                where: {
                  id: membershipId,
                },
                select: {
                  id: true,
                  kind: true,
                },
              })
            : null;

        /*
         * If the original membership definition was deleted later,
         * create an inert snapshot-backed template.
         */
        if (!membership) {
          const syntheticMarker =
            `__offer_box_snapshot__:${purchase.id}`;

          const existingSynthetic =
            await tx.membership.findFirst({
              where: {
                subtitle: syntheticMarker,
                isActive: false,
              },
              select: {
                id: true,
                kind: true,
              },
            });

          if (existingSynthetic) {
            membership = existingSynthetic;
            membershipId =
              existingSynthetic.id;
          } else {
            const synthetic =
              await tx.membership.create({
                data: {
                  name:
                    template.name ||
                    snapshot.offer.title,
                  nameEn:
                    template.nameEn ||
                    snapshot.offer.titleEn ||
                    snapshot.offer.title,
                  kind:
                    template.kind ||
                    "subscription",
                  price:
                    snapshot.commercial.finalPrice,
                  priceBefore:
                    snapshot.commercial.originalPrice,
                  priceAfter:
                    snapshot.commercial.finalPrice,
                  duration:
                    template.durationDays,
                  cycle: "custom",
                  sessionsCount:
                    template.sessionsCount,
                  features: JSON.stringify(
                    snapshot.offer.features?.length
                      ? snapshot.offer.features
                      : [
                          snapshot.offer.description ||
                            "Offer Box subscription",
                        ],
                  ),
                  featuresEn: JSON.stringify(
                    snapshot.offer.featuresEn?.length
                      ? snapshot.offer.featuresEn
                      : [
                          snapshot.offer.descriptionEn ||
                            "Offer Box subscription",
                        ],
                  ),
                  maxClasses: -1,
                  walletBonus:
                    Number(
                      template.walletBonus ?? 0,
                    ),
                  productRewards:
                    template.productRewards,
                  isFeatured: false,
                  isActive: false,
                  subtitle: syntheticMarker,
                },
              });

            membership = {
              id: synthetic.id,
              kind: synthetic.kind,
            };

            membershipId = synthetic.id;
          }
        }

        if (!membershipId || !membership) {
          throw new Error(
            "OFFER_BOX_MEMBERSHIP_TEMPLATE_FAILED",
          );
        }

        /*
         * Duration starts at the actual redemption instant.
         * Cairo calendar-day addition preserves the Cairo wall-clock
         * time correctly across DST changes.
         */
        const startDate = new Date();

        const endDate =
          addCairoCalendarDays(
            startDate,
            template.durationDays,
          );

        const sessionsCount =
          template.sessionsCount;

        const eligibilitySnapshot =
          JSON.stringify(
            snapshot.eligibilitySnapshot,
          );

        const allowedClassTypes =
          Array.isArray(
            snapshot.eligibilitySnapshot.classTypes,
          )
            ? snapshot.eligibilitySnapshot.classTypes.filter(
                (value): value is string =>
                  typeof value === "string",
              )
            : [];

        const membershipOfferSnapshot =
          JSON.stringify({
            offerId: snapshot.offer.id,
            title: snapshot.offer.title,
            titleEn: snapshot.offer.titleEn,
            description:
              snapshot.offer.description,
            descriptionEn:
              snapshot.offer.descriptionEn,
            features:
              snapshot.offer.features,
            featuresEn:
              snapshot.offer.featuresEn,
            type: snapshot.offer.type,
            discountType:
              snapshot.offer.type,
            discountValue:
              snapshot.offer.discount,
            originalPrice:
              snapshot.commercial.originalPrice,
            finalPrice:
              snapshot.commercial.finalPrice,
            durationDays:
              template.durationDays,
            sessionsCount,
            ageEligibility:
              snapshot.ageEligibility,
            offerBoxPurchaseId:
              purchase.id,
            purchasedAt:
              snapshot.purchasedAt,
          });

        const subscription =
          await tx.userMembership.create({
            data: {
              userId: user.id,
              membershipId,
              startDate,
              endDate,
              status: "active",
              activatedAt: startDate,
              pendingExpiresAt: null,
              paymentAmount:
                Number(
                  purchase.priceSnapshot,
                ),
              paymentMethod: "offer_box",
              offerTitle:
                snapshot.offer.title,
              offerId:
                purchase.offerId,
              totalSessions:
                sessionsCount,
              baseSessions:
                sessionsCount,
              eligibilitySnapshot,
              offerSnapshot:
                membershipOfferSnapshot,
              allowedClassTypesSnapshot:
                allowedClassTypes.length > 0
                  ? JSON.stringify(
                      allowedClassTypes,
                    )
                  : null,
              snapshotDurationDays:
                template.durationDays,
              snapshotOriginalPrice:
                snapshot.commercial.originalPrice,
              snapshotFinalPrice:
                snapshot.commercial.finalPrice,

              commissionSnapshot:
                snapshot.economics.commissionSnapshot,

              productRewardsUsed:
                template.productRewards,
            },
          });

        /*
         * New entitlement bookings FIRST.
         * Any invalid/full selected schedule rolls back everything.
         */
        const bookingResult =
          await applyMembershipBookingPlanTx({
            tx,
            userId: user.id,
            userMembershipId:
              subscription.id,
            startDate:
              subscription.startDate,
            endDate:
              subscription.endDate,
            selectedScheduleIds:
              scheduleIds,
            source: {
              type: "offer",
              id: snapshot.offer.id,
            },
            plan: {
              kind:
                template.kind ||
                membership.kind,
              sessionsCount,
              duration:
                template.durationDays,
            },
          });

        /*
         * Carryover SECOND.
         */
        const carryover =
          await applyMembershipSessionCarryoverTx(
            asDbTransactionClient(tx),
            {
              userId: user.id,
              targetMembershipId:
                subscription.id,
            },
          );

        if (
          isBlockingMembershipCarryoverReason(
            carryover.reason,
          )
        ) {
          throw new OfferBoxRedeemError(
            "لا يمكن تفعيل العرض المحفوظ تلقائيًا لأن اشتراكك الحالي أو حجوزاته يحتاج إلى مراجعة قبل النقل.",
            409,
            "OFFER_BOX_CARRYOVER_REVIEW_REQUIRED",
          );
        }

        /*
         * Supersession LAST.
         */
        await tx.userMembership.updateMany({
          where: {
            userId: user.id,
            status: "active",
            id: {
              not: subscription.id,
            },
          },
          data: {
            status: "expired",
          },
        });

        /*
         * Convert reserved entitlement into a real subscriber.
         */
        if (purchase.offerId) {
          const converted =
            await tx.$executeRaw`
              UPDATE Offer
              SET
                offerBoxReservedCount =
                  offerBoxReservedCount - 1,
                currentSubscribers =
                  currentSubscribers + 1
              WHERE
                id = ${purchase.offerId}
                AND offerBoxReservedCount > 0
            `;

          if (Number(converted) !== 1) {
            throw new Error(
              "OFFER_BOX_RESERVED_COUNT_INTEGRITY_ERROR",
            );
          }
        }

        /*
         * Exact-once final claim.
         */
        const redeemed =
          await tx.$executeRaw`
            UPDATE OfferBoxPurchase
            SET
              status = 'redeemed',
              redeemedAt =
                CURRENT_TIMESTAMP(3),
              redeemedUserMembershipId =
                ${subscription.id},
              holdExpiresAt = NULL,
              updatedAt =
                CURRENT_TIMESTAMP(3)
            WHERE
              id = ${purchase.id}
              AND status = 'available'
              AND redeemedUserMembershipId
                IS NULL
          `;

        if (Number(redeemed) !== 1) {
          throw new Error(
            "OFFER_BOX_REDEEM_CLAIM_LOST",
          );
        }

        /*
         * Link the already-paid transaction to the membership
         * created from the Box right.
         */
        await tx.paymentTransaction.update({
          where: {
            id:
              purchase.paymentTransactionId,
          },
          data: {
            membershipId:
              subscription.id,
          },
        });

        return {
          alreadyRedeemed: false,
          membership: {
            id: subscription.id,
            startDate:
              subscription.startDate,
            endDate:
              subscription.endDate,
            status:
              subscription.status,
            totalSessions:
              subscription.totalSessions,
            offerId:
              subscription.offerId,
          },
          bookedSchedules:
            bookingResult.bookedSchedules,
          carryover: {
            eligible:
              carryover.eligible,
            reason:
              carryover.reason,
            carryoverSessions:
              carryover.carryoverSessions,
          },
          paymentTransactionId:
            purchase.paymentTransactionId,
          offerSnapshot:
            purchase.offerSnapshot,
        };
      },
      {
        timeout: 20000,
      },
    );

    if (!result.paymentTransactionId) {
      throw new Error(
        "OFFER_BOX_RECONCILIATION_PAYMENT_LINK_MISSING",
      );
    }

    const reconciliationPayment =
      await db.paymentTransaction.findUnique({
        where: {
          id: result.paymentTransactionId,
        },
        select: {
          id: true,
          userId: true,
          membershipId: true,
          purpose: true,
          status: true,
          amount: true,
          currency: true,
          paymentMethod: true,
          paidAt: true,
          metadata: true,
        },
      });

    if (
      !reconciliationPayment ||
      reconciliationPayment.userId !== user.id ||
      reconciliationPayment.membershipId !==
        result.membership.id ||
      reconciliationPayment.purpose !== "offer_box" ||
      reconciliationPayment.status !== "paid"
    ) {
      throw new Error(
        "OFFER_BOX_RECONCILIATION_PAYMENT_CONTRACT_MISMATCH",
      );
    }

    const reconciliationSnapshot =
      parseSnapshot(result.offerSnapshot);

    if (
      reconciliationSnapshot.version !== 1 ||
      !reconciliationSnapshot.economics ||
      reconciliationSnapshot.economics
        .attributionMode !== "direct_offer_box"
    ) {
      throw new Error(
        "OFFER_BOX_RECONCILIATION_SNAPSHOT_INVALID",
      );
    }

    if (
      Math.abs(
        Number(reconciliationPayment.amount) -
          Number(
            reconciliationSnapshot.commercial.finalPrice,
          ),
      ) > 0.001 ||
      String(reconciliationPayment.currency).toUpperCase() !==
        String(
          reconciliationSnapshot.commercial.currency,
        ).toUpperCase()
    ) {
      throw new Error(
        "OFFER_BOX_RECONCILIATION_AMOUNT_MISMATCH",
      );
    }

    await runPaidMembershipPostActivationReconciliation({
      transactionId:
        reconciliationPayment.id,
      userId:
        user.id,
      userMembershipId:
        result.membership.id,

      membershipData: {
        status:
          result.membership.status,
        startDate:
          result.membership.startDate,
        offerId:
          result.membership.offerId ?? null,

        membership: {
          name:
            reconciliationSnapshot
              .membershipTemplate.name,
          nameEn:
            reconciliationSnapshot
              .membershipTemplate.nameEn,
          duration:
            reconciliationSnapshot
              .membershipTemplate.durationDays,
          walletBonus:
            reconciliationSnapshot
              .membershipTemplate.walletBonus,
          productRewards:
            reconciliationSnapshot
              .membershipTemplate.productRewards,
        },

        /*
         * Offer may now be hidden, inactive, expired or deleted.
         * Notifications/invoice must use the immutable purchase snapshot.
         */
        offer: {
          title:
            reconciliationSnapshot.offer.title,
        },
      },

      paymentAmount:
        Number(reconciliationPayment.amount),
      paymentMethod:
        reconciliationPayment.paymentMethod ??
        "paymob",
      paidAt:
        reconciliationPayment.paidAt,
      transactionMetadata:
        reconciliationPayment.metadata,

      /*
       * Redeem transaction already converted:
       * offerBoxReservedCount - 1
       * currentSubscribers + 1
       */
      skipOfferSubscriberIncrement: true,
    });

    return NextResponse.json({
      success: true,
      alreadyRedeemed:
        result.alreadyRedeemed,
      membership:
        result.membership,
      bookedSchedules:
        result.bookedSchedules,
      carryover:
        result.carryover,
    });
  } catch (error) {
    if (
      error instanceof
      MembershipBookingPlanError
    ) {
      return NextResponse.json(
        {
          error: error.message,
          code:
            "OFFER_BOX_SCHEDULE_INVALID",
          action:
            error.action,
        },
        { status: 409 },
      );
    }

    if (
      error instanceof
      OfferBoxRedeemError
    ) {
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
      "[OFFER_BOX_REDEEM_POST]",
      error,
    );

    return NextResponse.json(
      {
        error:
          "تعذر استخدام العرض المحفوظ حاليًا.",
        code:
          "OFFER_BOX_REDEEM_FAILED",
      },
      { status: 500 },
    );
  }
}