import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";

type OrderItemInput = {
  productId: string;
  quantity: number;
  size?: string | null;
};

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as {
      items?: OrderItemInput[];
      address?: string;
      provider?: string;
      paymentMethod?: string;
      returnUrl?: string;
      cancelUrl?: string;
      walletDeduct?: number;
      pointsDeduct?: number;
    };

    const items = Array.isArray(body.items)
      ? body.items.filter((item) => item.productId && Number(item.quantity) > 0)
      : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "السلة فارغة." }, { status: 400 });
    }

    const products = await db.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        isActive: true,
      },
    });

    if (products.length !== items.length) {
      return NextResponse.json({ error: "بعض المنتجات لم تعد متاحة." }, { status: 400 });
    }

    for (const item of items) {
      const product = products.find((entry) => entry.id === item.productId);
      if (!product || product.stock < item.quantity) {
        return NextResponse.json(
          { error: `الكمية غير متاحة للمنتج ${product?.name ?? ""}`.trim() },
          { status: 400 },
        );
      }
    }

    const total = items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId)!;
      return sum + product.price * item.quantity;
    }, 0);

    const walletDeductAmount = Math.min(Math.max(0, Number(body.walletDeduct ?? 0)), total);
    const pointsDeductCount = Math.floor(Math.max(0, Number(body.pointsDeduct ?? 0)));

    // Validate wallet & points
    let pointValueEGP = 0.1;
    let validatedWalletDeduct = 0;
    let validatedPointsDeduct = 0;
    let pointsEGP = 0;

    if (walletDeductAmount > 0 || pointsDeductCount > 0) {
      const [walletRow, pointsRow, rewardSettings] = await Promise.all([
        walletDeductAmount > 0 ? db.wallet.findUnique({ where: { userId: currentUser.id }, select: { balance: true } }) : null,
        pointsDeductCount > 0 ? db.rewardPoints.findUnique({ where: { userId: currentUser.id } }) : null,
        db.siteContent.findUnique({ where: { section: "reward_settings" } }),
      ]);

      if (rewardSettings?.content) {
        try {
          const s = JSON.parse(rewardSettings.content) as { pointValueEGP?: number };
          if (typeof s.pointValueEGP === "number") pointValueEGP = s.pointValueEGP;
        } catch {}
      }

      if (walletDeductAmount > 0) {
        if (walletDeductAmount > (walletRow?.balance ?? 0)) {
          return NextResponse.json({ error: "رصيد المحفظة غير كافٍ." }, { status: 400 });
        }
        validatedWalletDeduct = walletDeductAmount;
      }

      if (pointsDeductCount > 0) {
        if (pointsDeductCount > (pointsRow?.points ?? 0)) {
          return NextResponse.json({ error: "رصيد النقاط غير كافٍ." }, { status: 400 });
        }
        pointsEGP = Math.round(pointsDeductCount * pointValueEGP * 100) / 100;
        validatedPointsDeduct = pointsDeductCount;
      }
    }

    const amountAfterDeductions = Math.max(0, total - validatedWalletDeduct - pointsEGP);

    // Deduct wallet and points, create order in one transaction
    const { order, walletId } = await db.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId: currentUser.id,
          total,
          status: "pending",
          address: body.address?.trim() || null,
          paymentMethod: body.paymentMethod ?? "card",
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
      });

      let wId: string | null = null;

      if (validatedWalletDeduct > 0) {
        const wallet = await tx.wallet.update({
          where: { userId: currentUser.id },
          data: { balance: { decrement: validatedWalletDeduct } },
        });
        wId = wallet.id;
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: validatedWalletDeduct,
            type: "debit",
            description: `سداد طلب رقم ${createdOrder.id}`,
          },
        });
      }

      if (validatedPointsDeduct > 0) {
        const pointsRecord = await tx.rewardPoints.update({
          where: { userId: currentUser.id },
          data: { points: { decrement: validatedPointsDeduct } },
        });
        await tx.rewardHistory.create({
          data: {
            rewardId: pointsRecord.id,
            points: -validatedPointsDeduct,
            reason: `استخدام نقاط لسداد طلب رقم ${createdOrder.id}`,
          },
        });
      }

      return { order: createdOrder, walletId: wId };
    });

    // If fully paid by wallet/points, mark order confirmed directly
    if (amountAfterDeductions <= 0) {
      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
      return NextResponse.json({ success: true, orderId: order.id, transaction: null, fullyPaid: true });
    }

    const transaction = await createPaymentTransaction({
      userId: currentUser.id,
      provider: body.provider ?? null,
      purpose: "order",
      businessUnit: "store",
      amount: amountAfterDeductions,
      paymentMethod: body.paymentMethod ?? "card",
      orderId: order.id,
      returnUrl: body.returnUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      description: `سداد طلب رقم ${order.id}`,
      metadata: {
        address: body.address?.trim() || null,
        walletDeducted: validatedWalletDeduct || null,
        pointsDeducted: validatedPointsDeduct || null,
        walletId: walletId || null,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          size: item.size ?? null,
        })),
      },
      customer: {
        name: currentUser.name,
        email: currentUser.email,
        phone: null,
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      transaction,
    });
  } catch (error) {
    console.error("[PAYMENTS_ORDER_INTENT_POST]", error);
    const message = error instanceof Error ? error.message : "تعذر إنشاء طلب الدفع.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
