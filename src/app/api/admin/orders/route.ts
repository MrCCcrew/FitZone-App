import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("orders");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user:  { select: { id: true, name: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });

  return NextResponse.json(orders.map(o => ({
    id:           o.id,
    customerId:   o.userId,
    customerName: o.user.name ?? "—",
    product:      o.items.map(i => i.product.name).join("، "),
    quantity:     o.items.reduce((s, i) => s + i.quantity, 0),
    total:        o.total,
    status:       o.status,
    date:         o.createdAt.toISOString().slice(0, 10),
  })));
}

export async function PATCH(req: Request) {
  const err = await checkAdmin(); if (err) return err;

  try {
    const { id, status } = await req.json();
    if (!id || !status) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

    // Get current order with items
    const order = await db.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });

    const previousStatus = order.status;

    await db.order.update({ where: { id }, data: { status } });

    // ── Sync inventory movements on status transitions ─────────────────────────

    const movingToCancelled = status === "cancelled" && previousStatus !== "cancelled";
    const movingFromCancelled = previousStatus === "cancelled" && status !== "cancelled";

    if (!movingToCancelled && !movingFromCancelled) {
      return NextResponse.json({ success: true });
    }

    // Fetch existing movements for this order once
    const existingMovements = await db.inventoryMovement.findMany({
      where: { referenceType: "order", referenceId: id },
      select: { productId: true, type: true },
    });

    for (const item of order.items) {
      const saleCount = existingMovements.filter(
        (m) => m.productId === item.productId && m.type === "sale",
      ).length;
      const returnCount = existingMovements.filter(
        (m) => m.productId === item.productId && m.type === "return",
      ).length;

      const product = await db.product.findUnique({ where: { id: item.productId } });
      if (!product) continue;

      if (movingToCancelled && returnCount < saleCount) {
        // Create return movement — restore stock
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
            referenceId: id,
          },
        });
      }

      if (movingFromCancelled && saleCount <= returnCount) {
        // Create sale movement — reduce stock again
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
            referenceId: id,
          },
        });
      }
    }

    void logAudit({ action: "update_status", targetType: "order", targetId: id, details: { from: previousStatus, to: status } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_ORDERS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث الطلب." }, { status: 500 });
  }
}
