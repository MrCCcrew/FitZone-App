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

    const order = await db.order.create({
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

    const transaction = await createPaymentTransaction({
      userId: currentUser.id,
      provider: body.provider ?? null,
      purpose: "order",
      businessUnit: "store",
      amount: total,
      paymentMethod: body.paymentMethod ?? "card",
      orderId: order.id,
      returnUrl: body.returnUrl ?? null,
      cancelUrl: body.cancelUrl ?? null,
      description: `سداد طلب رقم ${order.id}`,
      metadata: {
        address: body.address?.trim() || null,
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
