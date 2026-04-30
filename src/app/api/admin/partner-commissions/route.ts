import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
    };
  }

  const commissions = await db.partnerCommission.findMany({
    where,
    include: {
      partner: { select: { name: true, category: true } },
      userMembership: {
        include: {
          user: { select: { name: true, email: true } },
          membership: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const pending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const paid = commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);

  return NextResponse.json({
    commissions: commissions.map((c) => ({
      id: c.id,
      partnerName: c.partner.name,
      partnerCategory: c.partner.category,
      customerName: c.userMembership.user.name ?? "—",
      membershipName: c.userMembership.membership.name,
      paymentAmount: c.userMembership.paymentAmount,
      amount: c.amount,
      status: c.status === "withdrawn" ? "paid" : c.status,
      paidAt: c.withdrawnAt?.toISOString() ?? null,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
    })),
    summary: { pending, paid, total: pending + paid, count: commissions.length },
  });
}

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
    if (body.status === "withdrawn" || body.status === "paid") { data.status = "withdrawn"; data.withdrawnAt = new Date(); }
    else if (body.status === "pending") { data.status = "pending"; data.withdrawnAt = null; }
    if (body.notes !== undefined) data.notes = body.notes.trim() || null;

    const updated = await db.partnerCommission.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true, status: updated.status });
  } catch (error) {
    console.error("[ADMIN_PARTNER_COMMISSIONS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العمولة." }, { status: 500 });
  }
}
