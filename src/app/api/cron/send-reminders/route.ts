import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";

// Called by a Linux cron job every 30 min via:
//   */30 * * * * curl "https://fitzoneland.com/api/cron/send-reminders?secret=YOUR_SECRET"
//
// Set CRON_SECRET in .env to protect this endpoint.

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
  // Window: slots starting between 4h30m and 5h30m from now
  const windowStart = new Date(now.getTime() + 4.5 * 60 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

  const DAY_NAMES: Record<number, string> = {
    0: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء",
    4: "الخميس", 5: "الجمعة", 6: "السبت",
  };

  const bookings = await db.booking.findMany({
    where: {
      status: "confirmed",
      reminderSentAt: null,
      schedule: { isActive: true },
    },
    include: {
      user:     { select: { id: true, name: true } },
      schedule: {
        include: { class: { include: { trainer: { select: { name: true } } } } },
      },
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const booking of bookings) {
    // Compute exact slot datetime
    const slotDate = new Date(booking.schedule.date);
    const [h, m] = booking.schedule.time.split(":").map(Number);
    slotDate.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);

    if (slotDate < windowStart || slotDate > windowEnd) continue;

    // Get all push subscriptions for this user
    const subs = await db.pushSubscription.findMany({
      where: { userId: booking.user.id },
    });

    // Mark reminder sent regardless — avoids duplicate attempts
    await db.booking.update({
      where: { id: booking.id },
      data: { reminderSentAt: now },
    });

    if (subs.length === 0) {
      skipped++;
      continue;
    }

    const dayLabel = DAY_NAMES[slotDate.getDay()] ?? "";
    const title = `تذكير بموعدك في FitZone 💪`;
    const body  =
      `${booking.schedule.class.name} مع ${booking.schedule.class.trainer.name}` +
      ` — ${dayLabel} الساعة ${booking.schedule.time}`;

    let userSent = false;
    for (const sub of subs) {
      const result = await sendOnePush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        { title, body, url: "/account" },
      );
      if (result.ok) userSent = true;
      // Remove expired/invalid subscriptions automatically
      if (result.expired) {
        await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } }).catch(() => null);
      }
    }

    if (userSent) sent++;
    else skipped++;
  }

  console.log(`[REMINDERS] sent=${sent} skipped=${skipped}`);
  return NextResponse.json({ ok: true, sent, skipped });
}
