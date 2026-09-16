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
    withdrawnAt: c.withdrawnAt?.toISOString() ?? null,
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

    const existing = await db.partnerCommission.findUnique({
      where: { id: body.id },
      select: { id: true, status: true, withdrawnAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "العمولة غير موجودة." }, { status: 404 });
    }

    // A withdrawn commission is settled financial history.
    // Never reopen it through a generic status PATCH.
    if (existing.status === "withdrawn" && body.status === "pending") {
      return NextResponse.json(
        { error: "لا يمكن إعادة العمولة المسحوبة إلى معلقة من هذه الشاشة." },
        { status: 409 },
      );
    }

    const data: Record<string, unknown> = {};
    if (body.status === "withdrawn" && existing.status !== "withdrawn") {
      data.status = "withdrawn";
      data.withdrawnAt = new Date();
    }
    else if (body.status === "pending") { data.status = "pending"; data.withdrawnAt = null; }
    if (body.notes !== undefined) data.notes = body.notes.trim() || null;

    const updated = await db.partnerCommission.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true, status: updated.status });
  } catch (err) {
    console.error("[PARTNER_COMMISSIONS_PATCH]", err);
    return NextResponse.json({ error: "تعذر تحديث العمولة." }, { status: 500 });
  }
}
