import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Phase 2B: Pending Orders Timeout Cron
 *
 * Automatically cancels pending orders older than 1 hour
 * with race condition protection against payment webhooks
 *
 * Cron schedule: every 5 minutes
 */

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }

  const provided = new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Find pending orders older than 1 hour
  const pending = await db.order.findMany({
    where: {
      status: "pending",
      createdAt: { lte: oneHourAgo },
    },
    select: {
      id: true,
      createdAt: true,
      inventoryDeducted: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              stock: true,
              trackInventory: true,
              averageCost: true,
            },
          },
        },
      },
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  let expired = 0;

  for (const order of pending) {
    try {
      await db.$transaction(async (tx) => {
        // 1. Atomic claim: expire payment transactions first
        await tx.paymentTransaction.updateMany({
          where: {
            orderId: order.id,
            status: { in: ["pending", "requires_action"] },
          },
          data: { status: "expired" },
        });

        // 2. Atomic claim: cancel order (only if still pending)
        const cancelResult = await tx.order.updateMany({
          where: {
            id: order.id,
            status: "pending", // Guard: only if still pending
          },
          data: {
            status: "expired",
            cancelledAt: now,
          },
        });

        if (cancelResult.count === 0) {
          // Already processed by webhook or another cron run
          console.log(`[CRON] Order ${order.id} already processed`);
          return;
        }

        // 3. Double-check: no paid payment (race guard)
        const paidPayment = await tx.paymentTransaction.findFirst({
          where: { orderId: order.id, status: "paid" },
        });

        if (paidPayment) {
          // Payment confirmed during this transaction - rollback
          throw new Error("PAYMENT_CONFIRMED_RACE");
        }

        // 4. Restore stock if deducted
        if (order.inventoryDeducted) {
          // Aggregate quantities by productId
          const productQuantities = new Map<string, number>();
          for (const item of order.items) {
            const current = productQuantities.get(item.productId) || 0;
            productQuantities.set(item.productId, current + item.quantity);
          }

          // Restore stock
          for (const [productId, totalQuantity] of productQuantities) {
            const item = order.items.find((i) => i.productId === productId);
            if (!item || !item.product.trackInventory) continue;

            const product = item.product;

            await tx.product.update({
              where: { id: productId },
              data: { stock: { increment: totalQuantity } },
            });

            await tx.inventoryMovement.create({
              data: {
                productId,
                type: "order_restore",
                quantityChange: totalQuantity,
                quantityBefore: product.stock,
                quantityAfter: product.stock + totalQuantity,
                unitCost: null,
                averageCostBefore: product.averageCost,
                averageCostAfter: product.averageCost,
                referenceType: "Order",
                referenceId: order.id,
                reason: "انتهت صلاحية الطلب (مهلة ساعة واحدة)",
              },
            });
          }

          // Reset inventory flag
          await tx.order.update({
            where: { id: order.id },
            data: { inventoryDeducted: false },
          });
        }
      });

      expired++;
    } catch (err) {
      if (err instanceof Error && err.message === "PAYMENT_CONFIRMED_RACE") {
        // Expected race - payment confirmed while cron running
        console.log(`[CRON] Payment confirmed during timeout for order ${order.id}`);
      } else {
        console.error(`[CRON] Failed to expire order ${order.id}:`, err);
      }
    }
  }

  console.log(`[CRON] Processed ${pending.length} pending orders, expired ${expired}`);
  return NextResponse.json({ ok: true, expired });
}
