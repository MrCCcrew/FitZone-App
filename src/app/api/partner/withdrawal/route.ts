import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

const MIN_WITHDRAWAL = 500;

export async function GET() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await db.partner.findUnique({
    where: { userId: guard.session.user.id },
    select: { id: true, commissionRate: true, commissionType: true },
  });
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  const [commissions, requests] = await Promise.all([
    db.partnerCommission.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
    db.partnerWithdrawalRequest.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalWithdrawn = commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);
  const canRequest = totalPending >= MIN_WITHDRAWAL;

  return NextResponse.json({
    totalPending,
    totalWithdrawn,
    canRequest,
    minWithdrawal: MIN_WITHDRAWAL,
    requests: requests.map((r) => ({
      id: r.id,
      amount: r.amount,
      status: r.status,
      adminNotes: r.adminNotes,
      receiptUrl: r.receiptUrl,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await db.partner.findUnique({
    where: { userId: guard.session.user.id },
    select: { id: true },
  });
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  const pendingCommissions = await db.partnerCommission.findMany({
    where: { partnerId: partner.id, status: "pending" },
  });
  const totalPending = pendingCommissions.reduce((s, c) => s + c.amount, 0);

  if (totalPending < MIN_WITHDRAWAL) {
    return NextResponse.json(
      { error: `الحد الأدنى للسحب هو ${MIN_WITHDRAWAL} جنيه. رصيدك الحالي ${totalPending.toFixed(2)} جنيه.` },
      { status: 400 },
    );
  }

  const existing = await db.partnerWithdrawalRequest.findFirst({
    where: { partnerId: partner.id, status: "pending" },
  });
  if (existing) {
    return NextResponse.json({ error: "يوجد طلب سحب معلّق بالفعل. انتظر حتى يتم مراجعته." }, { status: 400 });
  }

  const request = await db.partnerWithdrawalRequest.create({
    data: { partnerId: partner.id, amount: totalPending },
  });

  return NextResponse.json({ success: true, id: request.id, amount: totalPending });
}
