import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";

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

    const subtotal = items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId)!;
      return sum + product.price * item.quantity;
    }, 0);

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
    const shippingFee = deliveryOption?.type === "pickup" ? 0 : deliveryOption?.fee ?? 0;
    const baseTotal = Math.max(0, subtotal + shippingFee);

    // Validate and apply wallet/points deductions
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
          const s = JSON.parse(rewardSettings.content) as { pointValueEGP?: number };
          if (typeof s.pointValueEGP === "number") pointValueEGP = s.pointValueEGP;
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
          return NextResponse.json({ error: "رصيد النقاط غير كافٍ." }, { status: 400 });
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
            return {
              productId: product.id,
              quantity: item.quantity,
              price: product.price,
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

    // Deduct wallet and points
    if (validatedWalletDeduct > 0) {
      const wallet = await db.wallet.update({
        where: { userId },
        data: { balance: { decrement: validatedWalletDeduct } },
      });
      await db.walletTransaction.create({
        data: { walletId: wallet.id, amount: validatedWalletDeduct, type: "debit", description: `سداد طلب رقم ${order.id}` },
      });
    }

    if (validatedPointsDeduct > 0) {
      const pointsRecord = await db.rewardPoints.update({
        where: { userId },
        data: { points: { decrement: validatedPointsDeduct } },
      });
      await db.rewardHistory.create({
        data: { rewardId: pointsRecord.id, points: -validatedPointsDeduct, reason: `استخدام نقاط لسداد طلب رقم ${order.id}` },
      });
    }

    let checkoutUrl: string | null = null;
    let transactionId: string | null = null;
    if (total > 0 && paymentMethod === "paymob") {
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
          deliveryOptionId: deliveryOption?.id ?? null,
          deliveryLabel: deliveryOption?.name ?? (isClubPickup ? "استلام من الجيم" : null),
          shippingFee,
          walletDeducted: validatedWalletDeduct || null,
          pointsDeducted: validatedPointsDeduct || null,
        },
      });
      checkoutUrl = transaction.checkoutUrl ?? null;
      transactionId = transaction.id;
    } else if (total > 0 && paymentMethod === "cod") {
      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
    } else if (total <= 0) {
      // Fully paid by wallet/points
      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
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
