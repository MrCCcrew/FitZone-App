import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export async function GET(req: Request) {
  const auth = await requireAdminFeature("rewards");
  if ("error" in auth) return auth.error;

  const referrals = await db.referral.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { referredCount: "desc" },
  });

  return NextResponse.json(
    referrals.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      userEmail: r.user.email,
      code: r.code,
      referredCount: r.referredCount,
      totalEarned: r.totalEarned,
    })),
  );
}
