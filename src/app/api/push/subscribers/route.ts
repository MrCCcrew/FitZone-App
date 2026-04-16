import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

// Returns users who have at least one push subscription (for "selected" audience picker)
export async function GET() {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const subs = await db.pushSubscription.findMany({
    where: { userId: { not: null } },
    select: {
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Group by user, count subscriptions per user
  const map = new Map<string, { id: string; name: string | null; email: string | null; subscriptionCount: number }>();
  for (const sub of subs) {
    if (!sub.userId || !sub.user) continue;
    const existing = map.get(sub.userId);
    if (existing) {
      existing.subscriptionCount++;
    } else {
      map.set(sub.userId, {
        id: sub.user.id,
        name: sub.user.name,
        email: sub.user.email,
        subscriptionCount: 1,
      });
    }
  }

  return NextResponse.json({ users: Array.from(map.values()) });
}
