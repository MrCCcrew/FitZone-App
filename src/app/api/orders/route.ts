import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

type OrderItemInput = {
  productId: string;
  quantity: number;
  size?: string | null;
};

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
    }

    const body = (await req.json()) as {
      items?: OrderItemInput[];
      address?: string;
      paymentMethod?: string;
    };

    const items = Array.isArray(body.items) ? body.items.filter((item) => item.productId && item.quantity > 0) : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "السلة فارغة" }, { status: 400 });
    }

    const products = await db.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, isActive: true },
    });

    if (products.length !== items.length) {
      return NextResponse.json({ error: "بعض المنتجات لم تعد متاحة" }, { status: 400 });
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

    const total = items.reduce((sum, item) => {
      const product = products.find((entry) => entry.id === item.productId)!;
      return sum + product.price * item.quantity;
    }, 0);

    const order = await db.order.create({
      data: {
        userId,
        total,
        status: "pending",
        address: body.address?.trim() || null,
        paymentMethod: body.paymentMethod ?? "manual_pending",
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

    await Promise.all([
      ...items.map(async (item) => {
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
      }),
      db.notification.create({
        data: {
          userId,
          title: "تم تسجيل طلبك",
          body: "تم حفظ طلبك مبدئيًا وسيتم تفعيل الدفع والشحن الحقيقيين قريبًا.",
          type: "info",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      orderId: order.id,
      total: order.total,
      message: "تم حفظ طلبك مبدئيًا. الدفع والشحن الحقيقيان سيتاحان قريبًا.",
    });
  } catch (error) {
    console.error("[ORDERS_POST]", error);
    return NextResponse.json({ error: "تعذر حفظ الطلب" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    const userId = currentUser?.id;

    if (!userId) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
    }

    const { orderId } = (await req.json()) as { orderId?: string };
    if (!orderId) {
      return NextResponse.json({ error: "الطلب غير محدد" }, { status: 400 });
    }

    const order = await db.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }

    if (!["pending", "confirmed"].includes(order.status)) {
      return NextResponse.json({ error: "لا يمكن إلغاء هذا الطلب" }, { status: 400 });
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
    return NextResponse.json({ error: "تعذر إلغاء الطلب" }, { status: 500 });
  }
}
