import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { createPaymentTransaction, restorePaymentBalanceAdjustments, unlockPendingReferralReward } from "@/lib/payments/service";
import { getStoreCampaignSettings } from "@/app/api/admin/store-gift-campaign/route";
import { cookies } from "next/headers";

const GAME_COOKIE = "fitzone-game-token";

type OrderItemInput = {
  productId: string;
  quantity: number;
  size?: string | null;
};

type DeliverySnapshot = {
  id: string;
  name: string;
  type: string;
  fee: number;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
};

function sanitizeMethod(value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
  if (raw === "wallet") return "wallet";
  if (raw === "cod" || raw === "cash_on_delivery" || raw === "cash") return "cod";
  return "paymob";
}

async function tryGrantStoreGiftCampaign(
  userId: string,
  order: { id: string; subtotal: number; businessUnit: string },
) {
  if (order.businessUnit !== "store") return;
  try {
    const settings = await getStoreCampaignSettings();
    if (!settings.isActive || !settings.campaignEnabled) return;
    const now = new Date();
    if (settings.startsAt && new Date(settings.startsAt) > now) return;
    if (settings.endsAt && new Date(settings.endsAt) < now) return;
    if (order.subtotal < settings.minStoreCartSubtotal) return;

    const dbx = db as any;
    const claimCount = await dbx.storeGiftCampaignClaim.count({
      where: { userId, status: { in: ["earned", "claimed"] } },
    });
    if (claimCount >= settings.maxClaimsPerUser) return;

    // Guard: no duplicate claim for same order
    const dup = await dbx.storeGiftCampaignClaim.findFirst({
      where: { storeOrderId: order.id },
    });
    if (dup) return;

    const rewardValue =
      settings.rewardType === "wallet" ? settings.rewardWalletAmount
      : settings.rewardType === "points" ? settings.rewardPoints
      : settings.rewardType === "discount" ? settings.discountAmount
      : null;

    const claim = await dbx.storeGiftCampaignClaim.create({
      data: {
        userId,
        storeOrderId: order.id,
        rewardType: settings.rewardType,
        rewardValue,
        rewardProductId: settings.rewardProductId ?? null,
        status: "earned",
        source: "store_cart_threshold",
      },
    });

    // Immediately credit wallet or points
    if (settings.rewardType === "wallet" && settings.rewardWalletAmount > 0) {
      await db.wallet.upsert({
        where: { userId },
        create: { userId, balance: settings.rewardWalletAmount },
        update: { balance: { increment: settings.rewardWalletAmount } },
      });
      await dbx.storeGiftCampaignClaim.update({
        where: { id: claim.id },
        data: { status: "claimed", claimedAt: new Date() },
      });
    } else if (settings.rewardType === "points" && settings.rewardPoints > 0) {
      const rp = await db.rewardPoints.upsert({
        where: { userId },
        create: { userId, points: settings.rewardPoints, tier: "bronze" },
        update: { points: { increment: settings.rewardPoints } },
      });
      await db.rewardHistory.create({
        data: { rewardId: rp.id, points: settings.rewardPoints, reason: "store_gift_campaign" },
      });
      await dbx.storeGiftCampaignClaim.update({
        where: { id: claim.id },
        data: { status: "claimed", claimedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[STORE_GIFT_CAMPAIGN] auto-grant failed:", err);
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as {
      items?: OrderItemInput[];
      address?: string;
      paymentMethod?: string;
      deliveryOptionId?: string | null;
      isClubPickup?: boolean;
      recipientName?: string | null;
      recipientPhone?: string | null;
      walletDeduct?: number;
      pointsDeduct?: number;
    };

    const items = Array.isArray(body.items) ? body.items.filter((item) => item.productId && item.quantity > 0) : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "السلة فارغة." }, { status: 400 });
    }

    const products = await db.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, isActive: true },
    });

    if (products.length !== items.length) {
      return NextResponse.json({ error: "بعض المنتجات لم تعد متاحة." }, { status: 400 });
    }

    for (const item of items) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || (product.trackInventory && product.stock < item.quantity)) {
        return NextResponse.json(
          { error: `الكمية غير متاحة للمنتج ${product?.name ?? ""}`.trim() },
          { status: 400 },
        );
      }
    }

    // ── Free-gifts game session: resolve gift products, discount, shipping ──────
    const cookieStore = await cookies();
    const gameToken = cookieStore.get(GAME_COOKIE)?.value ?? null;
    const dbx = db as any;

    let giftProductIds = new Set<string>();
    let gameDiscount = 0;
    let gameFreeShipping = false;
    let gameSessionId: string | null = null;

    if (gameToken) {
      const gameSession = await dbx.storeFreeGiftsSession
        .findUnique({ where: { token: gameToken } })
        .catch(() => null) as { id: string; status: string; spinRewardType: string | null; spinRewardValue: number | null; selectedProductIds: string } | null;

      if (gameSession?.status === "confirmed") {
        try {
          const wonIds: string[] = JSON.parse(gameSession.selectedProductIds);
          giftProductIds = new Set(wonIds);
          gameSessionId = gameSession.id;
        } catch { /* ignore parse error */ }

        const rType = gameSession.spinRewardType ?? "";
        const rValue = Number(gameSession.spinRewardValue ?? 0);
        if (rType === "free_shipping") gameFreeShipping = true;
        if (rType === "discount" && rValue > 0) {
          // % discount applied after gift items (already 0)
          // will be computed from non-gift subtotal below
          gameDiscount = rValue; // store percent, apply after subtotal
        }
      }
    }

    const VAT_RATE = 0.14;
    const subtotal = items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId)!;
      if (giftProductIds.has(product.id)) return sum; // gift item → free
      const itemPrice = product.vatEnabled ? Math.round(product.price * (1 + VAT_RATE) * 100) / 100 : product.price;
      return sum + itemPrice * item.quantity;
    }, 0);

    // Resolve game discount (% off non-gift subtotal)
    const gameDiscountAmount = gameDiscount > 0
      ? Math.round(subtotal * (gameDiscount / 100) * 100) / 100
      : 0;

    const paymentMethod = sanitizeMethod(body.paymentMethod);

    let deliveryOption: DeliverySnapshot | null = null;
    if (body.deliveryOptionId) {
      deliveryOption = await db.deliveryOption.findFirst({
        where: { id: body.deliveryOptionId, isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          fee: true,
          estimatedDaysMin: true,
          estimatedDaysMax: true,
        },
      });
    }

    const isClubPickup = deliveryOption?.type === "pickup" ? true : Boolean(body.isClubPickup);
    const shippingFee = (deliveryOption?.type === "pickup" || gameFreeShipping) ? 0 : deliveryOption?.fee ?? 0;
    const baseTotal = Math.max(0, subtotal - gameDiscountAmount + shippingFee);

    const walletDeductReq = Math.max(0, Number(body.walletDeduct ?? 0));
    const pointsDeductReq = Math.floor(Math.max(0, Number(body.pointsDeduct ?? 0)));
    let validatedWalletDeduct = 0;
    let validatedPointsDeduct = 0;
    let pointsEGP = 0;
    let pointValueEGP = 0.1;

    if (walletDeductReq > 0 || pointsDeductReq > 0) {
      const [walletRow, pointsRow, rewardSettings] = await Promise.all([
        walletDeductReq > 0 ? db.wallet.findUnique({ where: { userId }, select: { balance: true } }) : null,
        pointsDeductReq > 0 ? db.rewardPoints.findUnique({ where: { userId } }) : null,
        db.siteContent.findUnique({ where: { section: "reward_settings" } }),
      ]);

      if (rewardSettings?.content) {
        try {
          const parsed = JSON.parse(rewardSettings.content) as { pointValueEGP?: number };
          if (typeof parsed.pointValueEGP === "number") pointValueEGP = parsed.pointValueEGP;
        } catch {}
      }

      if (walletDeductReq > 0) {
        if (walletDeductReq > (walletRow?.balance ?? 0)) {
          return NextResponse.json({ error: "رصيد المحفظة غير كافٍ." }, { status: 400 });
        }
        validatedWalletDeduct = Math.min(walletDeductReq, baseTotal);
      }

      if (pointsDeductReq > 0) {
        if (pointsDeductReq > (pointsRow?.points ?? 0)) {
          return NextResponse.json({ error: "رصيد الفيتزونات غير كافٍ." }, { status: 400 });
        }
        pointsEGP = Math.round(pointsDeductReq * pointValueEGP * 100) / 100;
        validatedPointsDeduct = pointsDeductReq;
      }
    }

    const discountTotal = Math.round((validatedWalletDeduct + pointsEGP) * 100) / 100;
    const total = Math.max(0, baseTotal - discountTotal);

    const order = await db.order.create({
      data: {
        userId,
        businessUnit: "store",
        subtotal,
        discountTotal,
        shippingFee,
        total,
        status: "pending",
        address: body.address?.trim() || null,
        paymentMethod,
        deliveryOptionId: deliveryOption?.id ?? null,
        deliveryLabel: deliveryOption?.name ?? (isClubPickup ? "استلام من الجيم" : null),
        estimatedDeliveryDays: deliveryOption?.estimatedDaysMax ?? deliveryOption?.estimatedDaysMin ?? null,
        isClubPickup,
        recipientName: body.recipientName?.trim() || null,
        recipientPhone: body.recipientPhone?.trim() || null,
        items: {
          create: items.map((item) => {
            const product = products.find((entry) => entry.id === item.productId)!;
            if (giftProductIds.has(product.id)) {
              return { productId: product.id, quantity: item.quantity, price: 0, vatAmount: 0, size: item.size ?? null };
            }
            const itemPrice = product.vatEnabled ? Math.round(product.price * (1 + VAT_RATE) * 100) / 100 : product.price;
            const vatAmount = product.vatEnabled ? Math.round(product.price * VAT_RATE * 100) / 100 : 0;
            return {
              productId: product.id,
              quantity: item.quantity,
              price: itemPrice,
              vatAmount,
              size: item.size ?? null,
            };
          }),
        },
      },
      include: { items: true },
    });

    const inventoryJobs = items.map(async (item) => {
      const product = products.find((entry) => entry.id === item.productId)!;
      const beforeStock = product.stock;
      const afterStock = product.trackInventory ? beforeStock - item.quantity : beforeStock;
      if (product.trackInventory) {
        await db.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }
      await db.inventoryMovement.create({
        data: {
          productId: product.id,
          type: "sale",
          quantityChange: -Math.abs(item.quantity),
          quantityBefore: beforeStock,
          quantityAfter: afterStock,
          unitCost: product.averageCost,
          averageCostBefore: product.averageCost,
          averageCostAfter: product.averageCost,
          referenceType: "order",
          referenceId: order.id,
        },
      });
    });

    if (validatedWalletDeduct > 0) {
      const wallet = await db.wallet.update({
        where: { userId },
        data: { balance: { decrement: validatedWalletDeduct } },
      });
      await db.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: validatedWalletDeduct,
          type: "debit",
          description: `سداد طلب رقم ${order.id}`,
        },
      });
    }

    if (validatedPointsDeduct > 0) {
      const pointsRecord = await db.rewardPoints.update({
        where: { userId },
        data: { points: { decrement: validatedPointsDeduct } },
      });
      await db.rewardHistory.create({
        data: {
          rewardId: pointsRecord.id,
          points: -validatedPointsDeduct,
          reason: `استخدام فيتزونات لسداد طلب رقم ${order.id}`,
        },
      });
    }

    let checkoutUrl: string | null = null;
    let transactionId: string | null = null;

    if (total > 0 && paymentMethod === "paymob") {
      try {
        const transaction = await createPaymentTransaction({
          userId,
          provider: "paymob",
          purpose: "order",
          businessUnit: "store",
          amount: total,
          paymentMethod,
          orderId: order.id,
          description: `Order ${order.id}`,
          metadata: {
            paymentAdjustments: {
              walletAmount: validatedWalletDeduct,
              pointsCount: validatedPointsDeduct,
            },
            walletDeductedAmount: validatedWalletDeduct || null,
            pointsDeductedCount: validatedPointsDeduct || null,
            deliveryOptionId: deliveryOption?.id ?? null,
            deliveryLabel: deliveryOption?.name ?? (isClubPickup ? "استلام من الجيم" : null),
            shippingFee,
            walletDeducted: validatedWalletDeduct || null,
            pointsDeducted: validatedPointsDeduct || null,
          },
        });
        checkoutUrl = transaction.checkoutUrl ?? null;
        transactionId = transaction.id;
      } catch (error) {
        await restorePaymentBalanceAdjustments({
          userId,
          walletAmount: validatedWalletDeduct,
          pointsCount: validatedPointsDeduct,
          reference: order.id,
        }).catch((restoreError) => {
          console.error("[ORDERS_PAYMENT_RESTORE]", restoreError);
        });

        console.error("[ORDERS_PAYMENT_INIT]", error);
        const message = error instanceof Error ? error.message : "تعذر تهيئة صفحة الدفع.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    } else if (total > 0 && paymentMethod === "cod") {
      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    } else if (total <= 0) {
      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    }

    // Unlock pending referral reward for confirmed/free orders (fire-and-forget)
    if (total <= 0 || paymentMethod === "cod") {
      void unlockPendingReferralReward(userId).catch(() => {});
    }

    // Auto-apply store gift campaign (fire-and-forget, never blocks order)
    void tryGrantStoreGiftCampaign(userId, { id: order.id, subtotal, businessUnit: "store" });

    // Link confirmed game session to this order — prevents double-claiming
    if (gameSessionId) {
      void dbx.storeFreeGiftsSession.update({
        where: { id: gameSessionId },
        data: { storeOrderId: order.id },
      }).catch((e: unknown) => console.error("[FREE_GIFTS_LINK]", e));
    }

    await Promise.all([
      ...inventoryJobs,
      db.notification.create({
        data: {
          userId,
          title: "تم تسجيل طلبك",
          body: "تم حفظ طلبك بنجاح. يمكنك متابعة حالة الدفع من صفحة الطلبات.",
          type: "info",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      orderId: order.id,
      total: order.total,
      checkoutUrl,
      transactionId,
      message: "تم حفظ طلبك بنجاح.",
    });
  } catch (error) {
    console.error("[ORDERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ الطلب." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: "الطلب غير محدد." }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return NextResponse.json({ error: "لا يمكن إلغاء هذا الطلب." }, { status: 400 });
    }

    await Promise.all([
      db.order.update({
        where: { id: orderId },
        data: { status: "cancelled" },
      }),
      ...order.items.map(async (item) => {
        const product = await db.product.findUnique({ where: { id: item.productId } });
        if (!product) return;
        const beforeStock = product.stock;
        const afterStock = product.trackInventory ? beforeStock + item.quantity : beforeStock;
        if (product.trackInventory) {
          await db.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
        await db.inventoryMovement.create({
          data: {
            productId: product.id,
            type: "return",
            quantityChange: Math.abs(item.quantity),
            quantityBefore: beforeStock,
            quantityAfter: afterStock,
            unitCost: product.averageCost,
            averageCostBefore: product.averageCost,
            averageCostAfter: product.averageCost,
            referenceType: "order",
            referenceId: order.id,
          },
        });
      }),
      db.notification.create({
        data: {
          userId,
          title: "تم إلغاء الطلب",
          body: "تم إلغاء طلبك واستعادة المخزون بنجاح.",
          type: "info",
        },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ORDERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر إلغاء الطلب." }, { status: 500 });
  }
}
