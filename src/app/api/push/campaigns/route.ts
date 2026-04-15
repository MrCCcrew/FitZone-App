import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await requireAdminFeature("push");
  if ("error" in guard) return guard.error;

  const [campaigns, totalSubs] = await Promise.all([
    db.pushCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { admin: { select: { name: true, email: true } } },
    }),
    db.pushSubscription.count(),
  ]);

  return NextResponse.json({
    totalSubs,
    campaigns: campaigns.map((c) => ({
      id:          c.id,
      title:       c.title,
      body:        c.body,
      url:         c.url,
      audience:    c.audience,
      sentCount:   c.sentCount,
      failedCount: c.failedCount,
      status:      c.status,
      createdAt:   c.createdAt,
      createdBy:   c.admin?.name ?? c.admin?.email ?? "—",
    })),
  });
}
