import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { verifyPaymentTransaction, updatePaymentTransactionStatus } from "@/lib/payments/service";

export async function POST(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  try {
    const { transactionId, forceActivate } = (await req.json()) as {
      transactionId?: string;
      forceActivate?: boolean;
    };

    if (!transactionId) {
      return NextResponse.json({ error: "transactionId مطلوب." }, { status: 400 });
    }

    const transaction = await db.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, status: true, userId: true, membershipId: true, provider: true },
    });

    if (!transaction) {
      return NextResponse.json({ error: "معاملة الدفع غير موجودة." }, { status: 404 });
    }

    if (forceActivate) {
      // Never convert a Paymob transaction to paid without provider proof.
      // A manual status write bypasses amount/order ownership verification,
      // customer financial settlement and the payment webhook CAS barrier.
      if (transaction.provider === "paymob") {
        return NextResponse.json(
          { error: "لا يمكن تفعيل دفعة Paymob يدويًا دون تأكيد الدفع من Paymob. استخدم التحقق من الدفع." },
          { status: 409 },
        );
      }
      const result = await updatePaymentTransactionStatus(transactionId, "paid", "تفعيل يدوي من الأدمن");
      return NextResponse.json({ success: true, transaction: result, method: "force" });
    }

    const result = await verifyPaymentTransaction(transactionId);
    return NextResponse.json({ success: true, transaction: result, method: "verify" });
  } catch (error) {
    console.error("[ADMIN_PAYMENTS_VERIFY]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "حدث خطأ." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const guard = await requireAdminFeature("settings");
  if ("error" in guard) return guard.error;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId مطلوب." }, { status: 400 });
  }

  const transactions = await db.paymentTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      amount: true,
      purpose: true,
      provider: true,
      externalReference: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ transactions });
}
