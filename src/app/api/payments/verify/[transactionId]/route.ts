import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { updatePaymentTransactionStatus, verifyPaymentTransaction } from "@/lib/payments/service";

export async function GET(req: Request, context: { params: Promise<{ transactionId: string }> }) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const { transactionId } = await context.params;
    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, userId: true, status: true },
    });

    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: "معاملة الدفع غير موجودة." }, { status: 404 });
    }

    const state = new URL(req.url).searchParams.get("state");
    if (
      state === "cancel" &&
      transaction.status !== "paid" &&
      transaction.status !== "failed" &&
      transaction.status !== "cancelled" &&
      transaction.status !== "expired"
    ) {
      const cancelled = await updatePaymentTransactionStatus(
        transactionId,
        "cancelled",
        "User returned from Paymob cancel flow.",
      );
      return NextResponse.json({ success: true, transaction: cancelled });
    }

    const result = await verifyPaymentTransaction(transactionId);
    return NextResponse.json({ success: true, transaction: result });
  } catch (error) {
    console.error("[PAYMENTS_VERIFY_GET]", error);
    const message = error instanceof Error ? error.message : "تعذر التحقق من حالة الدفع.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
