import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const requests = await db.partnerWithdrawalRequest.findMany({
    include: { partner: { select: { name: true, category: true, contactPhone: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    requests.map((r) => ({
      id: r.id,
      partnerName: r.partner.name,
      partnerCategory: r.partner.category,
      partnerPhone: r.partner.contactPhone,
      amount: r.amount,
      status: r.status,
      adminNotes: r.adminNotes,
      receiptUrl: r.receiptUrl,
      createdAt: r.createdAt.toISOString(),
      processedAt: r.processedAt?.toISOString() ?? null,
    })),
  );
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: string;
    status?: string;
    adminNotes?: string;
    receiptUrl?: string;
  };
  if (!body.id) return NextResponse.json({ error: "معرّف الطلب مطلوب." }, { status: 400 });

  const existing = await db.partnerWithdrawalRequest.findUnique({ where: { id: body.id } });
  if (!existing) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.adminNotes !== undefined) data.adminNotes = body.adminNotes.trim() || null;
  if (body.receiptUrl !== undefined) data.receiptUrl = body.receiptUrl.trim() || null;

  if (body.status === "approved" && existing.status !== "approved") {
    data.status = "approved";
    data.processedAt = new Date();
    // Mark all pending commissions for this partner as withdrawn
    await db.partnerCommission.updateMany({
      where: { partnerId: existing.partnerId, status: "pending" },
      data: { status: "withdrawn", withdrawnAt: new Date() },
    });
  } else if (body.status === "rejected" && existing.status !== "rejected") {
    data.status = "rejected";
    data.processedAt = new Date();
  }

  const updated = await db.partnerWithdrawalRequest.update({ where: { id: body.id }, data });
  return NextResponse.json({ success: true, status: updated.status });
}
