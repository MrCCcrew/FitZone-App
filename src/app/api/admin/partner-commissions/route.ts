import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db, asDbTransactionClient } from "@/lib/db";
import { settleCommissionsTx } from "@/lib/commissions/commission-settlement-service";

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

    const existing = await db.partnerCommission.findUnique({
      where: { id: body.id },
      select: { id: true, status: true, withdrawnAt: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "العمولة غير موجودة." }, { status: 404 });
    }

    /* PARTNER_DIRECT_SETTLEMENT_SYSTEMIC */

    // Settled partner commission is financial history and cannot be reopened.
    if (existing.status === "withdrawn" && body.status === "pending") {
      return NextResponse.json(
        { error: "لا يمكن إعادة العمولة المسحوبة إلى معلقة من هذه الشاشة." },
        { status: 409 },
      );
    }

    // Direct manual settlement from Accounting screen.
    if (
      (body.status === "withdrawn" || body.status === "paid") &&
      existing.status !== "withdrawn"
    ) {
      const commission = await db.partnerCommission.findUnique({
        where: { id: body.id },
        select: {
          id: true,
          partnerId: true,
          status: true,
        },
      });

      if (!commission) {
        return NextResponse.json(
          { error: "العمولة غير موجودة." },
          { status: 404 },
        );
      }

      if (commission.status !== "pending") {
        return NextResponse.json(
          { error: "العمولة لم تعد معلقة. حدّث البيانات وحاول مرة أخرى." },
          { status: 409 },
        );
      }

      const result = await db.$transaction(async (tx) => {
        const payout = await settleCommissionsTx(
          asDbTransactionClient(tx),
          {
            commissionType: "partner",
            beneficiaryId: commission.partnerId,
            commissionIds: [commission.id],
            actorUserId: guard.session.user.id,
            paymentMethod: "admin_manual",
            notes:
              body.notes?.trim() ||
              "تسجيل عمولة شريك كمدفوعة يدويًا من شاشة المحاسبة",
          },
        );

        if (body.notes !== undefined) {
          await tx.partnerCommission.update({
            where: { id: commission.id },
            data: {
              notes: body.notes.trim() || null,
            },
          });
        }

        return payout;
      });

      return NextResponse.json({
        success: true,
        status: "withdrawn",
        payoutId: result.payout.id,
      });
    }

    // Notes-only edit remains allowed without changing financial state.
    if (body.notes !== undefined) {
      const updated = await db.partnerCommission.update({
        where: { id: body.id },
        data: {
          notes: body.notes.trim() || null,
        },
      });

      return NextResponse.json({
        success: true,
        status: updated.status,
      });
    }

    return NextResponse.json({
      success: true,
      status: existing.status,
    });
  } catch (error) {
    console.error("[ADMIN_PARTNER_COMMISSIONS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث العمولة." }, { status: 500 });
  }
}
