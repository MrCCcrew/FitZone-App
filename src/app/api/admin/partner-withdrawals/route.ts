import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db, asDbTransactionClient } from "@/lib/db";
import { settleCommissionsTx } from "@/lib/commissions/commission-settlement-service";

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

  try {
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
      if (existing.status !== "pending") {
        return NextResponse.json(
          { error: "لا يمكن اعتماد طلب تمت معالجته مسبقًا." },
          { status: 409 },
        );
      }

      // Snapshot boundary: only commissions that already existed when this
      // withdrawal request was created belong to this request.
      const eligibleCommissions = await db.partnerCommission.findMany({
        where: {
          partnerId: existing.partnerId,
          status: "pending",
          createdAt: { lte: existing.createdAt },
        },
        select: { id: true, amount: true },
      });

      const eligibleAmount =
        Math.round(
          eligibleCommissions.reduce((sum, commission) => sum + commission.amount, 0) * 100,
        ) / 100;

      const requestedAmount = Math.round(existing.amount * 100) / 100;

      if (eligibleAmount !== requestedAmount) {
        return NextResponse.json(
          {
            error:
              "رصيد العمولات المرتبط بطلب السحب تغيّر. لم يتم اعتماد الطلب لحماية السجل المالي.",
          },
          { status: 409 },
        );
      }

      const processedAt = new Date();

      /* COMMISSION_SETTLEMENT_PHASE_B1_PARTNER_WITHDRAWAL */

      await db.$transaction(async (tx) => {
        const dbtx = asDbTransactionClient(tx);

        // Preserve snapshot membership exactly. The settlement service receives
        // only the commissions already validated against request.createdAt
        // and requested amount above.
        await settleCommissionsTx(dbtx, {
          commissionType: "partner",
          beneficiaryId: existing.partnerId,
          commissionIds: eligibleCommissions.map(
            (commission) => commission.id,
          ),
          actorUserId: guard.session.user.id,

          // Stable business document makes retry idempotent.
          sourceType: "partner_withdrawal_request",
          sourceId: existing.id,

          paymentMethod: "partner_withdrawal",
          receiptUrl: body.receiptUrl?.trim() || existing.receiptUrl || null,
          notes:
            body.adminNotes?.trim() ||
            existing.adminNotes ||
            "اعتماد طلب سحب عمولات شريك",

          requestedAt: existing.createdAt,
          approvedAt: processedAt,
          paidAt: processedAt,
        });

        await tx.partnerWithdrawalRequest.update({
          where: { id: existing.id },
          data: {
            status: "approved",
            processedAt,
            ...(body.adminNotes !== undefined
              ? { adminNotes: body.adminNotes.trim() || null }
              : {}),
            ...(body.receiptUrl !== undefined
              ? { receiptUrl: body.receiptUrl.trim() || null }
              : {}),
          },
        });
      });

      return NextResponse.json({ success: true, status: "approved" });
    } else if (body.status === "rejected" && existing.status !== "rejected") {
      data.status = "rejected";
      data.processedAt = new Date();
    }

    const updated = await db.partnerWithdrawalRequest.update({ where: { id: body.id }, data });
    return NextResponse.json({ success: true, status: updated.status });
  } catch (error) {
    console.error("[ADMIN_PARTNER_WITHDRAWALS_PATCH]", error);
    return NextResponse.json({ error: "تعذر تحديث طلب السحب." }, { status: 500 });
  }
}
