import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

const VALID_STATUSES = [
  "pending", "confirmed", "preparing", "ready_to_ship",
  "shipped_to_courier", "in_transit", "delivered", "cancelled", "returned",
];

async function checkAdmin() {
  const guard = await requireAdminFeature("orders");
  return "error" in guard
    ? { error: guard.error, userId: null }
    : { error: null, userId: guard.session.user.id };
}

function fmtOrder(o: {
  id: string; userId: string; businessUnit: string;
  subtotal: number; discountTotal: number; shippingFee: number; total: number;
  status: string; paymentMethod: string; notes: string | null; adminNotes: string | null;
  recipientName: string | null; recipientPhone: string | null;
  governorate: string | null; city: string | null; address: string | null;
  deliveryOptionId: string | null; deliveryLabel: string | null;
  deliveryCompanyId: string | null; trackingNumber: string | null;
  inventoryDeducted: boolean; cancelledAt: Date | null; deliveredAt: Date | null;
  createdAt: Date; updatedAt: Date;
  user: { id: string; name: string | null; email: string | null; phone: string | null };
  items: {
    id: string; quantity: number; price: number; costPrice: number | null;
    vatAmount: number; size: string | null; color: string | null;
    product: { id: string; name: string; sku: string | null; images: string | null };
    variant: { id: string; size: string | null; color: string | null; sku: string | null } | null;
  }[];
  deliveryCompany: { id: string; name: string; phone: string | null } | null;
  statusHistory: {
    id: string; fromStatus: string | null; toStatus: string;
    notes: string | null; createdAt: Date;
    performedBy: { id: string; name: string | null } | null;
  }[];
  paymentTransactions: { id: string; status: string; amount: number; paymentMethod: string; paidAt: Date | null }[];
}) {
  return {
    id: o.id,
    userId: o.userId,
    businessUnit: o.businessUnit,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    shippingFee: o.shippingFee,
    total: o.total,
    status: o.status,
    paymentMethod: o.paymentMethod,
    notes: o.notes,
    adminNotes: o.adminNotes,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    governorate: o.governorate,
    city: o.city,
    address: o.address,
    deliveryOptionId: o.deliveryOptionId,
    deliveryLabel: o.deliveryLabel,
    deliveryCompanyId: o.deliveryCompanyId,
    trackingNumber: o.trackingNumber,
    inventoryDeducted: o.inventoryDeducted,
    cancelledAt: o.cancelledAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    customer: o.user,
    items: o.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      price: i.price,
      costPrice: i.costPrice,
      vatAmount: i.vatAmount,
      size: i.size,
      color: i.color,
      product: {
        id: i.product.id,
        name: i.product.name,
        sku: i.product.sku,
        image: (() => { try { return (JSON.parse(i.product.images ?? "[]") as string[])[0] ?? null; } catch { return null; } })(),
      },
      variant: i.variant,
    })),
    deliveryCompany: o.deliveryCompany,
    statusHistory: o.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      notes: h.notes,
      createdAt: h.createdAt.toISOString(),
      performedBy: h.performedBy,
    })),
    payment: o.paymentTransactions[0] ?? null,
  };
}

const ORDER_INCLUDE = {
  user: { select: { id: true, name: true, email: true, phone: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, images: true } },
      variant: { select: { id: true, size: true, color: true, sku: true } },
    },
  },
  deliveryCompany: { select: { id: true, name: true, phone: true } },
  statusHistory: {
    orderBy: { createdAt: "desc" as const },
    include: { performedBy: { select: { id: true, name: true } } },
  },
  paymentTransactions: {
    select: { id: true, status: true, amount: true, paymentMethod: true, paidAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

// GET /api/admin/orders
export async function GET(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search")?.trim();
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const paymentMethod = searchParams.get("paymentMethod");
  const deliveryCompanyId = searchParams.get("deliveryCompanyId");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const single = searchParams.get("id");

  // Single order detail
  if (single) {
    const order = await db.order.findUnique({ where: { id: single }, include: ORDER_INCLUDE });
    if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    return NextResponse.json({ order: fmtOrder(order) });
  }

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (paymentMethod && paymentMethod !== "all") where.paymentMethod = paymentMethod;
  if (deliveryCompanyId && deliveryCompanyId !== "all") where.deliveryCompanyId = deliveryCompanyId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo + "T23:59:59.999Z") } : {}),
    };
  }
  if (search) {
    where.OR = [
      { id: { contains: search } },
      { recipientPhone: { contains: search } },
      { recipientName: { contains: search } },
      { user: { name: { contains: search } } },
      { user: { phone: { contains: search } } },
    ];
  }

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Stats for today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const [todayStats, statusCounts] = await Promise.all([
    db.order.aggregate({
      where: { createdAt: { gte: todayStart } },
      _count: { id: true },
      _sum: { total: true },
    }),
    db.order.groupBy({ by: ["status"], _count: { id: true } }),
  ]);

  const countMap: Record<string, number> = {};
  for (const row of statusCounts) countMap[row.status] = row._count.id;

  return NextResponse.json({
    orders: orders.map(fmtOrder),
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    stats: {
      todayCount: todayStats._count.id,
      todayRevenue: todayStats._sum.total ?? 0,
      byStatus: countMap,
    },
  });
}

// PATCH /api/admin/orders — update order (status, tracking, notes, delivery company)
export async function PATCH(req: Request) {
  const { error, userId } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    id: string;
    status?: string;
    trackingNumber?: string;
    deliveryCompanyId?: string;
    adminNotes?: string;
    shippingFee?: number;
  };

  if (!body.id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const order = await db.order.findUnique({
    where: { id: body.id },
    include: { items: { include: { product: true, variant: true } } },
  });
  if (!order) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  const updateData: Record<string, unknown> = {};

  // Status change
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 });
    }

    const prevStatus = order.status;
    const newStatus = body.status;

    // Phase 2B: Guard - prevent double inventory deduction
    const shouldDeduct = ["confirmed", "preparing"].includes(newStatus) && !order.inventoryDeducted;
    const shouldRestore = newStatus === "cancelled" && order.inventoryDeducted;
    const shouldRestoreReturn = newStatus === "returned" && order.inventoryDeducted;

    if (shouldDeduct) {
      // Phase 2B: Business rule check - warn about unpaid Paymob orders
      if (order.paymentMethod === "paymob") {
        const paidTx = await db.paymentTransaction.findFirst({
          where: { orderId: order.id, status: "paid" },
        });

        if (!paidTx) {
          console.warn(`[ADMIN] Confirming unpaid Paymob order ${order.id} - manual override`);
          // Audit trail logged to console (activityLog table not in schema)
        }
      }

      // Aggregate quantities by productId (Phase 2B)
      const productQuantities = new Map<string, number>();
      for (const item of order.items) {
        const key = item.variantId || item.productId;
        const current = productQuantities.get(key) || 0;
        productQuantities.set(key, current + item.quantity);
      }

      // Check stock availability first (aggregated)
      for (const item of order.items) {
        if (!item.product.trackInventory) continue;
        const available = item.variant ? item.variant.stock : item.product.stock;
        const requiredQty = productQuantities.get(item.variantId || item.productId) || item.quantity;
        if (available < requiredQty) {
          return NextResponse.json({
            error: `المخزون غير كافي للمنتج "${item.product.name}" (متاح: ${available}، مطلوب: ${requiredQty})`,
          }, { status: 400 });
        }
      }

      // Deduct stock (aggregated per product)
      const deductedProducts = new Set<string>();
      for (const item of order.items) {
        if (!item.product.trackInventory) continue;

        const key = item.variantId || item.productId;
        if (deductedProducts.has(key)) continue; // Already deducted
        deductedProducts.add(key);

        const totalQty = productQuantities.get(key)!;
        const before = item.variant ? item.variant.stock : item.product.stock;
        const after = before - totalQty;

        if (item.variantId && item.variant) {
          await db.productVariant.update({ where: { id: item.variantId }, data: { stock: { decrement: totalQty } } });
        }
        await db.product.update({ where: { id: item.productId }, data: { stock: { decrement: totalQty } } });

        await db.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            type: "order_deduction",
            quantityChange: -totalQty,
            quantityBefore: before,
            quantityAfter: after,
            unitCost: null,  // Phase 2B: no COGS capture yet
            averageCostBefore: item.product.averageCost,
            averageCostAfter: item.product.averageCost,
            referenceType: "Order",
            referenceId: order.id,
            reason: `تأكيد الطلب #${order.id.slice(-8)} (Admin)`,
            performedByUserId: userId,
          },
        });
      }
      updateData.inventoryDeducted = true;
    }

    if (shouldRestore || shouldRestoreReturn) {
      // Phase 2B: Aggregate quantities by productId
      const productQuantities = new Map<string, number>();
      for (const item of order.items) {
        const key = item.variantId || item.productId;
        const current = productQuantities.get(key) || 0;
        productQuantities.set(key, current + item.quantity);
      }

      // Restore stock (aggregated)
      const restoredProducts = new Set<string>();
      for (const item of order.items) {
        if (!item.product.trackInventory) continue;

        const key = item.variantId || item.productId;
        if (restoredProducts.has(key)) continue; // Already restored
        restoredProducts.add(key);

        const totalQty = productQuantities.get(key)!;
        const before = item.variant ? item.variant.stock : item.product.stock;
        const after = before + totalQty;

        if (item.variantId) {
          await db.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: totalQty } } });
        }
        await db.product.update({ where: { id: item.productId }, data: { stock: { increment: totalQty } } });

        await db.inventoryMovement.create({
          data: {
            productId: item.productId,
            variantId: item.variantId ?? null,
            type: "order_restore",
            quantityChange: totalQty,
            quantityBefore: before,
            quantityAfter: after,
            unitCost: null,  // Phase 2B: no COGS reversal yet
            averageCostBefore: item.product.averageCost,
            averageCostAfter: item.product.averageCost,
            referenceType: "Order",
            referenceId: order.id,
            reason: newStatus === "cancelled" ? `إلغاء الطلب #${order.id.slice(-8)}` : `مرتجع الطلب #${order.id.slice(-8)}`,
            performedByUserId: userId,
          },
        });
      }
      updateData.inventoryDeducted = false;
    }

    updateData.status = newStatus;
    if (newStatus === "cancelled") updateData.cancelledAt = new Date();
    if (newStatus === "delivered") updateData.deliveredAt = new Date();

    // Record status history
    await db.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: prevStatus,
        toStatus: newStatus,
        performedByUserId: userId,
      },
    });
  }

  if (body.trackingNumber !== undefined) updateData.trackingNumber = body.trackingNumber || null;
  if (body.deliveryCompanyId !== undefined) updateData.deliveryCompanyId = body.deliveryCompanyId || null;
  if (body.adminNotes !== undefined) updateData.adminNotes = body.adminNotes || null;
  if (body.shippingFee !== undefined) {
    updateData.shippingFee = body.shippingFee;
    updateData.total = order.subtotal - order.discountTotal + body.shippingFee;
  }

  const updated = await db.order.update({
    where: { id: body.id },
    data: updateData,
    include: ORDER_INCLUDE,
  });

  void logAudit({
    action: "update_order",
    targetType: "Order",
    targetId: body.id,
    details: { status: body.status, tracking: body.trackingNumber },
  });

  return NextResponse.json({ order: fmtOrder(updated) });
}

export async function DELETE(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;
  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  const o = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!o) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
  await db.order.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } });
  void logAudit({ action: "delete", targetType: "Order", targetId: id, details: {} });
  return NextResponse.json({ success: true });
}
