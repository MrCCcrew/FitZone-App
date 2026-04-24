import { NextResponse } from "next/server";
import { requireAdminFeature, requireAdminMasterAccess } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { listRecentPaymentTransactions, verifyPaymentTransaction } from "@/lib/payments/service";

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  const transactions = await listRecentPaymentTransactions(100);
  return NextResponse.json(transactions);
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  try {
    const body = (await req.json()) as {
      transactionId?: string;
      action?: string;
      note?: string;
    };

    if (!body.transactionId) {
      return NextResponse.json({ error: "معرّف المعاملة مطلوب." }, { status: 400 });
    }

    const existing = await db.paymentTransaction.findUnique({
      where: { id: body.transactionId },
      select: { id: true, metadata: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "المعاملة غير موجودة." }, { status: 404 });
    }

    switch (body.action) {
      case "re-verify": {
        const transaction = await verifyPaymentTransaction(body.transactionId);
        return NextResponse.json({ success: true, transaction });
      }

      case "add-note": {
        if (!body.note?.trim()) {
          return NextResponse.json({ error: "الملاحظة مطلوبة." }, { status: 400 });
        }

        let metadata: Record<string, unknown> = {};
        try {
          if (existing.metadata) metadata = JSON.parse(existing.metadata) as Record<string, unknown>;
        } catch {
          metadata = {};
        }

        await db.paymentTransaction.update({
          where: { id: body.transactionId },
          data: {
            metadata: JSON.stringify({
              ...metadata,
              adminNote: body.note.trim(),
              adminNoteAt: new Date().toISOString(),
            }),
          },
        });

        return NextResponse.json({ success: true, transactionId: body.transactionId });
      }

      default:
        return NextResponse.json(
          { error: "الإجراءات المتاحة فقط: re-verify, add-note." },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[ADMIN_PAYMENTS_PATCH]", error);
    const message = error instanceof Error ? error.message : "تعذر تنفيذ الإجراء.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  try {
    const body = (await req.json()) as {
      transactionId?: string;
    };

    if (!body.transactionId) {
      return NextResponse.json({ error: "معرّف المعاملة مطلوب." }, { status: 400 });
    }

    const existing = await db.paymentTransaction.findUnique({
      where: { id: body.transactionId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "المعاملة غير موجودة." }, { status: 404 });
    }

    await db.paymentTransaction.delete({
      where: { id: body.transactionId },
    });

    return NextResponse.json({ success: true, transactionId: body.transactionId });
  } catch (error) {
    console.error("[ADMIN_PAYMENTS_DELETE]", error);
    const message = error instanceof Error ? error.message : "تعذر حذف المعاملة.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
