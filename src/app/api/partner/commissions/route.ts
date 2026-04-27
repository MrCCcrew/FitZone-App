import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET() {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;

  const partner = await db.partner.findUnique({
    where: { userId: guard.session.user.id },
    select: { id: true },
  });
  if (!partner) return NextResponse.json({ error: "ملف الشريك غير موجود." }, { status: 404 });

  const commissions = await db.partnerCommission.findMany({
    where: { partnerId: partner.id },
    include: {
      userMembership: {
        include: {
          user: { select: { name: true, email: true, phone: true } },
          membership: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(commissions.map((c) => ({
    id: c.id,
    amount: c.amount,
    status: c.status,
    paidAt: c.paidAt?.toISOString() ?? null,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    customerName: c.userMembership.user.name ?? "—",
    customerEmail: c.userMembership.user.email ?? "—",
    customerPhone: c.userMembership.user.phone ?? "—",
    membershipName: c.userMembership.membership.name,
    paymentAmount: c.userMembership.paymentAmount,
  })));
}

// Admin can mark commissions as paid
export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as { id?: string; status?: string; notes?: string };
    if (!body.id) return NextResponse.json({ error: "معرّف العمولة مطلوب." }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.status === "paid") { data.status = "paid"; data.paidAt = new Date(); }
    else if (body.status === "pending") { data.status = "pending"; data.paidAt = null; }
    if (body.notes !== undefined) data.notes = body.notes.trim() || null;

    const updated = await db.partnerCommission.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true, status: updated.status });
  } catch (err) {
    console.error("[PARTNER_COMMISSIONS_PATCH]", err);
    return NextResponse.json({ error: "تعذر تحديث العمولة." }, { status: 500 });
  }
}
