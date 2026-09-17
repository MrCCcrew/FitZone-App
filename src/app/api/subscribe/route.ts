import {
  FITZONE_TIMEZONE,
  addCairoCalendarDays,
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

type SubscribeAction = "back_to_schedule" | "back_to_plan";
class SubscribeError extends Error {
  action?: SubscribeAction;

  constructor(message: string, action?: SubscribeAction) {
    super(message);
    this.name = "SubscribeError";
    this.action = action;
  }
}
import {
  sendSubscriptionEmail,
  sendAdminSubscriptionNotification,
} from "@/lib/email";
import {
  generateMembershipInvoicePdf,
  type MembershipInvoiceDetails,
} from "@/lib/membership-invoice";
import {
  buildAttendancePayload,
  ensureMembershipAttendancePass,
} from "@/lib/attendance";
import { generateMembershipQrCard } from "@/lib/membership-card";
import {
  createPaymentTransaction,
  restorePaymentBalanceAdjustments,
  unlockPendingReferralReward,
} from "@/lib/payments/service";
import {
  cleanupExpiredPendingMembershipsForUser,
  findReusablePendingMembershipCheckout,
  type SubscribeAttemptFingerprint,
} from "@/lib/payments/pending-membership-cleanup";
import {
  applyMembershipBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";
import { getRewardSettings, calcTier } from "@/lib/reward-settings";
import {
  postPromotionalPointsGrantJournal,
  postPromotionalWalletCreditJournal,
  postSubscriptionJournal,
} from "@/lib/accounting-service";
import { recordCheckoutStarted } from "@/lib/analytics/checkout-events";
import { recordMembershipActivatedEvent } from "@/lib/analytics/membership-events";
import { getEligibilityPolicySnapshotForSource } from "@/lib/get-eligible-classes";
import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { accrueMembershipCommissionsTx } from "@/lib/commissions/membership-commission-accrual";
import { asDbTransactionClient } from "@/lib/db";
import { buildCoachMembershipAttributionTx } from "@/lib/employees/coach-membership-attribution-service";
import { accrueCoachMembershipEarningTx } from "@/lib/employees/coach-membership-earning-service";
import {
  accrueMarketingCommissionTx,
  lockMarketingConversionForCheckoutTx,
  releaseMarketingCheckoutLock,
} from "@/lib/marketing-conversion-service";

type SubscribePayload = {
  membershipId?: string | null;
  offerId?: string | null;
  scheduleIds?: string[] | null;
  paymentMethod?: string | null;
  discountCode?: string | null;
  walletDeduct?: number | null;
  pointsDeduct?: number | null;
  trialPrice?: number | null;
  selectedMonths?: number | null; // for custom kind memberships
  startDate?: string | null; // ISO date string "YYYY-MM-DD", for featured/open-time plans
  partnerCode?: string | null; // legacy partner subscription discount code
  memberBenefitCode?: string | null; // external partner benefit code, no gym discount
  affiliateRef?: string | null; // partner affiliate link token
  agentRef?: string | null; // sales agent referral code

  // Coach Membership selection. At this stage it participates only in the
  // pending-checkout identity; attribution validation/writes are wired later.
  coachMembershipTrainerId?: string | null;
};

function sanitizeMethod(value: unknown) {
  const raw = String(value ?? "")
    .toLowerCase()
    .trim();
  if (raw === "offer") return "offer";
  if (raw === "wallet") return "wallet";
  return "paymob";
}

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as T[];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  const userId = user?.id;

  if (!userId) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أولًا قبل الاشتراك." },
      { status: 401 },
    );
  }

  const {
    membershipId,
    offerId,
    scheduleIds,
    paymentMethod,
    discountCode,
    walletDeduct,
    pointsDeduct,
    trialPrice: _ignoredClientTrialPrice,
    selectedMonths,
    startDate,
    partnerCode,
    memberBenefitCode,
    affiliateRef,
    agentRef,
    coachMembershipTrainerId,
  } = (await req.json()) as SubscribePayload;
  if (!membershipId && !offerId) {
    return NextResponse.json(
      { error: "يرجى اختيار الباقة أو العرض أولًا." },
      { status: 400 },
    );
  }

  const walletDeductAmount = Math.max(0, Number(walletDeduct ?? 0));
  const pointsDeductCount = Math.floor(Math.max(0, Number(pointsDeduct ?? 0)));

  const subscribeAttemptFingerprint: SubscribeAttemptFingerprint = {
    membershipId: membershipId ?? null,
    offerId: offerId ?? null,
    scheduleIds: [
      ...new Set(
        (scheduleIds ?? [])
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ].sort(),
    paymentMethod: sanitizeMethod(paymentMethod),
    discountCode:
      String(discountCode ?? "")
        .trim()
        .toUpperCase() || null,
    walletDeduct: walletDeductAmount,
    pointsDeduct: pointsDeductCount,
    selectedMonths: Number.isFinite(Number(selectedMonths))
      ? Number(selectedMonths)
      : null,
    startDate: String(startDate ?? "").trim() || null,
    partnerCode: String(partnerCode ?? "").trim() || null,
    memberBenefitCode: String(memberBenefitCode ?? "").trim() || null,
    affiliateRef: String(affiliateRef ?? "").trim() || null,
    agentRef: String(agentRef ?? "").trim() || null,
    coachMembershipTrainerId:
      String(coachMembershipTrainerId ?? "").trim() || null,
  };

  const userRecord = (await (db as any).user.findUnique({
    where: { id: userId },
    select: {
      emailVerified: true,
      email: true,
      name: true,
      phone: true,
      pendingPartnerRef: true,
      pendingAgentRef: true,
      pendingStaffRef: true,
      pendingTrainerRef: true,
      pendingNutritionRef: true,
    },
  })) as {
    emailVerified: Date | null;
    email: string | null;
    name: string | null;
    phone: string | null;
    pendingPartnerRef: string | null;
    pendingAgentRef: string | null;
    pendingStaffRef: string | null;
    pendingTrainerRef: string | null;
    pendingNutritionRef: string | null;
  } | null;

  if (!userRecord?.emailVerified) {
    return NextResponse.json(
      {
        error: "يجب تفعيل الحساب أولًا قبل إتمام الاشتراك.",
        needsVerification: true,
      },
      { status: 403 },
    );
  }

  const resolvedPaymentMethod = sanitizeMethod(paymentMethod);

  const rewardCfg = await getRewardSettings();

  // Validate wallet & points before transaction
  let validatedWalletDeduct = 0;
  let validatedPointsDeduct = 0;
  let pointValueEGP = rewardCfg.pointValueEGP;

  if (walletDeductAmount > 0 || pointsDeductCount > 0) {
    // Wallet/points cannot be used on trial classes without an active paid subscription.
    // The frontend may send the literal "trial-class" string OR the actual trial membership UUID.
    const resolvedKind =
      membershipId === "trial-class"
        ? "trial"
        : membershipId && !offerId
          ? await db.membership
              .findUnique({
                where: { id: membershipId },
                select: { kind: true },
              })
              .then((m) => m?.kind ?? null)
              .catch(() => null)
          : null;
    if (resolvedKind === "trial") {
      const activeMem = await db.userMembership.findFirst({
        where: { userId, status: "active" },
        select: { membership: { select: { kind: true } } },
      });
      const hasActivePaidSub =
        activeMem?.membership?.kind === "subscription" ||
        activeMem?.membership?.kind === "package";
      if (!hasActivePaidSub) {
        return NextResponse.json(
          {
            error:
              "يجب أن يكون لديك اشتراك مدفوع فعال لاستخدام رصيد المحفظة أو الفيتزونات على هذا الكلاس.",
          },
          { status: 400 },
        );
      }
    }

    const [walletRow, pointsRow] = await Promise.all([
      walletDeductAmount > 0
        ? db.wallet.findUnique({ where: { userId }, select: { balance: true } })
        : null,
      pointsDeductCount > 0
        ? db.rewardPoints.findUnique({ where: { userId } })
        : null,
    ]);

    if (walletDeductAmount > 0) {
      const balance = walletRow?.balance ?? 0;
      if (walletDeductAmount > balance) {
        return NextResponse.json(
          { error: "رصيد المحفظة غير كافٍ." },
          { status: 400 },
        );
      }
      validatedWalletDeduct = walletDeductAmount;
    }

    if (pointsDeductCount > 0) {
      const currentPoints = pointsRow?.points ?? 0;
      if (pointsDeductCount > currentPoints) {
        return NextResponse.json(
          { error: "رصيد الفيتزونات غير كافٍ." },
          { status: 400 },
        );
      }
      validatedPointsDeduct = pointsDeductCount;
    }
  }

  // Validate discount code before transaction
  let discountRecord: { id: string; type: string; value: number } | null = null;
  let trainerDiscountRecord: {
    id: string;
    discountType: string;
    discountValue: number;
    maxDiscount: number | null;
    salesAgentUserId: string | null;
  } | null = null;
  let staffDiscountRecord: {
    id: string;
    discountType: string;
    discountValue: number;
    maxDiscount: number | null;
    salesAgentUserId: string;
  } | null = null;
  if (discountCode) {
    const normalizedCode = String(discountCode).trim().toUpperCase();
    const dc = await db.discountCode.findUnique({
      where: { code: normalizedCode },
    });
    if (dc && dc.isActive) {
      if (dc.expiresAt && dc.expiresAt < new Date()) {
        return NextResponse.json(
          { error: "انتهت صلاحية كود الخصم." },
          { status: 400 },
        );
      }
      if (dc.maxUses != null && dc.usedCount >= dc.maxUses) {
        return NextResponse.json(
          { error: "تم استنفاد الحد الأقصى لهذا الكود." },
          { status: 400 },
        );
      }
      const alreadyUsed = await db.discountCodeUsage.findFirst({
        where: { discountCodeId: dc.id, userId },
      });
      if (alreadyUsed)
        return NextResponse.json(
          { error: "لقد استخدمت هذا الكود من قبل." },
          { status: 400 },
        );
      discountRecord = { id: dc.id, type: dc.type, value: dc.value };
    } else {
      // Check trainer/staff targeted discount codes
      const tdc = await db.trainerDiscountCode.findUnique({
        where: { code: normalizedCode },
        include: { trainer: { select: { userId: true } } },
      });
      if (tdc) {
        if (tdc.targetUserId !== userId)
          return NextResponse.json(
            { error: "هذا الكود خاص بعميل آخر." },
            { status: 403 },
          );
        if (tdc.isUsed)
          return NextResponse.json(
            { error: "تم استخدام هذا الكود من قبل." },
            { status: 400 },
          );
        trainerDiscountRecord = {
          id: tdc.id,
          discountType: tdc.discountType,
          discountValue: tdc.discountValue,
          maxDiscount: tdc.maxDiscount,
          salesAgentUserId: tdc.trainer.userId ?? null,
        };
      } else {
        const sdc = await db.staffDiscountCode.findUnique({
          where: { code: normalizedCode },
        });
        if (!sdc)
          return NextResponse.json(
            { error: "كود الخصم غير صالح." },
            { status: 400 },
          );
        if (sdc.targetUserId !== userId)
          return NextResponse.json(
            { error: "هذا الكود خاص بعميل آخر." },
            { status: 403 },
          );
        if (sdc.isUsed)
          return NextResponse.json(
            { error: "تم استخدام هذا الكود من قبل." },
            { status: 400 },
          );
        staffDiscountRecord = {
          id: sdc.id,
          discountType: sdc.discountType,
          discountValue: sdc.discountValue,
          maxDiscount: sdc.maxDiscount,
          salesAgentUserId: sdc.staffUserId,
        };
      }
    }
  }

  // Partner member-benefit code is for external partner stores only.
  // Gym subscription discount is applied only from affiliate links.
  let partnerCodeRecord: {
    id: string;
    partnerId: string;
    discountType: string;
    discountValue: number;
  } | null = null;
  let memberBenefitPartnerRecord: { id: string } | null = null;
  let affiliateLinkRecord: { id: string; partnerId: string } | null = null;

  if (
    memberBenefitCode &&
    !discountRecord &&
    !trainerDiscountRecord &&
    !staffDiscountRecord
  ) {
    const normalizedBenefitCode = String(memberBenefitCode)
      .trim()
      .toUpperCase();
    const partner = await db.partner.findUnique({
      where: { memberBenefitCode: normalizedBenefitCode },
      select: { id: true, isActive: true },
    });
    if (!partner || !partner.isActive) {
      return NextResponse.json(
        { error: "كود ميزة الشريك غير صالح." },
        { status: 400 },
      );
    }
    memberBenefitPartnerRecord = { id: partner.id };
  }

  if (
    partnerCode &&
    !discountRecord &&
    !trainerDiscountRecord &&
    !staffDiscountRecord
  ) {
    const normalizedPCode = String(partnerCode).trim().toUpperCase();
    const pc = await db.partnerCode.findUnique({
      where: { code: normalizedPCode },
      select: {
        id: true,
        partnerId: true,
        discountType: true,
        discountValue: true,
        isActive: true,
        expiresAt: true,
        maxUsage: true,
        usageCount: true,
      },
    });
    if (!pc || !pc.isActive) {
      return NextResponse.json(
        { error: "كود الشريك غير صالح." },
        { status: 400 },
      );
    }
    if (pc.expiresAt && pc.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "انتهت صلاحية كود الشريك." },
        { status: 400 },
      );
    }
    if (pc.maxUsage !== null && pc.usageCount >= pc.maxUsage) {
      return NextResponse.json(
        { error: "تم استنفاد الحد الأقصى لهذا الكود." },
        { status: 400 },
      );
    }
    partnerCodeRecord = {
      id: pc.id,
      partnerId: pc.partnerId,
      discountType: pc.discountType,
      discountValue: pc.discountValue,
    };
  }

  if (affiliateRef && !partnerCodeRecord) {
    const normalizedRef = String(affiliateRef).trim().toUpperCase();
    const al = await db.partnerAffiliateLink.findUnique({
      where: { token: normalizedRef },
      select: { id: true, partnerId: true, isActive: true },
    });
    if (al && al.isActive) {
      affiliateLinkRecord = { id: al.id, partnerId: al.partnerId };
      void db.partnerAffiliateLink
        .update({
          where: { id: al.id },
          data: { clickCount: { increment: 1 } },
        })
        .catch(() => null);
    }
  }

  // Fallback: use the partner ref stored at registration time if not already resolved
  if (
    !affiliateLinkRecord &&
    !partnerCodeRecord &&
    userRecord?.pendingPartnerRef
  ) {
    const al = await db.partnerAffiliateLink.findUnique({
      where: { token: userRecord.pendingPartnerRef },
      select: { id: true, partnerId: true, isActive: true },
    });
    if (al && al.isActive) {
      affiliateLinkRecord = { id: al.id, partnerId: al.partnerId };
    }
  }

  // Resolve sales agent referral (explicit param or stored at registration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbx = db as any;
  type AgentInfo = {
    id: string;
    commissionRate: number;
    commissionType: string;
    clientDiscountType: string;
    clientDiscountValue: number;
    maxClientDiscount: number | null;
    managerId: string | null;
  };
  let agentRecord: AgentInfo | null = null;
  const resolvedAgentCode = (agentRef ?? userRecord?.pendingAgentRef ?? "")
    .trim()
    .toUpperCase();
  if (resolvedAgentCode) {
    const ag = await dbx.salesAgent.findUnique({
      where: { referralCode: resolvedAgentCode },
      select: {
        id: true,
        commissionRate: true,
        commissionType: true,
        clientDiscountType: true,
        clientDiscountValue: true,
        maxClientDiscount: true,
        isActive: true,
        managerId: true,
      },
    });
    if (ag && ag.isActive) agentRecord = ag as AgentInfo;
  }

  // Resolve staff referral link (stored at registration only — one-time commission)
  type StaffLinkInfo = {
    id: string;
    userId: string;
    commissionRate: number;
    commissionType: string;
  };
  let staffLinkRecord: StaffLinkInfo | null = null;
  const pendingStaffToken = (userRecord?.pendingStaffRef ?? "")
    .trim()
    .toUpperCase();
  if (pendingStaffToken) {
    const sl = await dbx.staffReferralLink.findUnique({
      where: { token: pendingStaffToken },
      select: {
        id: true,
        userId: true,
        isActive: true,
        user: { select: { commissionRate: true, commissionType: true } },
      },
    });
    if (sl?.isActive)
      staffLinkRecord = {
        id: sl.id,
        userId: sl.userId,
        commissionRate: sl.user.commissionRate,
        commissionType: sl.user.commissionType,
      };
  }

  // Resolve trainer referral link (stored at registration only — one-time commission)
  type TrainerLinkInfo = {
    id: string;
    userId: string;
    commissionRate: number;
    commissionType: string;
  };
  let trainerLinkRecord: TrainerLinkInfo | null = null;
  const pendingTrainerToken = (userRecord?.pendingTrainerRef ?? "")
    .trim()
    .toUpperCase();
  if (pendingTrainerToken) {
    const tl = await dbx.trainerReferralLink.findUnique({
      where: { token: pendingTrainerToken },
      select: {
        id: true,
        userId: true,
        isActive: true,
        user: { select: { commissionRate: true, commissionType: true } },
      },
    });
    if (tl?.isActive)
      trainerLinkRecord = {
        id: tl.id,
        userId: tl.userId,
        commissionRate: tl.user.commissionRate,
        commissionType: tl.user.commissionType,
      };
  }

  // Resolve nutritionist referral link (stored at registration only — one-time commission)
  type NutritionLinkInfo = {
    id: string;
    userId: string;
    commissionRate: number;
    commissionType: string;
  };
  let nutritionLinkRecord: NutritionLinkInfo | null = null;
  const pendingNutritionToken = (userRecord?.pendingNutritionRef ?? "")
    .trim()
    .toUpperCase();
  if (pendingNutritionToken) {
    const nl = await dbx.nutritionReferralLink.findUnique({
      where: { token: pendingNutritionToken },
      select: {
        id: true,
        userId: true,
        isActive: true,
        user: {
          select: {
            nutritionistProfile: {
              select: { commissionRate: true, commissionType: true },
            },
          },
        },
      },
    });
    if (nl?.isActive && nl.user?.nutritionistProfile) {
      nutritionLinkRecord = {
        id: nl.id,
        userId: nl.userId,
        commissionRate: nl.user.nutritionistProfile.commissionRate,
        commissionType: nl.user.nutritionistProfile.commissionType,
      };
    }
  }

  // Remove only EXPIRED pending-payment attempts before creating a new
  // subscription attempt. This prevents stale bookings from blocking the retry.
  //
  // The shared cleanup helper is race-safe and will not touch:
  // - non-expired pending memberships
  // - memberships that already have a paid transaction
  await cleanupExpiredPendingMembershipsForUser(userId);

  /*
   * A still-valid pending checkout already owns its bookings/capacity.
   *
   * Repeating the exact same purchase must resume that checkout instead of
   * creating another UserMembership and then colliding with the customer's
   * own existing reservation.
   */
  const reusablePendingCheckout = await findReusablePendingMembershipCheckout({
    userId,
    fingerprint: subscribeAttemptFingerprint,
  });

  if (reusablePendingCheckout) {
    return NextResponse.json({
      success: true,
      subscriptionId: reusablePendingCheckout.membershipId,
      endDate: reusablePendingCheckout.endDate.toISOString(),
      checkoutUrl: reusablePendingCheckout.checkoutUrl,
      transactionId: reusablePendingCheckout.transactionId,
      resumedPending: true,
    });
  }

  const result = await db
    .$transaction(async (tx) => {
      let resolvedMembershipId = membershipId as string | undefined;
      let offerTitle: string | null = null;
      let offerTitleEn: string | null = null;
      let offerRecord: {
        id: string;
        title: string;
        titleEn: string | null;
        specialPrice: number | null;
        sessionsCount: number | null;
        durationDays: number | null;
        type: string;
        discount: number;
        description: string | null;
        descriptionEn: string | null;
        priceBefore: number | null;
        features: string | null;
        featuresEn: string | null;
        allowedClassTypes: Array<{ classType: string }>;
      } | null = null;
      let walletBonus = 0;

      if (offerId) {
        const offer = await tx.offer.findUnique({
          where: { id: offerId },
          include: { allowedClassTypes: { select: { classType: true } } },
        });
        if (!offer || !offer.isActive || offer.expiresAt <= new Date()) {
          throw new SubscribeError("العرض الخاص غير متاح الآن.");
        }
        if (offer.type !== "special") {
          throw new SubscribeError("هذا العرض غير صالح للاشتراك المباشر.");
        }
        if (
          offer.maxSubscribers != null &&
          offer.maxSubscribers > 0 &&
          offer.currentSubscribers >= offer.maxSubscribers
        ) {
          throw new SubscribeError("اكتمل عدد المشتركين في هذا العرض.");
        }

        resolvedMembershipId = offer.membershipId ?? undefined;
        if (!resolvedMembershipId) {
          const syntheticMarker = `__offer_subscription__:${offer.id}`;
          const existingSynthetic = await tx.membership.findFirst({
            where: { subtitle: syntheticMarker, isActive: false },
          });
          if (existingSynthetic) {
            resolvedMembershipId = existingSynthetic.id;
          } else {
            const syntheticMembership = await tx.membership.create({
              data: {
                name: offer.title,
                nameEn: offer.titleEn ?? offer.title,
                kind: "subscription",
                price: offer.specialPrice ?? 0,
                priceBefore: offer.specialPrice ?? 0,
                priceAfter: offer.specialPrice ?? 0,
                duration: offer.durationDays ?? 30,
                cycle: "custom",
                sessionsCount: offer.sessionsCount ?? null,
                features: JSON.stringify([
                  offer.description || "Special offer subscription",
                ]),
                featuresEn: JSON.stringify([
                  offer.descriptionEn || "Special offer subscription",
                ]),
                maxClasses: -1,
                walletBonus: 0,
                isFeatured: false,
                isActive: false,
                subtitle: syntheticMarker,
              },
            });
            resolvedMembershipId = syntheticMembership.id;
            await tx.offer.update({
              where: { id: offer.id },
              data: { membershipId: syntheticMembership.id },
            });
          }
        }
        offerTitle = offer.title;
        offerTitleEn = offer.titleEn ?? null;
        offerRecord = offer;
      }

      if (!resolvedMembershipId) {
        throw new SubscribeError("تعذر تحديد الباقة المطلوبة.");
      }

      let plan =
        resolvedMembershipId !== "trial-class"
          ? await tx.membership.findUnique({
              where: { id: resolvedMembershipId },
            })
          : null;

      if (!plan && resolvedMembershipId === "trial-class") {
        plan = await tx.membership.findFirst({ where: { kind: "trial" } });
        if (!plan) {
          plan = await tx.membership.create({
            data: {
              name: "كلاس تجريبي",
              nameEn: "Trial Class",
              kind: "trial",
              price: 0,
              duration: 1,
              sessionsCount: 1,
              features: "[]",
              maxClasses: 1,
            },
          });
        }
        resolvedMembershipId = plan.id;
      }

      if (!plan) {
        throw new SubscribeError("الباقة غير موجودة.");
      }

      // For custom kind plans, validate selectedMonths and override price/duration
      if (plan.kind === "custom") {
        const minM = (plan as any).minMonths as number | null;
        const maxM = (plan as any).maxMonths as number | null;
        const dPct = (plan as any).discountPct as number | null;
        const months = Math.floor(Number(selectedMonths ?? 0));
        if (!months || (minM && months < minM) || (maxM && months > maxM)) {
          throw new Error(
            `يرجى اختيار عدد شهور صالح (${minM ?? 1} - ${maxM ?? 12} شهور).`,
          );
        }
        const discounted = plan.price * months * (1 - (dPct ?? 0) / 100);
        (plan as any).price = Math.round(discounted * 100) / 100;
        (plan as any).duration = months * 30;
        // Scale sessions proportionally to chosen months
        const baseSessions = plan.sessionsCount as number | null;
        if (baseSessions && maxM) {
          (plan as any).sessionsCount = Math.round(
            (baseSessions / maxM) * months,
          );
        }
      }

      walletBonus = plan.walletBonus ?? 0;
      const productRewards = parseJsonArray<{
        productId: string;
        quantity: number;
      }>(plan.productRewards ?? null);

      // Starting a new checkout must never revoke an existing
      // active entitlement. Supersession happens only after the new
      // membership economically finalizes.

      // Resolve the immutable purchase terms once and use them everywhere
      // (membership dates, snapshots, booking planner and payment recovery).
      const effectiveDurationDays = offerRecord?.durationDays ?? plan.duration;

      const effectiveSessionsCount =
        offerRecord?.sessionsCount ?? plan.sessionsCount ?? null;

      const selectedScheduleIds = Array.isArray(scheduleIds)
        ? [
            ...new Set(
              scheduleIds.filter(
                (id): id is string =>
                  typeof id === "string" && id.trim() !== "",
              ),
            ),
          ]
        : [];

      /*
       * Membership booking dates are calendar-day based.
       *
       * When the customer selects schedules during checkout and did not
       * explicitly choose a start date, the entitlement starts on the
       * calendar day of the earliest selected schedule.
       *
       * Actual past-session protection remains in the booking planner.
       */
      const earliestSelectedSchedule =
        selectedScheduleIds.length > 0
          ? await tx.schedule.findFirst({
              where: { id: { in: selectedScheduleIds } },
              orderBy: { date: "asc" },
              select: { date: true },
            })
          : null;

      const resolvedStart = (() => {
        if (startDate) {
          try {
            const parsed = cairoDateStartInstant(startDate);
            const today = cairoDateStartInstant(
              cairoCalendarDateKey(new Date()),
            );
            const maxStart = addCairoCalendarDays(today, 60);

            if (parsed >= today && parsed <= maxStart) {
              return parsed;
            }
          } catch {
            // Invalid client date falls back to immediate activation below.
          }
        }

        if (earliestSelectedSchedule?.date) {
          return cairoDateStartInstant(
            cairoCalendarDateKey(new Date(earliestSelectedSchedule.date)),
          );
        }

        return new Date();
      })();

      const endDate = addCairoCalendarDays(
        resolvedStart,
        effectiveDurationDays,
      );

      /*
       * TRIAL CLASS PRICE CONTRACT
       *
       * Admin trial_classes_config is the only source of truth for:
       * - whether a Class is available as Trial Class
       * - the Trial Class price
       *
       * Never trust browser trialPrice.
       * Never fall back to Membership.price.
       */
      let resolvedBasePrice = plan.price;

      if (plan.kind === "trial") {
        if (selectedScheduleIds.length !== 1) {
          throw new SubscribeError(
            "يرجى اختيار موعد واحد للكلاس التجريبي.",
            "back_to_schedule",
          );
        }

        const selectedTrialSchedule = await tx.schedule.findUnique({
          where: {
            id: selectedScheduleIds[0],
          },
          select: {
            classId: true,
          },
        });

        if (!selectedTrialSchedule?.classId) {
          throw new SubscribeError(
            "تعذر تحديد الكلاس التجريبي المختار.",
            "back_to_schedule",
          );
        }

        const trialConfigRecord = await tx.siteContent.findUnique({
          where: {
            section: "trial_classes_config",
          },
          select: {
            content: true,
          },
        });

        let trialConfig: Record<
          string,
          {
            trialEnabled?: boolean;
            trialPrice?: number;
          }
        > | null = null;

        try {
          trialConfig = trialConfigRecord?.content
            ? JSON.parse(trialConfigRecord.content)
            : null;
        } catch {
          trialConfig = null;
        }

        const classRule = trialConfig?.[selectedTrialSchedule.classId];

        if (classRule?.trialEnabled !== true) {
          throw new SubscribeError(
            "هذا الكلاس غير مفعّل ككلاس تجريبي من الإدارة.",
            "back_to_schedule",
          );
        }

        const configuredPrice = Number(classRule.trialPrice);

        if (!Number.isFinite(configuredPrice) || configuredPrice <= 0) {
          throw new SubscribeError(
            "سعر الكلاس التجريبي غير مضبوط في الإدارة.",
            "back_to_schedule",
          );
        }

        resolvedBasePrice = configuredPrice;
      }

      const originalPrice =
        plan.priceBefore && plan.priceBefore > 0
          ? plan.priceBefore
          : resolvedBasePrice;
      const priceAfterMembershipDiscount =
        offerRecord?.specialPrice ??
        (plan.priceAfter && plan.priceAfter > 0
          ? plan.priceAfter
          : resolvedBasePrice);
      const membershipDiscountAmount = Math.max(
        0,
        originalPrice - priceAfterMembershipDiscount,
      );
      let paymentAmount = priceAfterMembershipDiscount;

      let discountApplied = 0;
      if (discountRecord && paymentAmount) {
        if (discountRecord.type === "percentage") {
          discountApplied =
            Math.round(((paymentAmount * discountRecord.value) / 100) * 100) /
            100;
        } else {
          discountApplied = Math.min(discountRecord.value, paymentAmount);
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (trainerDiscountRecord && paymentAmount) {
        if (trainerDiscountRecord.discountType === "fixed") {
          discountApplied = Math.min(
            trainerDiscountRecord.discountValue,
            paymentAmount,
          );
        } else {
          const raw =
            (paymentAmount * trainerDiscountRecord.discountValue) / 100;
          discountApplied =
            trainerDiscountRecord.maxDiscount != null
              ? Math.min(raw, trainerDiscountRecord.maxDiscount)
              : raw;
          discountApplied = Math.round(discountApplied * 100) / 100;
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (staffDiscountRecord && paymentAmount) {
        if (staffDiscountRecord.discountType === "fixed") {
          discountApplied = Math.min(
            staffDiscountRecord.discountValue,
            paymentAmount,
          );
        } else {
          const raw = (paymentAmount * staffDiscountRecord.discountValue) / 100;
          discountApplied =
            staffDiscountRecord.maxDiscount != null
              ? Math.min(raw, staffDiscountRecord.maxDiscount)
              : raw;
          discountApplied = Math.round(discountApplied * 100) / 100;
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (affiliateLinkRecord && paymentAmount) {
        // Affiliate discount: one-time total per customer across ALL eligible operations.
        // Eligible: regular subscriptions (not offers, not packages). Store checkout is deferred.
        // "Used" means payment confirmed — pending_payment memberships do NOT count.
        const isEligibleForAffilDiscount = !offerId && plan.kind !== "package";
        if (isEligibleForAffilDiscount) {
          // "Discount used" = subscription reached active/expired/cancelled (payment confirmed).
          // Known edge case: pending_payment→expired (payment failure) also counts as "used"
          // because we cannot distinguish it from natural expiry without a schema change.
          const prevAffilSubs = await tx.userMembership.count({
            where: {
              userId,
              affiliateLinkId: { not: null },
              status: { in: ["active", "expired", "cancelled"] },
            },
          });
          if (prevAffilSubs === 0) {
            const partnerDiscountConfig = await tx.partner.findUnique({
              where: { id: affiliateLinkRecord.partnerId },
              select: { referralDiscountRate: true },
            });
            const rate = partnerDiscountConfig?.referralDiscountRate ?? 0;
            if (rate > 0) {
              discountApplied =
                Math.round(((paymentAmount * rate) / 100) * 100) / 100;
              paymentAmount = Math.max(0, paymentAmount - discountApplied);
            }
          }
        }
      } else if (agentRecord && paymentAmount) {
        // Agent referral discount for the client
        if (agentRecord.clientDiscountType === "fixed") {
          discountApplied = Math.min(
            agentRecord.clientDiscountValue,
            paymentAmount,
          );
        } else {
          const raw = (paymentAmount * agentRecord.clientDiscountValue) / 100;
          discountApplied =
            agentRecord.maxClientDiscount != null
              ? Math.min(raw, agentRecord.maxClientDiscount)
              : raw;
          discountApplied = Math.round(discountApplied * 100) / 100;
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      }

      // Deduct wallet balance
      const actualWalletDeduct = Math.min(
        validatedWalletDeduct,
        paymentAmount ?? 0,
      );
      if (actualWalletDeduct > 0) {
        const wallet = await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: actualWalletDeduct } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: actualWalletDeduct,
            type: "debit",
            description: `سداد اشتراك باقة ${plan.name}`,
          },
        });
        paymentAmount = Math.max(0, (paymentAmount ?? 0) - actualWalletDeduct);
      }

      // Deduct reward points
      const pointsEGP =
        Math.round(validatedPointsDeduct * pointValueEGP * 100) / 100;
      const actualPointsEGP = Math.min(pointsEGP, paymentAmount ?? 0);
      const actualPointsDeduct =
        actualPointsEGP > 0 ? validatedPointsDeduct : 0;
      if (actualPointsDeduct > 0 && actualPointsEGP > 0) {
        const pointsRecord = await tx.rewardPoints.update({
          where: { userId },
          data: { points: { decrement: actualPointsDeduct } },
        });
        await tx.rewardHistory.create({
          data: {
            rewardId: pointsRecord.id,
            points: -actualPointsDeduct,
            reason: `استخدام فيتزونات لسداد اشتراك باقة ${plan.name}`,
          },
        });
        paymentAmount = Math.max(0, (paymentAmount ?? 0) - actualPointsEGP);
      }

      const membershipPaymentMethod = offerId ? "offer" : resolvedPaymentMethod;

      // Freeze all mutable offer terms before creating a pending payment. The
      // webhook must activate this exact record and never re-read the live offer.
      const offerSnapshot = offerRecord
        ? JSON.stringify({
            offerId: offerRecord.id,
            title: offerRecord.title,
            titleEn: offerRecord.titleEn,
            description: offerRecord.description,
            descriptionEn: offerRecord.descriptionEn,
            features: parseJsonArray<string>(offerRecord.features),
            featuresEn: parseJsonArray<string>(offerRecord.featuresEn),
            type: offerRecord.type,
            discountType: offerRecord.type,
            discountValue: offerRecord.discount,
            originalPrice,
            finalPrice: paymentAmount ?? 0,
            durationDays: effectiveDurationDays,
            sessionsCount: effectiveSessionsCount,
            allowedClassTypes: offerRecord.allowedClassTypes.map(
              (item) => item.classType,
            ),
          })
        : null;
      const allowedClassTypesSnapshot = offerRecord
        ? JSON.stringify(
            offerRecord.allowedClassTypes.map((item) => item.classType),
          )
        : null;

      const eligibilitySource = offerRecord
        ? { type: "offer" as const, id: offerRecord.id }
        : plan.kind === "trial"
          ? { type: "trial" as const, id: plan.id }
          : {
              type:
                plan.kind === "package"
                  ? ("package" as const)
                  : ("membership" as const),
              id: plan.id,
            };
      // Canonical immutable class entitlement. Freeze it for every purchase,
      // even when the customer does not select schedules during checkout.
      const purchaseEligibility = await getEligibilityPolicySnapshotForSource(
        eligibilitySource,
        tx,
      );
      const eligibilitySnapshot = JSON.stringify(purchaseEligibility);

      // Subscriptions with a remaining balance stay pending_payment until Paymob webhook confirms
      const needsPaymentConfirmation = (paymentAmount ?? 0) > 0;

      // Determine partner attribution. Member-benefit codes are stored only for
      // eligibility at the partner location; they do not discount the gym payment.
      const resolvedPartnerId =
        partnerCodeRecord?.partnerId ??
        affiliateLinkRecord?.partnerId ??
        memberBenefitPartnerRecord?.id ??
        null;
      const resolvedPartnerCodeId = partnerCodeRecord?.id ?? null;
      const resolvedAffiliateLinkId = affiliateLinkRecord?.id ?? null;
      const resolvedSalesAgentUserId =
        trainerDiscountRecord?.salesAgentUserId ??
        staffDiscountRecord?.salesAgentUserId ??
        null;
      const resolvedSalesCodeType = trainerDiscountRecord
        ? "trainer_code"
        : staffDiscountRecord
          ? "staff_code"
          : null;
      const resolvedSalesAgentId = agentRecord?.id ?? null;

      // Freeze commission economics in the SAME transaction that creates
      // UserMembership. From this point forward, mutable commission configuration
      // must never determine this purchase's eventual commission obligation.
      const commissionSnapshot = await buildMembershipCommissionSnapshotTx(
        asDbTransactionClient(tx),
        {
          partnerId: resolvedPartnerId,
          partnerCodeId: resolvedPartnerCodeId,
          affiliateLinkId: resolvedAffiliateLinkId,

          salesAgentUserId: resolvedSalesAgentUserId,
          salesAgentId: resolvedSalesAgentId,

          staffReferralLinkId: staffLinkRecord?.id ?? null,
          trainerReferralLinkId: trainerLinkRecord?.id ?? null,
          nutritionReferralLinkId: nutritionLinkRecord?.id ?? null,

          // New employee-referral classification is frozen at checkout.
          customerUserId: userId,
          staffReferralAsOfDate: new Date(),

          // Preserve existing Partner rule:
          // wallet/reward/referral deductions must not reduce Partner earnings.
          partnerCommissionBase:
            priceAfterMembershipDiscount > 0
              ? priceAfterMembershipDiscount
              : (paymentAmount ?? 0),

          // Preserve existing paidAmount semantics for every other commission
          // and SalesAgentReferral.totalSpent.
          customerPaidAmount: paymentAmount ?? 0,
        },
      );

      /*
       * Coach Membership attribution is an independent purchase-time contract.
       *
       * It must never be inferred from:
       * - TrainerReferralLink
       * - TrainerDiscountCode
       * - SalesAgent attribution
       * - mutable Trainer / Employee / compensation configuration later
       *
       * This performs NO earning/commission write.
       */
      const coachMembershipAttribution =
        await buildCoachMembershipAttributionTx(asDbTransactionClient(tx), {
          membershipId: plan.id,
          trainerId: coachMembershipTrainerId ?? null,
          purchaseAt: new Date(),
        });

      const subscription = await tx.userMembership.create({
        data: {
          userId,
          membershipId: plan.id,
          startDate: resolvedStart,
          endDate,
          status: needsPaymentConfirmation ? "pending_payment" : "active",
          activatedAt: needsPaymentConfirmation ? null : new Date(),
          pendingExpiresAt: needsPaymentConfirmation
            ? new Date(Date.now() + 60 * 60 * 1000) // 60 minutes from now
            : null,
          paymentAmount: paymentAmount ?? 0,
          paymentMethod: membershipPaymentMethod,
          offerTitle: offerTitle ?? null,
          offerId: offerRecord?.id ?? null,
          totalSessions: effectiveSessionsCount,
          eligibilitySnapshot,
          offerSnapshot,
          allowedClassTypesSnapshot,
          snapshotDurationDays: offerRecord ? effectiveDurationDays : null,
          snapshotOriginalPrice: offerRecord ? originalPrice : null,
          snapshotFinalPrice: offerRecord ? (paymentAmount ?? 0) : null,
          productRewardsUsed: productRewards.length
            ? JSON.stringify(productRewards)
            : null,

          // Immutable purchase-time commission contract.
          commissionSnapshot,

          // Independent immutable Coach Membership ownership/economics.
          coachMembershipTrainerIdSnapshot:
            coachMembershipAttribution?.trainerIdSnapshot ?? null,
          coachMembershipTrainerNameSnapshot:
            coachMembershipAttribution?.trainerNameSnapshot ?? null,
          coachMembershipEmployeeIdSnapshot:
            coachMembershipAttribution?.employeeIdSnapshot ?? null,
          coachMembershipEmployeeCodeSnapshot:
            coachMembershipAttribution?.employeeCodeSnapshot ?? null,
          coachMembershipEmployeeNameSnapshot:
            coachMembershipAttribution?.employeeNameSnapshot ?? null,
          coachMembershipCompensationTermIdSnapshot:
            coachMembershipAttribution?.coachCompensationTermIdSnapshot ?? null,

          coachMembershipCommissionSourceSnapshot:
            coachMembershipAttribution
              ?.coachMembershipCommissionSourceSnapshot ??
            null,

          coachMembershipPositionTermIdSnapshot:
            coachMembershipAttribution
              ?.coachMembershipPositionTermIdSnapshot ??
            null,

          coachMembershipPositionIdSnapshot:
            coachMembershipAttribution
              ?.coachMembershipPositionIdSnapshot ??
            null,

          coachMembershipPositionPayrollPolicyIdSnapshot:
            coachMembershipAttribution
              ?.coachMembershipPositionPayrollPolicyIdSnapshot ??
            null,
          coachMembershipCommissionBpsSnapshot:
            coachMembershipAttribution?.coachMembershipCommissionBpsSnapshot ??
            null,
          coachMembershipCurrencySnapshot:
            coachMembershipAttribution?.coachMembershipCurrencySnapshot ?? null,

          salesAgentUserId: resolvedSalesAgentUserId,
          salesCodeType: resolvedSalesCodeType,
          partnerId: resolvedPartnerId,
          partnerCodeId: resolvedPartnerCodeId,
          affiliateLinkId: resolvedAffiliateLinkId,
          ...(resolvedSalesAgentId
            ? { salesAgentId: resolvedSalesAgentId }
            : {}),
          ...(staffLinkRecord
            ? { staffReferralLinkId: staffLinkRecord.id }
            : {}),
          ...(trainerLinkRecord
            ? { trainerReferralLinkId: trainerLinkRecord.id }
            : {}),
          ...(nutritionLinkRecord
            ? { nutritionReferralLinkId: nutritionLinkRecord.id }
            : {}),
        },
      } as Parameters<typeof tx.userMembership.create>[0]);


      // Immediate/free subscriptions finalize inside this transaction.
      // Only after successful creation may they supersede an old membership.
      if (!needsPaymentConfirmation && plan.kind !== "trial") {
        await tx.userMembership.updateMany({
          where: {
            userId,
            status: "active",
            id: { not: subscription.id },
          },
          data: { status: "expired" },
        });
      }

      // Freeze marketing closer attribution independently from referral attribution.
      await lockMarketingConversionForCheckoutTx(asDbTransactionClient(tx), {
        customerId: userId,
        userMembershipId: subscription.id,

        // Preserve the same paid-amount basis currently used for non-partner
        // membership commissions.
        commissionBase: paymentAmount ?? 0,
      });

      // Increment partner code usage
      if (resolvedPartnerCodeId) {
        await tx.partnerCode.update({
          where: { id: resolvedPartnerCodeId },
          data: { usageCount: { increment: 1 } },
        });
      }

      /*
       * SalesAgentReferral attribution is captured at checkout even while Paymob
       * is pending. This is NOT an earned commission:
       *
       * - convertedAt stays null
       * - totalSpent stays 0
       *
       * The authoritative accrual service owns conversion + spend tracking once
       * the membership economically finalizes.
       */
      if (resolvedSalesAgentId) {
        const existingReferral = await tx.salesAgentReferral.findUnique({
          where: { userId },
          select: { id: true },
        });

        if (!existingReferral) {
          await tx.salesAgentReferral.create({
            data: {
              agentId: resolvedSalesAgentId,
              userId,
              convertedAt: null,
              totalSpent: 0,
            },
          });
        }
      }

      /*
       * Immediate/free/wallet subscriptions economically finalize inside this
       * transaction, so ALL membership commission accrual happens here through
       * one authoritative service.
       *
       * Pending Paymob memberships do NOT accrue until payment reconciliation.
       */
      if (!needsPaymentConfirmation) {
        await accrueMembershipCommissionsTx(
          asDbTransactionClient(tx),
          subscription.id,
        );

        await accrueMarketingCommissionTx(
          asDbTransactionClient(tx),
          subscription.id,
        );

        /*
         * Independent Coach Membership earning.
         *
         * Immediate economic finalization has no external payment:
         * consideration is the wallet + reward-points value redeemed
         * after commercial discounts.
         */
        await accrueCoachMembershipEarningTx(asDbTransactionClient(tx), {
          userMembershipId: subscription.id,
          finalizedAt: subscription.activatedAt ?? new Date(),
          consideration: {
            externalPaidAmount: 0,
            walletAmount: actualWalletDeduct,
            pointsAmount: actualPointsEGP,
          },
        });
      }

      // Only deduct product rewards immediately if payment is not pending confirmation
      if (!needsPaymentConfirmation && productRewards.length > 0) {
        for (const reward of productRewards) {
          if (!reward?.productId || !reward?.quantity) continue;
          const product = await tx.product.findUnique({
            where: { id: reward.productId },
          });
          if (!product) {
            throw new SubscribeError("أحد المنتجات المضافة في الباقة غير موجود.");
          }
          if (product.trackInventory && product.stock < reward.quantity) {
            throw new SubscribeError(`المخزون غير كاف للمنتج: ${product.name}.`);
          }
          const updated = await tx.product.update({
            where: { id: reward.productId },
            data: product.trackInventory
              ? { stock: { decrement: reward.quantity } }
              : {},
          });
          await tx.inventoryMovement.create({
            data: {
              productId: updated.id,
              type: "package_consumption",
              quantityChange: -Math.abs(reward.quantity),
              quantityBefore: product.stock,
              quantityAfter: product.trackInventory
                ? product.stock - reward.quantity
                : product.stock,
              unitCost: product.averageCost,
              averageCostBefore: product.averageCost,
              averageCostAfter: product.averageCost,
              referenceType: "membership",
              referenceId: subscription.id,
              notes: `Package: ${plan.name}`,
            },
          });
        }
      }

      let bookedSchedules: {
        date: Date;
        time: string;
        className: string;
        trainerName: string;
      }[] = [];

      if (selectedScheduleIds.length > 0) {
        const bookingResult = await applyMembershipBookingPlanTx({
          tx,
          userId,
          userMembershipId: subscription.id,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          selectedScheduleIds,
          source: eligibilitySource,
          plan: {
            kind: plan.kind,
            sessionsCount: effectiveSessionsCount,
            duration: effectiveDurationDays,
          },
        });

        bookedSchedules = bookingResult.bookedSchedules;
      }

      // Only increment offer subscribers if payment is not pending confirmation
      if (!needsPaymentConfirmation && offerId) {
        await tx.offer.update({
          where: { id: offerId },
          data: { currentSubscribers: { increment: 1 } },
        });
      }

      // Record discount code usage
      if (discountRecord && discountApplied > 0) {
        await tx.discountCodeUsage.create({
          data: {
            discountCodeId: discountRecord.id,
            userId,
            membershipId: subscription.id,
            discountAmount: discountApplied,
          },
        });
        await tx.discountCode.update({
          where: { id: discountRecord.id },
          data: { usedCount: { increment: 1 } },
        });
      }
      // Mark trainer discount code as used
      if (trainerDiscountRecord && discountApplied > 0) {
        await tx.trainerDiscountCode.update({
          where: { id: trainerDiscountRecord.id },
          data: { isUsed: true, usedAt: new Date() },
        });
      }
      if (staffDiscountRecord && discountApplied > 0) {
        await tx.staffDiscountCode.update({
          where: { id: staffDiscountRecord.id },
          data: { isUsed: true, usedAt: new Date() },
        });
      }

      // Only give wallet bonus if payment is not pending confirmation
      if (!needsPaymentConfirmation && walletBonus > 0) {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          update: { balance: { increment: walletBonus } },
          create: { userId, balance: walletBonus },
        });

        const walletBonusTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: walletBonus,
            type: "credit",
            description: offerTitle
              ? `مكافأة الاشتراك في ${offerTitle}`
              : `مكافأة الاشتراك في باقة ${plan.name}`,
          },
        });

        await postPromotionalWalletCreditJournal(
          tx,
          walletBonusTransaction.id,
          walletBonus,
        );
      }

      // Grant subscription points immediately for non-pending-payment subscriptions
      if (!needsPaymentConfirmation && rewardCfg.pointsPerSubscription > 0) {
        const rp = await tx.rewardPoints.findUnique({ where: { userId } });
        if (rp) {
          const newPts = rp.points + rewardCfg.pointsPerSubscription;
          await tx.rewardPoints.update({
            where: { id: rp.id },
            data: {
              points: { increment: rewardCfg.pointsPerSubscription },
              tier: calcTier(newPts, rewardCfg.tierThresholds),
            },
          });
          const subscriptionRewardHistory = await tx.rewardHistory.create({
            data: {
              rewardId: rp.id,
              points: rewardCfg.pointsPerSubscription,
              reason: "membership_purchase",
            },
          });

          const subscriptionPointsPromotionAmount =
            Math.round(
              rewardCfg.pointsPerSubscription *
                Number(rewardCfg.pointValueEGP ?? 0) *
                100,
            ) / 100;

          await postPromotionalPointsGrantJournal(
            tx,
            subscriptionRewardHistory.id,
            subscriptionPointsPromotionAmount,
          );
        }
      }

      // ── Immediate subscription revenue GL ────────────────────────────────
      //
      // Only post here when no external payment confirmation is required.
      // Pending Paymob subscriptions are posted later by paid reconciliation.
      if (!needsPaymentConfirmation) {
        await postSubscriptionJournal(tx, subscription.id, {
          externalPaidAmount: 0,
          walletAmount: actualWalletDeduct,
          pointsAmount: actualPointsEGP,
          externalPaymentAccount: "paymob",
        });
      }

      await tx.notification.create({
        data: {
          userId,
          title: needsPaymentConfirmation
            ? `أكملي عملية الدفع للاشتراك في ${offerTitle ?? plan.name}`
            : offerTitle
              ? `تم الاشتراك في ${offerTitle}!`
              : `تم الاشتراك في باقة ${plan.name}!`,
          body: needsPaymentConfirmation
            ? `سيتم تفعيل اشتراكك تلقائياً فور تأكيد الدفع عبر Paymob.`
            : offerTitle
              ? `اشتراكك في العرض الخاص أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG", { timeZone: FITZONE_TIMEZONE })}.`
              : `اشتراكك أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG", { timeZone: FITZONE_TIMEZONE })}.`,
          type: needsPaymentConfirmation ? "info" : "success",
        },
      });

      return {
        subscriptionId: subscription.id,
        planName: plan.name,
        planNameEn: plan.nameEn ?? null,
        startDate: resolvedStart,
        endDate,
        walletBonus,
        offerTitle,
        offerTitleEn,
        bookedSchedules,
        paymentAmount,
        membershipPaymentMethod,
        discountApplied,
        needsPaymentConfirmation,
        originalPrice,
        membershipDiscountAmount,
        priceAfterMembershipDiscount,
        actualWalletDeduct,
        actualPointsDeduct,
        actualPointsEGP,
        discountCode:
          discountRecord && discountApplied > 0
            ? String(discountCode ?? "")
                .trim()
                .toUpperCase()
            : null,
        planId: plan.id,
        planKind: plan.kind,
        offerId,
      };
    })
    .catch((error: unknown) => {
      if (error instanceof SubscribeError) {
        return {
          error: error.message,
          action: error.action,
        };
      }

      if (error instanceof MembershipBookingPlanError) {
        return {
          error: error.message,
          action: error.action,
        };
      }

      console.error("[SUBSCRIBE_TRANSACTION_INTERNAL]", error);

      return {
        error:
          "تعذر إتمام الاشتراك حاليًا. لم يتم تأكيد الاشتراك أو خصم أي مبلغ. يرجى المحاولة مرة أخرى أو التواصل مع الإدارة.",
        action: undefined,
      };
    });

  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, action: result.action },
      { status: 400 },
    );
  }

  // Unlock pending referral reward when subscription is immediately active
  if (!result.needsPaymentConfirmation) {
    void recordMembershipActivatedEvent(result.subscriptionId).catch(
      () => null,
    );
    try {
      await unlockPendingReferralReward(userId);
    } catch {}
    try {
      await ensureMembershipAttendancePass(result.subscriptionId);
    } catch {}
  }

  /*
   * Pending referral attribution is consumed atomically by the authoritative
   * commission accrual service only when the frozen snapshot matches.
   */

  let checkoutUrl: string | null = null;
  let transactionId: string | null = null;
  const invoiceDetails: MembershipInvoiceDetails = {
    invoiceNumber: `MBR-${result.subscriptionId.slice(-8).toUpperCase()}`,
    customerName: userRecord.name ?? "FitZone Member",
    customerEmail: userRecord.email ?? "",
    membershipName: result.planName,
    membershipNameEn: result.planNameEn,
    offerTitle: result.offerTitle ?? null,
    offerTitleEn: result.offerTitleEn ?? null,
    paymentMethod: result.membershipPaymentMethod,
    originalPrice: result.originalPrice,
    membershipDiscount: result.membershipDiscountAmount,
    discountCodeAmount: result.discountApplied,
    discountCode: result.discountCode,
    walletDeduct: result.actualWalletDeduct,
    pointsDeduct: result.actualPointsEGP,
    finalAmount: result.paymentAmount,
    startDate: result.startDate,
    endDate: result.endDate,
    issuedAt: new Date(),
  };
  if (result.paymentAmount > 0) {
    try {
      const transaction = await createPaymentTransaction({
        userId,
        provider: "paymob",
        purpose: "membership",
        businessUnit: "club",
        amount: result.paymentAmount,
        paymentMethod: result.membershipPaymentMethod,
        membershipId: result.subscriptionId,
        description: `Membership ${result.planName}`,
        customer: {
          name: userRecord?.name ?? null,
          email: userRecord?.email ?? null,
          phone:
            result.membershipPaymentMethod === "wallet"
              ? (userRecord?.phone ?? null)
              : null,
        },
        metadata: {
          subscribeAttemptFingerprint,
          paymentAdjustments: {
            walletAmount: result.actualWalletDeduct,
            pointsCount: result.actualPointsDeduct,
            pointsAmount: result.actualPointsEGP,
          },
          walletDeductedAmount: result.actualWalletDeduct,
          pointsDeductedCount: result.actualPointsDeduct,
          membershipInvoice: {
            ...invoiceDetails,
            startDate: invoiceDetails.startDate?.toISOString() ?? null,
            endDate: invoiceDetails.endDate.toISOString(),
            issuedAt: invoiceDetails.issuedAt?.toISOString() ?? null,
          },
          // Recovery data: preserve user's original schedule selection for late-payment booking recovery
          bookingRecoveryData:
            scheduleIds && scheduleIds.length > 0
              ? {
                  selectedScheduleIds: scheduleIds,
                  createdAt: new Date().toISOString(),
                }
              : undefined,
        },
      });
      checkoutUrl = transaction.checkoutUrl ?? null;
      transactionId = transaction.id;
      if (result.planId) {
        const entityType = result.offerId
          ? "offer"
          : result.planKind === "package"
            ? "package"
            : "subscription";
        void recordCheckoutStarted({
          userId,
          entityType,
          entityId: result.offerId ?? result.planId,
          entityName: result.offerTitle ?? result.planName,
          value: result.paymentAmount,
          currency: "EGP",
          source: result.offerId
            ? "offer_checkout"
            : result.planKind === "package"
              ? "package_checkout"
              : "membership_checkout",
          paymentTransactionId: transaction.id,
        });
      }
    } catch (error) {
      console.error("[SUBSCRIBE_PAYMENT_INIT]", error);

      // Checkout never became usable, so do not leave the marketing lead
      // locked for the full pending timeout.
      await releaseMarketingCheckoutLock({
        userMembershipId: result.subscriptionId,
      }).catch((marketingReleaseError) => {
        console.error(
          "[SUBSCRIBE_MARKETING_LOCK_RELEASE]",
          marketingReleaseError,
        );
      });

      await restorePaymentBalanceAdjustments({
        userId,
        walletAmount: result.actualWalletDeduct,
        pointsCount: result.actualPointsDeduct,
        reference: result.subscriptionId,
      }).catch((restoreError) => {
        console.error("[SUBSCRIBE_PAYMENT_RESTORE]", restoreError);
      });
      return NextResponse.json(
        {
          error:
            "تعذر تهيئة صفحة الدفع الإلكترونية حاليًا. لم يتم تأكيد عملية الدفع. يرجى المحاولة مرة أخرى.",
        },
        { status: 502 },
      );
    }
  }

  if (userRecord.email && !result.needsPaymentConfirmation) {
    // All post-transaction work is non-critical — a failure here must never
    // surface as a 500 after the subscription and wallet deduction already committed.
    try {
      const invoicePdf = await generateMembershipInvoicePdf(invoiceDetails);
      let membershipCard = null;
      try {
        const pass = await ensureMembershipAttendancePass(
          result.subscriptionId,
        );
        if (pass) {
          membershipCard = await generateMembershipQrCard({
            memberName: userRecord.name ?? "FitZone Member",
            membershipName: result.planName,
            membershipNameEn: result.planNameEn,
            offerTitle: result.offerTitle ?? null,
            endDate: result.endDate,
            qrPayload: buildAttendancePayload(pass.code),
            cardCode: pass.code,
          });
        }
      } catch (error) {
        console.error("[SUBSCRIBE_MEMBERSHIP_CARD]", error);
      }
      void sendSubscriptionEmail(
        userRecord.email,
        userRecord.name ?? "العضوة",
        result.offerTitle ?? result.planName,
        result.endDate,
        result.walletBonus,
        result.bookedSchedules ?? [],
        {
          details: invoiceDetails,
          filename: `fitzone-membership-invoice-${invoiceDetails.invoiceNumber}.pdf`,
          content: invoicePdf,
        },
        membershipCard,
      ).catch((error) => console.error("[SUBSCRIBE_EMAIL]", error));
      void sendAdminSubscriptionNotification({
        customerName: userRecord.name ?? "—",
        customerEmail: userRecord.email,
        planName: result.planName,
        offerTitle: result.offerTitle,
        endDate: result.endDate,
        amount: result.paymentAmount,
        paymentMethod: result.membershipPaymentMethod,
        invoiceNumber: invoiceDetails.invoiceNumber,
      }).catch((error) => console.error("[SUBSCRIBE_ADMIN_EMAIL]", error));
    } catch (error) {
      console.error("[SUBSCRIBE_POST_COMMIT]", error);
    }
  }

  // ── Immediate notification for pending_payment subscriptions ─────────────
  // The expiry is always read from pendingExpiresAt; new pending payments last 60 minutes.
  if (result.paymentAmount > 0 && checkoutUrl) {
    try {
      await db.notification.create({
        data: {
          userId,
          title: "⏳ أكملي الدفع لتفعيل اشتراكك",
          body: `اشتراكك في "${result.planName}" في انتظار إتمام الدفع وسيُلغى تلقائيًا بعد 60 دقيقة إذا لم يكتمل الدفع.`,
          type: "warning",
        },
      });
    } catch (err) {
      console.error("[SUBSCRIBE_PENDING_NOTIF]", err);
    }
  }

  return NextResponse.json({
    success: true,
    subscriptionId: result.subscriptionId,
    endDate: result.endDate.toISOString(),
    checkoutUrl,
    transactionId,
  });
}
