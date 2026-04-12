import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { sendSubscriptionEmail } from "@/lib/email";
import { createPaymentTransaction } from "@/lib/payments/service";

type SubscribePayload = {
  membershipId?: string | null;
  offerId?: string | null;
  scheduleIds?: string[] | null;
  paymentMethod?: string | null;
  discountCode?: string | null;
};

function sanitizeMethod(value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
  const allowed = new Set(["instapay", "vodafone_cash", "cash", "offer"]);
  return allowed.has(raw) ? raw : "instapay";
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

  const { membershipId, offerId, scheduleIds, paymentMethod, discountCode } = (await req.json()) as SubscribePayload;
  if (!membershipId && !offerId) {
    return NextResponse.json({ error: "يرجى اختيار الباقة أو العرض أولًا." }, { status: 400 });
  }

  const userRecord = await db.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, email: true, name: true },
  });

  if (!userRecord?.emailVerified) {
    return NextResponse.json(
      { error: "يجب تفعيل الحساب أولًا قبل إتمام الاشتراك.", needsVerification: true },
      { status: 403 },
    );
  }

  const resolvedPaymentMethod = sanitizeMethod(paymentMethod);

  // Validate discount code before transaction
  let discountRecord: { id: string; type: string; value: number } | null = null;
  if (discountCode) {
    const normalizedCode = String(discountCode).trim().toUpperCase();
    const dc = await db.discountCode.findUnique({ where: { code: normalizedCode } });
    if (!dc || !dc.isActive) {
      return NextResponse.json({ error: "كود الخصم غير صالح." }, { status: 400 });
    }
    if (dc.expiresAt && dc.expiresAt < new Date()) {
      return NextResponse.json({ error: "انتهت صلاحية كود الخصم." }, { status: 400 });
    }
    if (dc.maxUses != null && dc.usedCount >= dc.maxUses) {
      return NextResponse.json({ error: "تم استنفاد الحد الأقصى لهذا الكود." }, { status: 400 });
    }
    const alreadyUsed = await db.discountCodeUsage.findFirst({
      where: { discountCodeId: dc.id, userId },
    });
    if (alreadyUsed) {
      return NextResponse.json({ error: "لقد استخدمت هذا الكود من قبل." }, { status: 400 });
    }
    discountRecord = { id: dc.id, type: dc.type, value: dc.value };
  }

  const result = await db
    .$transaction(async (tx) => {
      let resolvedMembershipId = membershipId as string | undefined;
      let offerTitle: string | null = null;
      let offerRecord: { id: string; title: string; specialPrice: number | null } | null = null;
      let walletBonus = 0;

      if (offerId) {
        const offer = await tx.offer.findUnique({ where: { id: offerId } });
        if (!offer || !offer.isActive || offer.expiresAt <= new Date()) {
          throw new Error("العرض الخاص غير متاح الآن.");
        }
        if (offer.type !== "special" || !offer.membershipId) {
          throw new Error("هذا العرض غير صالح للاشتراك المباشر.");
        }
        if (offer.maxSubscribers != null && offer.currentSubscribers >= offer.maxSubscribers) {
          throw new Error("اكتمل عدد المشتركين في هذا العرض.");
        }

        resolvedMembershipId = offer.membershipId;
        offerTitle = offer.title;
        offerRecord = { id: offer.id, title: offer.title, specialPrice: offer.specialPrice ?? null };
      }

      if (!resolvedMembershipId) {
        throw new Error("تعذر تحديد الباقة المطلوبة.");
      }

      const plan = await tx.membership.findUnique({ where: { id: resolvedMembershipId } });
      if (!plan) {
        throw new Error("الباقة غير موجودة.");
      }

      walletBonus = plan.walletBonus ?? 0;
      const productRewards = parseJsonArray<{ productId: string; quantity: number }>(plan.productRewards ?? null);

      await tx.userMembership.updateMany({
        where: { userId, status: "active" },
        data: { status: "expired" },
      });

      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration);

      let paymentAmount =
        offerRecord?.specialPrice ?? (plan.priceAfter && plan.priceAfter > 0 ? plan.priceAfter : plan.price);

      let discountApplied = 0;
      if (discountRecord && paymentAmount) {
        if (discountRecord.type === "percentage") {
          discountApplied = Math.round((paymentAmount * discountRecord.value) / 100 * 100) / 100;
        } else {
          discountApplied = Math.min(discountRecord.value, paymentAmount);
        }
        paymentAmount = Math.max(0, paymentAmount - discountApplied);
      }

      const membershipPaymentMethod = offerId ? "offer" : resolvedPaymentMethod;

      const subscription = await tx.userMembership.create({
        data: {
          userId,
          membershipId: plan.id,
          startDate,
          endDate,
          status: "active",
          paymentAmount: paymentAmount ?? 0,
          paymentMethod: membershipPaymentMethod,
          offerTitle: offerTitle ?? null,
          offerId: offerRecord?.id ?? null,
          totalSessions: plan.sessionsCount ?? null,
          productRewardsUsed: productRewards.length ? JSON.stringify(productRewards) : null,
        },
      });

      if (productRewards.length > 0) {
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
        if (plan.sessionsCount && selectedScheduleIds.length > plan.sessionsCount) {
          throw new Error("عدد المواعيد المختارة أكبر من عدد الحصص المتاحة في الباقة.");
        }

        const schedules = await tx.schedule.findMany({
          where: { id: { in: selectedScheduleIds } },
          include: { class: { include: { trainer: true } } },
        });

        if (schedules.length !== selectedScheduleIds.length) {
          throw new Error("تعذر العثور على بعض المواعيد المختارة.");
        }

        schedules.forEach((schedule) => {
          if (!schedule.isActive || schedule.availableSpots <= 0) {
            throw new Error("أحد المواعيد المختارة غير متاح حاليًا.");
          }
        });

        const existing = await tx.booking.findMany({
          where: { userId, scheduleId: { in: selectedScheduleIds } },
          select: { scheduleId: true },
        });
        const existingIds = new Set(existing.map((item) => item.scheduleId));

        const toCreate = schedules.filter((schedule) => !existingIds.has(schedule.id));
        if (toCreate.length > 0) {
          await Promise.all(
            toCreate.map((schedule) =>
              tx.booking.create({
                data: {
                  userId,
                  scheduleId: schedule.id,
                  userMembershipId: subscription.id,
                  status: "confirmed",
                  paidAmount: schedule.class.price,
                  paymentMethod: "cash",
                },
              }),
            ),
          );

          await Promise.all(
            toCreate.map((schedule) =>
              tx.schedule.update({
                where: { id: schedule.id },
                data: { availableSpots: { decrement: 1 } },
              }),
            ),
          );
        }

        bookedSchedules = schedules.map((schedule) => ({
          date: schedule.date,
          time: schedule.time,
          className: schedule.class.name,
          trainerName: schedule.class.trainer.name,
        }));
      }

      if (offerId) {
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

      if (walletBonus > 0) {
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
          title: offerTitle ? `تم الاشتراك في ${offerTitle}!` : `تم الاشتراك في باقة ${plan.name}!`,
          body: offerTitle
            ? `اشتراكك في العرض الخاص أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG")}.`
            : `اشتراكك أصبح نشطًا حتى ${endDate.toLocaleDateString("ar-EG")}.`,
          type: "success",
        },
      });

      return {
        subscriptionId: subscription.id,
        planName: plan.name,
        endDate,
        walletBonus,
        offerTitle,
        bookedSchedules,
        paymentAmount,
        membershipPaymentMethod,
        discountApplied,
      };
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "تعذر إتمام الاشتراك حاليًا.";
      return { error: message };
    });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  let checkoutUrl: string | null = null;
  let transactionId: string | null = null;
  if (result.paymentAmount > 0 && ["instapay", "vodafone_cash"].includes(result.membershipPaymentMethod)) {
    const transaction = await createPaymentTransaction({
      userId,
      provider: result.membershipPaymentMethod,
      purpose: "membership",
      businessUnit: "club",
      amount: result.paymentAmount,
      paymentMethod: result.membershipPaymentMethod,
      membershipId: result.subscriptionId,
      description: `Membership ${result.planName}`,
    });
    checkoutUrl = transaction.checkoutUrl ?? null;
    transactionId = transaction.id;
  }

  if (userRecord.email) {
    void sendSubscriptionEmail(
      userRecord.email,
      userRecord.name ?? "العضوة",
      result.offerTitle ?? result.planName,
      result.endDate,
      result.walletBonus,
      result.bookedSchedules ?? [],
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
