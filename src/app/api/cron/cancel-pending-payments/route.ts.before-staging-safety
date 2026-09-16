import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringifyJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

// ─── Called by cron every 5 min ───────────────────────────────────────────────
// */5 * * * * curl -s "https://fitzoneland.com/api/cron/cancel-pending-payments?secret=YOUR_SECRET" >> /var/log/fitzone-cron.log
//
// Logic:
//   - pending_payment memberships where pendingExpiresAt <= now → cancel membership, delete bookings, restore spots
//   - Legacy records with pendingExpiresAt=null are SKIPPED (require manual review)
//
// Race condition protection: cron and webhook compete atomically via updateMany
// with status=pending_payment condition. First one wins (count > 0), second gets count=0.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });

  const provided = new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // ── Fetch pending_payment memberships with pendingExpiresAt set ──────────
  const pending = await db.userMembership.findMany({
    where: {
      status: "pending_payment",
      pendingExpiresAt: { lte: now }, // Only process expired ones with explicit timeout
    },
    select: {
      id: true,
      userId: true,
      pendingExpiresAt: true,
      user: { select: { id: true, name: true } },
      membership: { select: { name: true } },
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, cancelled: 0 });
  }

  let cancelled = 0;

  for (const m of pending) {
    if (!m.pendingExpiresAt) {
      // Legacy record without explicit timeout - skip automatic cleanup
      console.log(`[CLEANUP] Membership ${m.id} has no pendingExpiresAt - skipping (manual review required)`);
      continue;
    }

    const userId = m.user.id;
    const planName = m.membership.name;

    try {
      await db.$transaction(async (tx) => {
        // ── 1. Race condition protection: atomic status change ───────────────
        // Check for any paid transactions BEFORE cancelling
        const paidTx = await tx.paymentTransaction.findFirst({
          where: {
            membershipId: m.id,
            status: "paid",
          },
          select: { id: true },
        });

        if (paidTx) {
          console.log(`[CLEANUP] Membership ${m.id} has paid transaction - skipping cleanup`);
          return;
        }

        // Atomic cancellation: cron vs webhook race
        const cancelResult = await tx.userMembership.updateMany({
          where: {
            id: m.id,
            status: "pending_payment", // atomic condition - only one wins
          },
          data: {
            status: "cancelled",
            pendingExpiresAt: null, // Clear timeout on cancellation
          },
        });

        if (cancelResult.count === 0) {
          // Webhook already activated it OR another cron instance won
          console.log(`[CLEANUP] Membership ${m.id} already processed (webhook won or duplicate cron)`);
          return;
        }

        console.log(`[CLEANUP] Cron won race for membership ${m.id} - proceeding with cleanup`);

        // ── 2. Get bookings with schedules ────────────────────────────────────
        const bookings = await tx.booking.findMany({
          where: { userMembershipId: m.id },
          select: {
            id: true,
            scheduleId: true,
            status: true,
            schedule: {
              select: {
                classId: true,
                date: true,
                time: true,
              },
            },
          },
        });

        // ── 2a. Save booking snapshot to PaymentTransaction metadata for late-payment recovery ──
        if (bookings.length > 0) {
          const paymentTx = await tx.paymentTransaction.findFirst({
            where: {
              membershipId: m.id,
              status: { in: ["pending", "requires_action"] },
            },
            select: { id: true, metadata: true },
          });

          if (paymentTx) {
            const existingMetadata = parseJson(paymentTx.metadata) ?? {};

            const bookingSnapshot = bookings.map((b) => ({
              scheduleId: b.scheduleId,
              classId: b.schedule.classId,
              date: b.schedule.date.toISOString(),
              time: b.schedule.time,
              status: b.status,
            }));

            const updatedMetadata = stringifyJson({
              ...existingMetadata,
              deletedBookingsSnapshot: {
                userMembershipId: m.id,
                bookings: bookingSnapshot,
                deletedAt: new Date().toISOString(),
                reason: "timeout_cleanup",
              },
            });

            if (updatedMetadata) {
              await tx.paymentTransaction.update({
                where: { id: paymentTx.id },
                data: { metadata: updatedMetadata },
              });

              console.log(`[CLEANUP] Saved booking snapshot (${bookings.length} bookings) for recovery`);
            }
          }
        }

        // ── 3. Cancel payment transactions ────────────────────────────────────
        await tx.paymentTransaction.updateMany({
          where: {
            membershipId: m.id,
            status: { in: ["pending", "requires_action"] },
          },
          data: { status: "cancelled" },
        });

        // ── 4. Delete bookings ────────────────────────────────────────────────
        await tx.booking.deleteMany({
          where: { userMembershipId: m.id },
        });

        // ── 5. Restore spots (grouped by schedule, with capacity protection) ──
        // Group bookings by scheduleId to update each schedule only once
        const spotRestorations = new Map<string, number>();
        for (const booking of bookings) {
          if (booking.status === "confirmed") {
            const current = spotRestorations.get(booking.scheduleId) ?? 0;
            spotRestorations.set(booking.scheduleId, current + 1);
          }
        }

        for (const [scheduleId, count] of spotRestorations) {
          const schedule = await tx.schedule.findUnique({
            where: { id: scheduleId },
            select: { availableSpots: true, class: { select: { maxSpots: true } } },
          });

          if (schedule) {
            const newSpots = schedule.availableSpots + count;
            const capacity = schedule.class.maxSpots;

            await tx.schedule.update({
              where: { id: scheduleId },
              data: {
                availableSpots: Math.min(newSpots, capacity), // never exceed capacity
              },
            });
          }
        }

        // ── 6. Notify user ────────────────────────────────────────────────────
        await tx.notification.create({
          data: {
            userId,
            title: "❌ تم إلغاء اشتراكك تلقائيًا",
            body: `تم إلغاء اشتراك "${planName}" لعدم إتمام الدفع خلال 60 دقيقة. يمكنك الاشتراك مرة أخرى في أي وقت.`,
            type: "error",
          },
        });
      });

      // Send push notification outside transaction (non-critical)
      const subs = await db.pushSubscription.findMany({ where: { userId } });
      for (const sub of subs) {
        const res = await sendOnePush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          {
            title: "❌ تم إلغاء اشتراكك",
            body: `"${planName}" — لم يتم الدفع خلال 60 دقيقة، تم الإلغاء تلقائيًا.`,
            url: "/account?tab=membership",
          },
        );
        if (res.expired) {
          await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => null);
        }
      }

      cancelled++;
    } catch (err) {
      console.error(`[CLEANUP] Failed to cancel membership ${m.id}:`, err);
    }
  }

  console.log(`[CLEANUP] Processed ${pending.length} pending memberships, cancelled ${cancelled}`);
  return NextResponse.json({ ok: true, cancelled });
}
