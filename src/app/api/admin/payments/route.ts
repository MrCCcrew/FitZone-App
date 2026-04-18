import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { listRecentPaymentTransactions, updatePaymentTransactionStatus } from "@/lib/payments/service";

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const transactions = await listRecentPaymentTransactions(100);
  return NextResponse.json(transactions);
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as {
      transactionId?: string;
      status?: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
      note?: string;
    };

    if (!body.transactionId || !body.status) {
      return NextResponse.json({ error: "بيانات تحديث حالة الدفع غير مكتملة." }, { status: 400 });
    }

    const transaction = await updatePaymentTransactionStatus(body.transactionId, body.status, body.note ?? null);
    return NextResponse.json({ success: true, transaction });
  } catch (error) {
    console.error("[ADMIN_PAYMENTS_PATCH]", error);
    const message = error instanceof Error ? error.message : "تعذر تحديث حالة المعاملة.";
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
