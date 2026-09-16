import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";
import { cleanupExpiredPendingMembership } from "@/lib/payments/pending-membership-cleanup";
import { expireEndedActiveMembershipsTx } from "@/lib/membership-lifecycle";
import { extendRecurringSchedules } from "@/lib/schedule-maintenance";

// Called every 5 minutes in production.
// Staging MUST never execute the real cleanup cron.
export async function GET(req: Request) {
  if (process.env.APP_ENV === "staging") {
    return Response.json(
      { error: "Cron disabled in staging" },
      { status: 403 },
    );
  }

  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }

  /*
   * Support the secure header used by server cron.
   * Keep the old query-string method temporarily for backward compatibility.
   */
  const url = new URL(req.url);

  const provided =
    req.headers.get("x-cron-secret") ??
    url.searchParams.get("secret") ??
    "";

  if (provided !== secret) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const now = new Date();

  /*
   * First materialize/reconcile entitlement.
   *
   * This must run BEFORE contractual expiration so an under-entitled
   * membership can receive its specifically marked make-up booking first.
   * The lifecycle step can then expire the membership normally while
   * preserving its attendance pass only when a confirmed make-up exists.
   */
  const scheduleMaintenance =
    await extendRecurringSchedules(now);

  /*
   * Contractual expiration remains authoritative.
   * A make-up booking does not extend endDate or reactivate membership.
   */
  const expiration = await db.$transaction((tx) =>
    expireEndedActiveMembershipsTx(tx, now),
  );

  const pending = await db.userMembership.findMany({
    where: {
      status: "pending_payment",
      pendingExpiresAt: {
        lte: now,
      },
    },
    select: {
      id: true,
    },
  });

  if (pending.length === 0) {
    return NextResponse.json({
      ok: true,
      found: 0,
      cancelled: 0,
      expiredMemberships: expiration.expired,
      expiredAttendancePasses: expiration.attendancePassesExpired,
      scheduleMaintenance,
    });
  }

  let cancelled = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const membership of pending) {
    try {
      const result = await cleanupExpiredPendingMembership(
        membership.id,
        now,
      );

      if (!result.cleaned) {
        skipped++;

        console.info(
          `[CLEANUP] Membership ${membership.id} skipped: ${result.reason}`,
        );

        continue;
      }

      cancelled++;

      // Push notification is intentionally outside the DB transaction.
      try {
        const subscriptions = await db.pushSubscription.findMany({
          where: {
            userId: result.userId,
          },
        });

        for (const subscription of subscriptions) {
          const pushResult = await sendOnePush(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            {
              title: "❌ تم إلغاء اشتراكك",
              body:
                `"${result.planName}" — لم يتم الدفع خلال 60 دقيقة، ` +
                "تم الإلغاء تلقائيًا.",
              url: "/account?tab=membership",
            },
          );

          if (pushResult.expired) {
            await db.pushSubscription
              .delete({
                where: {
                  endpoint: subscription.endpoint,
                },
              })
              .catch(() => null);
          }
        }
      } catch (pushError) {
        console.error(
          `[CLEANUP_PUSH] Membership ${membership.id}:`,
          pushError,
        );
      }
    } catch (error) {
      failures.push(membership.id);

      console.error(
        `[CLEANUP] Failed membership ${membership.id}:`,
        error,
      );
    }
  }

  console.info(
    `[CLEANUP] Found ${pending.length}, ` +
    `cancelled ${cancelled}, skipped ${skipped}, failed ${failures.length}`,
  );

  return NextResponse.json({
    ok: failures.length === 0,
    found: pending.length,
    cancelled,
    skipped,
    failed: failures.length,
    failedMembershipIds: failures,
    expiredMemberships: expiration.expired,
    expiredAttendancePasses: expiration.attendancePassesExpired,
    scheduleMaintenance,
  });
}
