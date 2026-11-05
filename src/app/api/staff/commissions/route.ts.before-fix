import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  if (user.role !== "staff" && user.role !== "trainer" && user.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  }

  const commissions = await db.agentCommission.findMany({
    where: { agentUserId: user.id },
    include: {
      userMembership: {
        include: {
          user: { select: { name: true } },
          membership: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    commissions: commissions.map((c) => ({
      id: c.id,
      amount: c.amount,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
    })),
  });
}
