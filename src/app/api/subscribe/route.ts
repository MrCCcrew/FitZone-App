import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { sendSubscriptionEmail } from "@/lib/email";
import { generateMembershipInvoicePdf, type MembershipInvoiceDetails } from "@/lib/membership-invoice";
import { buildAttendancePayload, ensureMembershipAttendancePass } from "@/lib/attendance";
import { generateMembershipQrCard } from "@/lib/membership-card";
import {
  createPaymentTransaction,
  restorePaymentBalanceAdjustments,
  unlockPendingReferralReward,
} from "@/lib/payments/service";

type SubscribePayload = {
  membershipId?: string | null;
  offerId?: string | null;
  scheduleIds?: string[] | null;
  paymentMethod?: string | null;
  discountCode?: string | null;
  walletDeduct?: number | null;
  pointsDeduct?: number | null;
  trialPrice?: number | null;
  startDate?: string | null; // ISO date string "YYYY-MM-DD", for featured/open-time plans
  partnerCode?: string | null;   // legacy partner subscription discount code
  memberBenefitCode?: string | null; // external partner benefit code, no gym discount
  affiliateRef?: string | null;  // partner affiliate link token
};

function sanitizeMethod(value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
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
    return NextResponse.json({ error: "يجب تسجيل الدخول أولًا قبل الاشتراك." }, { status: 401 });
  }

  const {
    membershipId,
    offerId,
    scheduleIds,
    paymentMethod,
    discountCode,
    walletDeduct,
    pointsDeduct,
    trialPrice,
    startDate,
    partnerCode,
    memberBenefitCode,
    affiliateRef,
  } = (await req.json()) as SubscribePayload;
  if (!membershipId && !offerId) {
    return NextResponse.json({ error: "يرجى اختيار الباقة أو العرض أولًا." }, { status: 400 });
  }

  const walletDeductAmount = Math.max(0, Number(walletDeduct ?? 0));
  const pointsDeductCount = Math.floor(Math.max(0, Number(pointsDeduct ?? 0)));

  const userRecord = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, email: true, name: true, phone: true, pendingPartnerRef: true },
  });

  if (!userRecord?.emailVerified) {
    return NextResponse.json(
      { error: "يجب تفعيل الحساب أولًا قبل إتمام الاشتراك.", needsVerification: true },
      { status: 403 },
    );
  }

  const resolvedPaymentMethod = sanitizeMethod(paymentMethod);

  // Validate wallet & points before transaction
  let validatedWalletDeduct = 0;
  let validatedPointsDeduct = 0;
  let pointValueEGP = 0.1;

  if (walletDeductAmount > 0 || pointsDeductCount > 0) {
    const [walletRow, pointsRow, rewardSettings] = await Promise.all([
      walletDeductAmount > 0 ? db.wallet.findUnique({ where: { userId }, select: { balance: true } }) : null,
      pointsDeductCount > 0 ? db.rewardPoints.findUnique({ where: { userId } }) : null,
      db.siteContent.findUnique({ where: { section: "reward_settings" } }),
    ]);

    if (rewardSettings?.content) {
      try {
        const s = JSON.parse(rewardSettings.content) as { pointValueEGP?: number };
        if (typeof s.pointValueEGP === "number") pointValueEGP = s.pointValueEGP;
      } catch {}
    }

    if (walletDeductAmount > 0) {
      const balance = walletRow?.balance ?? 0;
      if (walletDeductAmount > balance) {
        return NextResponse.json({ error: "رصيد المحفظة غير كافٍ." }, { status: 400 });
      }
      validatedWalletDeduct = walletDeductAmount;
    }

    if (pointsDeductCount > 0) {
      const currentPoints = pointsRow?.points ?? 0;
      if (pointsDeductCount > currentPoints) {
        return NextResponse.json({ error: "رصيد النقاط غير كافٍ." }, { status: 400 });
      }
      validatedPointsDeduct = pointsDeductCount;
    }
  }

  // Validate discount code before transaction
  let discountRecord: { id: string; type: string; value: number } | null = null;
  let trainerDiscountRecord: { id: string; discountType: string; discountValue: number; maxDiscount: number | null; salesAgentUserId: string | null } | null = null;
  let staffDiscountRecord: { id: string; discountType: string; discountValue: number; maxDiscount: number | null; salesAgentUserId: string } | null = null;
  if (discountCode) {
    const normalizedCode = String(discountCode).trim().toUpperCase();
    const dc = await db.discountCode.findUnique({ where: { code: normalizedCode } });
    if (dc && dc.isActive) {
      if (dc.expiresAt && dc.expiresAt < new Date()) {
        return NextResponse.json({ error: "انتهت صلاحية كود الخصم." }, { status: 400 });
      }
      if (dc.maxUses != null && dc.usedCount >= dc.maxUses) {
        return NextResponse.json({ error: "تم استنفاد الحد الأقصى لهذا الكود." }, { status: 400 });
      }
      const alreadyUsed = await db.discountCodeUsage.findFirst({ where: { discountCodeId: dc.id, userId } });
      if (alreadyUsed) return NextResponse.json({ error: "لقد استخدمت هذا الكود من قبل." }, { status: 400 });
      discountRecord = { id: dc.id, type: dc.type, value: dc.value };
    } else {
      // Check trainer/staff targeted discount codes
      const tdc = await db.trainerDiscountCode.findUnique({
        where: { code: normalizedCode },
        include: { trainer: { select: { userId: true } } },
      });
      if (tdc) {
        if (tdc.targetUserId !== userId) return NextResponse.json({ error: "هذا الكود خاص بعميل آخر." }, { status: 403 });
        if (tdc.isUsed) return NextResponse.json({ error: "تم استخدام هذا الكود من قبل." }, { status: 400 });
        trainerDiscountRecord = {
          id: tdc.id,
          discountType: tdc.discountType,
          discountValue: tdc.discountValue,
          maxDiscount: tdc.maxDiscount,
          salesAgentUserId: tdc.trainer.userId ?? null,
        };
      } else {
        const sdc = await db.staffDiscountCode.findUnique({ where: { code: normalizedCode } });
        if (!sdc) return NextResponse.json({ error: "كود الخصم غير صالح." }, { status: 400 });
        if (sdc.targetUserId !== userId) return NextResponse.json({ error: "هذا الكود خاص بعميل آخر." }, { status: 403 });
        if (sdc.isUsed) return NextResponse.json({ error: "تم استخدام هذا الكود من قبل." }, { status: 400 });
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
  let partnerCodeRecord: { id: string; partnerId: string; discountType: string; discountValue: number } | null = null;
  let memberBenefitPartnerRecord: { id: string } | null = null;
  let affiliateLinkRecord: { id: string; partnerId: string } | null = null;

  if (memberBenefitCode && !discountRecord && !trainerDiscountRecord && !staffDiscountRecord) {
    const normalizedBenefitCode = String(memberBenefitCode).trim().toUpperCase();
    const partner = await db.partner.findUnique({
      where: { memberBenefitCode: normalizedBenefitCode },
      select: { id: true, isActive: true },
    });
    if (!partner || !partner.isActive) {
      return NextResponse.json({ error: "كود ميزة الشريك غير صالح." }, { status: 400 });
    }
    memberBenefitPartnerRecord = { id: partner.id };
  }

  if (partnerCode && !discountRecord && !trainerDiscountRecord && !staffDiscountRecord) {
    const normalizedPCode = String(partnerCode).trim().toUpperCase();
    const pc = await db.partnerCode.findUnique({
      where: { code: normalizedPCode },
      select: { id: true, partnerId: true, discountType: true, discountValue: true, isActive: true, expiresAt: true, maxUsage: true, usageCount: true },
    });
    if (!pc || !pc.isActive) {
      return NextResponse.json({ error: "كود الشريك غير صالح." }, { status: 400 });
    }
    if (pc.expiresAt && pc.expiresAt < new Date()) {
      return NextResponse.json({ error: "انتهت صلاحية كود الشريك." }, { status: 400 });
    }
    if (pc.maxUsage !== null && pc.usageCount >= pc.maxUsage) {
      return NextResponse.json({ error: "تم استنفاد الحد الأقصى لهذا الكود." }, { status: 400 });
    }
    partnerCodeRecord = { id: pc.id, partnerId: pc.partnerId, discountType: pc.discountType, discountValue: pc.discountValue };
  }

  if (affiliateRef && !partnerCodeRecord) {
    const normalizedRef = String(affiliateRef).trim().toUpperCase();
    const al = await db.partnerAffiliateLink.findUnique({
      where: { token: normalizedRef },
      select: { id: true, partnerId: true, isActive: true },
    });
    if (al && al.isActive) {
      affiliateLinkRecord = { id: al.id, partnerId: al.partnerId };
      void db.partnerAffiliateLink.update({ where: { id: al.id }, data: { clickCount: { increment: 1 } } }).catch(() => null);
    }
  }

  // Fallback: use the partner ref stored at registration time if not already resolved
  if (!affiliateLinkRecord && !partnerCodeRecord && userRecord?.pendingPartnerRef) {
    const al = await db.partnerAffiliateLink.findUnique({
      where: { token: userRecord.pendingPartnerRef },
      select: { id: true, partnerId: true, isActive: true },
    });
    if (al && al.isActive) {
      affiliateLinkRecord = { id: al.id, partnerId: al.partnerId };
    }
  }

  const result = await db
    .$transaction(async (tx) => {
      let resolvedMembershipId = membershipId as string | undefined;
      let offerTitle: string | null = null;
      let offerTitleEn: string | null = null;
      let offerRecord: { id: string; title: string; titleEn: string | null; specialPrice: number | null } | null = null;
      let walletBonus = 0;

      if (offerId) {
        const offer = await tx.offer.findUnique({ where: { id: offerId } });
        if (!offer || !offer.isActive || offer.expiresAt <= new Date()) {
          throw new Error("العرض الخاص غير متاح الآن.");
        }
        if (offer.type !== "special") {
          throw new Error("هذا العرض غير صالح للاشتراك المباشر.");
        }
        if (offer.maxSubscribers != null && offer.maxSubscribers > 0 && offer.currentSubscribers >= offer.maxSubscribers) {
          throw new Error("اكتمل عدد المشتركين في هذا العرض.");
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
                duration: 30,
                cycle: "custom",
                sessionsCount: null,
                features: JSON.stringify([offer.description || "Special offer subscription"]),
                featuresEn: JSON.stringify([offer.descriptionEn || "Special offer subscription"]),
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
        offerRecord = { id: offer.id, title: offer.title, titleEn: offer.titleEn ?? null, specialPrice: offer.specialPrice ?? null };
      }

      if (!resolvedMembershipId) {
        throw new Error("تعذر تحديد الباقة المطلوبة.");
      }

      let plan = resolvedMembershipId !== "trial-class"
        ? await tx.membership.findUnique({ where: { id: resolvedMembershipId } })
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
        throw new Error("الباقة غير موجودة.");
      }

      walletBonus = plan.walletBonus ?? 0;
      const productRewards = parseJsonArray<{ productId: string; quantity: number }>(plan.productRewards ?? null);

      await tx.userMembership.updateMany({
        where: { userId, status: "active" },
        data: { status: "expired" },
      });

      const resolvedStart = (() => {
        if (startDate) {
          const parsed = new Date(startDate + "T00:00:00");
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const maxStart = new Date(today); maxStart.setDate(maxStart.getDate() + 60);
          if (!isNaN(parsed.getTime()) && parsed >= today && parsed <= maxStart) return parsed;
        }
        return new Date();
      })();
      const endDate = new Date(resolvedStart);
      endDate.setDate(endDate.getDate() + plan.duration);

      // For trial memberships the client sends the per-class-type price (yoga=100, other=50).
      // Accept it only when it's >= the DB base price to prevent under-charging.
      const resolvedBasePrice =
        plan.kind === "trial" && trialPrice != null && trialPrice > 0 && trialPrice >= plan.price
          ? trialPrice
          : plan.price;
      const originalPrice = plan.priceBefore && plan.priceBefore > 0 ? plan.priceBefore : resolvedBasePrice;
      const priceAfterMembershipDiscount =
        offerRecord?.specialPrice ?? (plan.priceAfter && plan.priceAfter > 0 ? plan.priceAfter : resolvedBasePrice);
      const membershipDiscountAmount = Math.max(0, originalPrice - priceAfterMembershipDiscount);
      let paymentAmount = priceAfterMembershipDiscount;

      let discountApplied = 0;
      if (discountRecord && paymentAmount) {
        if (discountRecord.type === "percentage") {
          discountApplied = Math.round((paymentAmount * discountRecord.value) / 100 * 100) / 100;
        } else {
          discountApplied = Math.min(discountRecord.value, paymentAmount);
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (trainerDiscountRecord && paymentAmount) {
        if (trainerDiscountRecord.discountType === "fixed") {
          discountApplied = Math.min(trainerDiscountRecord.discountValue, paymentAmount);
        } else {
          const raw = (paymentAmount * trainerDiscountRecord.discountValue) / 100;
          discountApplied = trainerDiscountRecord.maxDiscount != null ? Math.min(raw, trainerDiscountRecord.maxDiscount) : raw;
          discountApplied = Math.round(discountApplied * 100) / 100;
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (staffDiscountRecord && paymentAmount) {
        if (staffDiscountRecord.discountType === "fixed") {
          discountApplied = Math.min(staffDiscountRecord.discountValue, paymentAmount);
        } else {
          const raw = (paymentAmount * staffDiscountRecord.discountValue) / 100;
          discountApplied = staffDiscountRecord.maxDiscount != null ? Math.min(raw, staffDiscountRecord.maxDiscount) : raw;
          discountApplied = Math.round(discountApplied * 100) / 100;
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      } else if (affiliateLinkRecord && paymentAmount) {
        const partnerDiscountConfig = await tx.partner.findUnique({
          where: { id: affiliateLinkRecord.partnerId },
          select: { referralDiscountRate: true },
        });
        const rate = partnerDiscountConfig?.referralDiscountRate ?? 0;
        if (rate > 0) {
          discountApplied = Math.round((paymentAmount * rate) / 100 * 100) / 100;
          paymentAmount = Math.max(0, paymentAmount - discountApplied);
        }
      }

      // Deduct wallet balance
      const actualWalletDeduct = Math.min(validatedWalletDeduct, paymentAmount ?? 0);
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
      const pointsEGP = Math.round(validatedPointsDeduct * pointValueEGP * 100) / 100;
      const actualPointsEGP = Math.min(pointsEGP, paymentAmount ?? 0);
      const actualPointsDeduct = actualPointsEGP > 0 ? validatedPointsDeduct : 0;
      if (actualPointsDeduct > 0 && actualPointsEGP > 0) {
        const pointsRecord = await tx.rewardPoints.update({
          where: { userId },
          data: { points: { decrement: actualPointsDeduct } },
        });
        await tx.rewardHistory.create({
          data: {
            rewardId: pointsRecord.id,
            points: -actualPointsDeduct,
            reason: `استخدام نقاط لسداد اشتراك باقة ${plan.name}`,
          },
        });
        paymentAmount = Math.max(0, (paymentAmount ?? 0) - actualPointsEGP);
      }

      const membershipPaymentMethod = offerId ? "offer" : resolvedPaymentMethod;

      // Subscriptions with a remaining balance stay pending_payment until Paymob webhook confirms
      const needsPaymentConfirmation = (paymentAmount ?? 0) > 0;

      // Determine partner attribution. Member-benefit codes are stored only for
      // eligibility at the partner location; they do not discount the gym payment.
      const resolvedPartnerId = partnerCodeRecord?.partnerId ?? affiliateLinkRecord?.partnerId ?? memberBenefitPartnerRecord?.id ?? null;
      const resolvedPartnerCodeId = partnerCodeRecord?.id ?? null;
      const resolvedAffiliateLinkId = affiliateLinkRecord?.id ?? null;
      const resolvedSalesAgentUserId = trainerDiscountRecord?.salesAgentUserId ?? staffDiscountRecord?.salesAgentUserId ?? null;
      const resolvedSalesCodeType = trainerDiscountRecord ? "trainer_code" : staffDiscountRecord ? "staff_code" : null;

      const subscription = await tx.userMembership.create({
        data: {
          userId,
          membershipId: plan.id,
          startDate: resolvedStart,
          endDate,
          status: needsPaymentConfirmation ? "pending_payment" : "active",
          paymentAmount: paymentAmount ?? 0,
          paymentMethod: membershipPaymentMethod,
          offerTitle: offerTitle ?? null,
          offerId: offerRecord?.id ?? null,
          totalSessions: plan.sessionsCount ?? null,
          productRewardsUsed: productRewards.length ? JSON.stringify(productRewards) : null,
          salesAgentUserId: resolvedSalesAgentUserId,
          salesCodeType: resolvedSalesCodeType,
          partnerId: resolvedPartnerId,
          partnerCodeId: resolvedPartnerCodeId,
          affiliateLinkId: resolvedAffiliateLinkId,
        },
      });

      // Increment partner code usage
      if (resolvedPartnerCodeId) {
        await tx.partnerCode.update({
          where: { id: resolvedPartnerCodeId },
          data: { usageCount: { increment: 1 } },
        });
      }

      // Create commission immediately for free/wallet subscriptions that came
      // through a referral link or legacy partner subscription code.
      if (!needsPaymentConfirmation && resolvedPartnerId && (resolvedPartnerCodeId || resolvedAffiliateLinkId)) {
        const partner = await tx.partner.findUnique({
          where: { id: resolvedPartnerId },
          select: { commissionRate: true, commissionType: true },
        });
        if (partner) {
          const paidAmount = paymentAmount ?? 0;
          const commission = partner.commissionType === "fixed"
            ? partner.commissionRate
            : Math.round((paidAmount * partner.commissionRate) / 100 * 100) / 100;
          if (commission > 0) {
            await tx.partnerCommission.create({
              data: { partnerId: resolvedPartnerId, userMembershipId: subscription.id, amount: commission },
            });
          }
        }
      }

      if (!needsPaymentConfirmation && resolvedSalesAgentUserId) {
        const salesAgent = await tx.user.findUnique({
          where: { id: resolvedSalesAgentUserId },
          select: { commissionRate: true, commissionType: true },
        });
        if (salesAgent) {
          const paidAmount = paymentAmount ?? 0;
          const commission = salesAgent.commissionType === "fixed"
            ? salesAgent.commissionRate
            : Math.round((paidAmount * salesAgent.commissionRate) / 100 * 100) / 100;
          if (commission > 0) {
            await tx.agentCommission.create({
              data: {
                agentUserId: resolvedSalesAgentUserId,
                userMembershipId: subscription.id,
                amount: commission,
              },
            });
          }
        }
      }

      // Only deduct product rewards immediately if payment is not pending confirmation
      if (!needsPaymentConfirmation && productRewards.length > 0) {
        for (const reward of productRewards) {
          if (!reward?.productId || !reward?.quantity) continue;
          const product = await tx.product.findUnique({ where: { id: reward.productId } });
          if (!product) {
            throw new Error("أحد المنتجات المضافة في الباقة غير موجود.");
          }
          if (product.trackInventory && product.stock < reward.quantity) {
            throw new Error(`المخزون غير كاف للمنتج: ${product.name}.`);
          }
          const updated = await tx.product.update({
            where: { id: reward.productId },
            data: product.trackInventory ? { stock: { decrement: reward.quantity } } : {},
          });
          await tx.inventoryMovement.create({
            data: {
              productId: updated.id,
              type: "package_consumption",
              quantityChange: -Math.abs(reward.quantity),
              quantityBefore: product.stock,
              quantityAfter: product.trackInventory ? product.stock - reward.quantity : product.stock,
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

      const selectedScheduleIds = Array.isArray(scheduleIds)
        ? scheduleIds.filter((id) => typeof id === "string" && id.trim() !== "")
        : [];

      let bookedSchedules: {
        date: Date;
        time: string;
        className: string;
        trainerName: string;
      }[] = [];

      if (selectedScheduleIds.length > 0) {
        // Week-1 selection is capped at 12 (max slots visible in the weekly grid)
        if (selectedScheduleIds.length > 12) {
          throw new Error("لا يمكن اختيار أكثر من 12 موعداً في الأسبوع.");
        }

        // Fetch the chosen week-1 schedules
        const week1Schedules = await tx.schedule.findMany({
          where: { id: { in: selectedScheduleIds } },
          include: { class: { include: { trainer: true } } },
        });

        if (week1Schedules.length !== selectedScheduleIds.length) {
          throw new Error("تعذر العثور على بعض المواعيد المختارة.");
        }

        // Validate max 2 sessions per day in week 1
        const dayCounts = new Map<string, number>();
        for (const s of week1Schedules) {
          const dayKey = new Date(s.date).toISOString().slice(0, 10);
          dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
        }
        for (const count of dayCounts.values()) {
          if (count > 2) throw new Error("لا يمكن اختيار أكثر من حصتين في اليوم الواحد.");
        }

        // Week-1 availability is mandatory
        for (const s of week1Schedules) {
          if (!s.isActive || s.availableSpots <= 0) {
            throw new Error("أحد المواعيد المختارة غير متاح حاليًا.");
          }
        }

        // Build the weekly pattern from week-1 selections: (classId, time, dayOfWeek)
        const patterns = week1Schedules.map((s) => ({
          classId: s.classId,
          time: s.time,
          dayOfWeek: new Date(s.date).getDay(), // 0=Sun … 6=Sat
        }));
        const patternKey = (classId: string, time: string, dow: number) =>
          `${classId}|${time}|${dow}`;
        const patternSet = new Set(patterns.map((p) => patternKey(p.classId, p.time, p.dayOfWeek)));

        // Find all matching schedule slots within the subscription's full period
        const classIds = [...new Set(patterns.map((p) => p.classId))];
        const allMatchingSchedules = await tx.schedule.findMany({
          where: {
            classId: { in: classIds },
            date: { gte: subscription.startDate, lte: subscription.endDate },
            isActive: true,
          },
          include: { class: { include: { trainer: true } } },
          orderBy: { date: "asc" },
        });

        // Keep only schedules that match the weekly pattern (same class + time + day)
        const repeated = allMatchingSchedules.filter((s) =>
          patternSet.has(patternKey(s.classId, s.time, new Date(s.date).getDay())),
        );

        // Cap total bookings at the plan's sessionsCount
        const totalLimit = plan.sessionsCount ?? null;
        const schedulesToBook = totalLimit != null ? repeated.slice(0, totalLimit) : repeated;

        // Find any already-existing bookings for this user in the range
        const bookingIds = schedulesToBook.map((s) => s.id);
        const existingBookings = await tx.booking.findMany({
          where: { userId, scheduleId: { in: bookingIds } },
          select: { scheduleId: true },
        });
        const existingIdSet = new Set(existingBookings.map((b) => b.scheduleId));
        const week1IdSet = new Set(selectedScheduleIds);

        // Week-1 slots: create regardless (already validated above)
        // Future slots: skip if already booked or spot is full (non-fatal)
        const toCreate = schedulesToBook.filter((s) => {
          if (existingIdSet.has(s.id)) return false;
          if (week1IdSet.has(s.id)) return true;
          return s.availableSpots > 0;
        });

        if (toCreate.length > 0) {
          await Promise.all(
            toCreate.map((s) =>
              tx.booking.create({
                data: {
                  userId,
                  scheduleId: s.id,
                  userMembershipId: subscription.id,
                  status: "confirmed",
                  paidAmount: s.class.price,
                  paymentMethod: "cash",
                },
              }),
            ),
          );

          await Promise.all(
            toCreate.map((s) =>
              tx.schedule.update({
                where: { id: s.id },
                data: { availableSpots: { decrement: 1 } },
              }),
            ),
          );
        }

        bookedSchedules = schedulesToBook.map((s) => ({
          date: s.date,
          time: s.time,
          className: s.class.name,
          trainerName: s.class.trainer.name,
        }));
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

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: walletBonus,
            type: "credit",
            description: offerTitle
              ? `مكافأة الاشتراك في ${offerTitle}`
              : `مكافأة الاشتراك في باقة ${plan.name}`,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId,
          title: needsPaymentConfirmation
            ? `أكملي عملية الدفع للاشتراك في ${offerTitle ?? plan.name}`
            : offerTitle ? `تم الاشتراك في ${offerTitle}!` : `تم الاشتراك في باقة ${plan.name}!`,
          body: needsPaymentConfirmation
            ? `سيتم تفعيل اشتراكك تلقائياً فور تأكيد الدفع عبر Paymob.`
            : offerTitle
              ? `اشتراكك في العرض الخاص أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG")}.`
              : `اشتراكك أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG")}.`,
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
        discountCode: discountRecord && discountApplied > 0 ? String(discountCode ?? "").trim().toUpperCase() : null,
      };
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "تعذر إتمام الاشتراك حاليًا.";
      return { error: message };
    });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Unlock pending referral reward when subscription is immediately active
  if (!result.needsPaymentConfirmation) {
    try {
      await unlockPendingReferralReward(userId);
    } catch {}
    try {
      await ensureMembershipAttendancePass(result.subscriptionId);
    } catch {}
  }

  // Clear the pending partner affiliate ref once a subscription is created (regardless of payment status)
  if (userRecord?.pendingPartnerRef) {
    void db.user.update({ where: { id: userId }, data: { pendingPartnerRef: null } }).catch(() => null);
  }

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
          phone: result.membershipPaymentMethod === "wallet" ? (userRecord?.phone ?? null) : null,
        },
        metadata: {
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
        },
      });
      checkoutUrl = transaction.checkoutUrl ?? null;
      transactionId = transaction.id;
    } catch (error) {
      console.error("[SUBSCRIBE_PAYMENT_INIT]", error);
      await restorePaymentBalanceAdjustments({
        userId,
        walletAmount: result.actualWalletDeduct,
        pointsCount: result.actualPointsDeduct,
        reference: result.subscriptionId,
      }).catch((restoreError) => {
        console.error("[SUBSCRIBE_PAYMENT_RESTORE]", restoreError);
      });
      const message =
        error instanceof Error
          ? error.message
          : "تعذر تهيئة صفحة الدفع الإلكترونية للاشتراك.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (userRecord.email && !result.needsPaymentConfirmation) {
    const invoicePdf = await generateMembershipInvoicePdf(invoiceDetails);
    let membershipCard = null;
    try {
      const pass = await ensureMembershipAttendancePass(result.subscriptionId);
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
  }

  return NextResponse.json({
    success: true,
    subscriptionId: result.subscriptionId,
    endDate: result.endDate.toISOString(),
    checkoutUrl,
    transactionId,
  });
}
