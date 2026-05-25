import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";

// ─── Called by cron every 30 min ─────────────────────────────────────────────
// */30 * * * * curl -s "https://fitzoneland.com/api/cron/cancel-pending-payments?secret=YOUR_SECRET" >> /var/log/fitzone-cron.log
//
// Logic (age = time since PaymentTransaction.createdAt, i.e. when the user pressed "Pay"):
//   - pending_payment memberships  30min–2h  old → send first warning push + in-app notification
//   - pending_payment memberships  22h–24h   old → send urgent "will be deleted soon" push
//   - pending_payment memberships  ≥ 24h     old → DELETE membership + its bookings + cancel TX + notify user

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });

  const provided = new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // ── 1. Fetch ALL pending_payment memberships ──────────────────────────────
  // We don't filter by startDate here — startDate can be a future membership date,
  // which is NOT the time the customer initiated payment.
  const pending = await db.userMembership.findMany({
    where: { status: "pending_payment" },
    include: {
      user: { select: { id: true, name: true } },
      membership: { select: { name: true } },
      bookings: { select: { id: true } },
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, warned1: 0, warned2: 0, deleted: 0 });
  }

  // ── 2. Fetch payment transactions for all pending memberships ──────────────
  // TX.createdAt = when the user first pressed "Pay" → the real 24 h timer start
  const membershipIds = pending.map((m) => m.id);
  const txList = await db.paymentTransaction.findMany({
    where: {
      membershipId: { in: membershipIds },
      status: { in: ["pending", "requires_action"] },
    },
    select: { membershipId: true, id: true, createdAt: true },
    orderBy: { createdAt: "asc" }, // oldest first → get the initial payment attempt
  });

  // Build map: membershipId → oldest TX createdAt (when payment was first initiated)
  const txCreatedAtMap = new Map<string, Date>();
  for (const tx of txList) {
    if (tx.membershipId && !txCreatedAtMap.has(tx.membershipId)) {
      txCreatedAtMap.set(tx.membershipId, tx.createdAt);
    }
  }

  let warned1 = 0;
  let warned2 = 0;
  let deleted = 0;

  for (const m of pending) {
    // Use TX.createdAt as the reference; fall back to startDate only if no TX found
    const refTime = txCreatedAtMap.get(m.id) ?? new Date(m.startDate);
    const age = now.getTime() - refTime.getTime();
    const userId = m.user.id;
    const planName = m.membership.name;

    // ── Helper: send push to user ──────────────────────────────────────────
    const pushUser = async (title: string, body: string) => {
      const subs = await db.pushSubscription.findMany({ where: { userId } });
      for (const sub of subs) {
        const res = await sendOnePush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          { title, body, url: "/account?tab=membership" },
        );
        if (res.expired) {
          await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => null);
        }
      }
    };

    // ── Helper: create in-app notification ────────────────────────────────
    const notify = (title: string, body: string, type: "warning" | "error" | "info" = "warning") =>
      db.notification.create({ data: { userId, title, body, type } });

    // ── A. Auto-delete (≥ 24h) ────────────────────────────────────────────
    if (age >= 24 * 60 * 60 * 1000) {
      try {
        // 1. Cancel pending payment transactions
        await db.paymentTransaction.updateMany({
          where: { membershipId: m.id, status: { in: ["pending", "requires_action"] } },
          data: { status: "cancelled" },
        });

        // 2. Delete all bookings tied to this membership
        await db.booking.deleteMany({
          where: { userMembershipId: m.id },
        });

        // 3. Delete the membership itself (cascades commission records)
        await db.userMembership.delete({
          where: { id: m.id },
        });

        // In-app notification
        await notify(
          "❌ تم إلغاء اشتراكك تلقائيًا",
          `تم إلغاء اشتراك "${planName}" لعدم إتمام الدفع خلال 24 ساعة. يمكنك الاشتراك مرة أخرى في أي وقت.`,
          "error",
        );

        // Push notification
        await pushUser(
          "❌ تم إلغاء اشتراكك",
          `"${planName}" — لم يتم الدفع خلال 24 ساعة، تم الإلغاء تلقائيًا.`,
        );

        deleted++;
      } catch (err) {
        console.error(`[CANCEL-PENDING] Failed to delete membership ${m.id}:`, err);
      }
      continue;
    }

    // ── B. Urgent warning (22h–24h) ───────────────────────────────────────
    if (age >= 22 * 60 * 60 * 1000) {
      // Only send once — check if we already sent an urgent notification
      const alreadySent = await db.notification.findFirst({
        where: {
          userId,
          title: { contains: "⚠️ آخر فرصة" },
          createdAt: { gte: ago24h },
        },
      });
      if (!alreadySent) {
        await notify(
          "⚠️ آخر فرصة لإتمام الدفع!",
          `اشتراك "${planName}" سيُلغى خلال ساعتين تقريبًا إذا لم تُكمل الدفع الآن. اضغطي هنا للدفع الفوري.`,
          "error",
        );
        await pushUser(
          "⚠️ آخر فرصة! اشتراكك على وشك الإلغاء",
          `"${planName}" — أكملي الدفع الآن قبل الإلغاء التلقائي.`,
        );
        warned2++;
      }
      continue;
    }

    // ── C. First warning (30min–22h) ──────────────────────────────────────
    if (age >= 30 * 60 * 1000) {
      // Only send once — check if we already sent a first warning
      const alreadySent = await db.notification.findFirst({
        where: {
          userId,
          title: { contains: "⏳" },
          body: { contains: planName },
          createdAt: { gte: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
        },
      });
      if (!alreadySent) {
        await notify(
          "⏳ أكملي الدفع لتفعيل اشتراكك",
          `اشتراكك في "${planName}" في انتظار إتمام الدفع. لديكِ 24 ساعة فقط لإتمام الدفع وإلا سيُلغى الاشتراك تلقائيًا.`,
          "warning",
        );
        await pushUser(
          "⏳ أكملي الدفع لتفعيل اشتراكك",
          `"${planName}" — لديكِ 24 ساعة فقط لإتمام الدفع.`,
        );
        warned1++;
      }
    }
  }

  console.log(`[CANCEL-PENDING] warned1=${warned1} warned2=${warned2} deleted=${deleted}`);
  return NextResponse.json({ ok: true, warned1, warned2, deleted });
}
