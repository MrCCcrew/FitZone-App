import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { listRecentPaymentTransactions, verifyPaymentTransaction } from "@/lib/payments/service";

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const transactions = await listRecentPaymentTransactions(100);
  return NextResponse.json(transactions);
}

// Actions: "re-verify" | "add-note" | "cancel"
export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

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
      select: { id: true, status: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "المعاملة غير موجودة." }, { status: 404 });
    }

    switch (body.action) {
      case "re-verify": {
        // Fetch latest status from payment provider (e.g., Paymob API)
        const transaction = await verifyPaymentTransaction(body.transactionId);
        return NextResponse.json({ success: true, transaction });
      }

      case "add-note": {
        if (!body.note?.trim()) {
          return NextResponse.json({ error: "الملاحظة مطلوبة." }, { status: 400 });
        }
        const withMeta = await db.paymentTransaction.findUnique({
          where: { id: body.transactionId },
          select: { metadata: true },
        });
        let existingMeta: Record<string, unknown> = {};
        try {
          if (withMeta?.metadata) existingMeta = JSON.parse(withMeta.metadata) as Record<string, unknown>;
        } catch { /* ignore */ }
        const updated = await db.paymentTransaction.update({
          where: { id: body.transactionId },
          data: {
            metadata: JSON.stringify({
              ...existingMeta,
              adminNote: body.note.trim(),
              adminNoteAt: new Date().toISOString(),
            }),
          },
        });
        return NextResponse.json({ success: true, transactionId: updated.id });
      }

      case "cancel": {
        if (existing.status === "paid") {
          return NextResponse.json({ error: "لا يمكن إلغاء معاملة مدفوعة بالفعل." }, { status: 400 });
        }
        const updated = await db.paymentTransaction.update({
          where: { id: body.transactionId },
          data: { status: "cancelled" },
        });
        return NextResponse.json({ success: true, transactionId: updated.id });
      }

      default:
        return NextResponse.json(
          { error: "إجراء غير معروف. الإجراءات المتاحة: re-verify, add-note, cancel." },
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

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "معرّف المعاملة مطلوب." }, { status: 400 });

    await db.paymentTransaction.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN_PAYMENTS_DELETE]", error);
    return NextResponse.json({ error: "تعذر حذف المعاملة." }, { status: 500 });
  }
}
