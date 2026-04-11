import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-session";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

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
