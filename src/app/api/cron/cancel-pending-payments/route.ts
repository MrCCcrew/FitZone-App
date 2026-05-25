import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";

// ─── Called by cron every 30 min ─────────────────────────────────────────────
// */30 * * * * curl -s "https://fitzoneland.com/api/cron/cancel-pending-payments?secret=YOUR_SECRET" >> /var/log/fitzone-cron.log
//
// Logic:
//   - pending_payment memberships  30min–2h  old → send first warning push + in-app notification
//   - pending_payment memberships  22h–24h   old → send urgent "will be cancelled soon" push
//   - pending_payment memberships  ≥ 24h     old → cancel membership + its bookings + notify user

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron not configured" }, { status: 503 });

  const provided = new URL(req.url).searchParams.get("secret") ?? "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Time boundaries
  const ago30min = new Date(now.getTime() - 30 * 60 * 1000);
  const ago24h   = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // ── 1. Fetch all relevant pending_payment memberships ──────────────────────
  const pending = await db.userMembership.findMany({
    where: {
      status: "pending_payment",
      startDate: { lte: ago30min }, // at least 30 min old
    },
    include: {
      user: { select: { id: true, name: true } },
      membership: { select: { name: true } },
      bookings: { select: { id: true } },
    },
  });

  let warned1 = 0;   // first warning (30min–2h)
  let warned2 = 0;   // urgent warning (22h–24h)
  let cancelled = 0; // auto-cancelled (≥24h)

  for (const m of pending) {
    const age = now.getTime() - new Date(m.startDate).getTime();
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

    // ── A. Auto-cancel (≥ 24h) ────────────────────────────────────────────
    if (age >= 24 * 60 * 60 * 1000) {
      // Cancel the membership
      await db.userMembership.update({
        where: { id: m.id },
        data: { status: "cancelled" },
      });

      // Cancel all related confirmed bookings
      if (m.bookings.length > 0) {
        await db.booking.updateMany({
          where: {
            userMembershipId: m.id,
            status: { in: ["confirmed", "pending"] },
          },
          data: { status: "cancelled" },
        });
      }

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

      cancelled++;
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

    // ── C. First warning (30min–22h) ─────────────────────────────────────
    if (age >= 30 * 60 * 1000 && age < 22 * 60 * 60 * 1000) {
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

  console.log(`[CANCEL-PENDING] warned1=${warned1} warned2=${warned2} cancelled=${cancelled}`);
  return NextResponse.json({ ok: true, warned1, warned2, cancelled });
}
