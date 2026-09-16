import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseOrderReservation } from "@/lib/inventory-service";

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

  // Use header for authentication (safer than query string)
  const provided = req.headers.get("x-cron-secret") ?? "";
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

        // 4. Release reservation (Phase 2C: reservedStock -= quantity, stock unchanged)
        // Phase 2C: inventoryDeducted=false for pending orders (reservation only)
        await releaseOrderReservation(
          tx,
          order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          order.id
        );
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
