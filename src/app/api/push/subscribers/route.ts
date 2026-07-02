import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

// Returns all members with their push subscription count (0 = no push enabled)
export async function GET() {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const [members, subs] = await Promise.all([
    db.user.findMany({
      where: { role: "member" },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
    }),
    db.pushSubscription.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _count: { id: true },
    }),
  ]);

  const subCountMap = new Map<string, number>();
  for (const s of subs) {
    if (s.userId) subCountMap.set(s.userId, s._count.id);
  }

  const users = members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    subscriptionCount: subCountMap.get(m.id) ?? 0,
  }));

  return NextResponse.json({ users });
}
