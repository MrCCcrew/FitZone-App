import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { sendOnePush } from "@/lib/push";

type SendBody = {
  title: string;
  body: string;
  url?: string;
  audience: "all" | "active" | "inactive" | "selected";
  selectedUserIds?: string[];
  /** Send test push to the admin's own subscription */
  test?: boolean;
};

const BATCH = 50;

export async function POST(req: Request) {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const { title, body, url, audience, selectedUserIds, test } =
    (await req.json()) as SendBody;

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "العنوان والنص مطلوبان" }, { status: 400 });
  }

  const payload = { title, body, url: url?.trim() || "/" };

  // ── Test mode: send only to the admin's own subscriptions ──────────────────
  if (test) {
    const adminSubs = await db.pushSubscription.findMany({
      where: { userId: guard.session.user.id },
    });
    if (adminSubs.length === 0) {
      return NextResponse.json(
        { error: "لا يوجد اشتراك push مسجّل لحسابك. افتح الموقع وفعّل الإشعارات أولاً." },
        { status: 404 },
      );
    }
    const result = await sendOnePush(
      { endpoint: adminSubs[0].endpoint, keys: { p256dh: adminSubs[0].p256dh, auth: adminSubs[0].auth } },
      payload,
    );
    if (result.expired) {
      await db.pushSubscription.delete({ where: { id: adminSubs[0].id } });
    }
    return NextResponse.json({ ok: result.ok, test: true });
  }

  // ── Build target user ID list ───────────────────────────────────────────────
  let targetUserIds: string[] | null = null;

  if (audience === "active") {
    const rows = await db.userMembership.findMany({
      where: { status: "active", endDate: { gt: new Date() } },
      select: { userId: true },
      distinct: ["userId"],
    });
    targetUserIds = rows.map((r) => r.userId);

  } else if (audience === "inactive") {
    const activeIds = (
      await db.userMembership.findMany({
        where: { status: "active", endDate: { gt: new Date() } },
        select: { userId: true },
        distinct: ["userId"],
      })
    ).map((r) => r.userId);

    const allMembers = await db.user.findMany({
      where: { role: "member" },
      select: { id: true },
    });
    targetUserIds = allMembers.map((u) => u.id).filter((id) => !activeIds.includes(id));

  } else if (audience === "selected") {
    targetUserIds = Array.isArray(selectedUserIds) ? selectedUserIds : [];
  }
  // audience === "all" → targetUserIds stays null → fetch all subs

  const subs = await db.pushSubscription.findMany({
    where: targetUserIds !== null ? { userId: { in: targetUserIds } } : {},
  });

  if (subs.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, cleaned: 0 });
  }

  // ── Send in batches ─────────────────────────────────────────────────────────
  let sentCount = 0;
  let failedCount = 0;
  const expiredIds: string[] = [];

  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (sub) => {
        const res = await sendOnePush(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        if (res.expired) expiredIds.push(sub.id);
        res.ok ? sentCount++ : failedCount++;
      }),
    );
  }

  // ── Remove expired subscriptions ────────────────────────────────────────────
  if (expiredIds.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }

  // ── Persist campaign log ────────────────────────────────────────────────────
  await db.pushCampaign.create({
    data: {
      title,
      body,
      url: payload.url,
      audience,
      selectedUsers: targetUserIds ? JSON.stringify(targetUserIds) : null,
      sentCount,
      failedCount,
      status: sentCount === 0 ? "failed" : failedCount > 0 ? "partial" : "done",
      createdBy: guard.session.user.id,
    },
  });

  return NextResponse.json({ ok: true, sent: sentCount, failed: failedCount, cleaned: expiredIds.length });
}
