import { getOfferBoxCommissionTitle } from "@/lib/offer-box/commission-display";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });
  if (user.role !== "staff" && user.role !== "trainer" && user.role !== "admin") {
    return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  }

  const commissions = await db.staffCommission.findMany({
    where: { staffUserId: user.id },
    include: {
      offerBoxPurchase: {
        select: {
          id: true,
          offerSnapshot: true,
          priceSnapshot: true,
          user: { select: { name: true } },
        },
      },
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
      offerBoxPurchaseId: c.offerBoxPurchaseId,
      amount: c.amount,
      status: c.status,
      settledAt: c.settledAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      customerName: c.offerBoxPurchase?.user?.name ?? c.userMembership?.user?.name ?? "—",
      membershipName: getOfferBoxCommissionTitle(c.offerBoxPurchase?.offerSnapshot) ?? c.userMembership?.membership?.name ?? "—",
    })),
  });
}
