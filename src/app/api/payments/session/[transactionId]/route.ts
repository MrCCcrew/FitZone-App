import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

function parseJson(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_: Request, context: { params: Promise<{ transactionId: string }> }) {
  const user = await getCurrentAppUser();
  if (!user?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
  }

  const { transactionId } = await context.params;
  const transaction = await db.paymentTransaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      provider: true,
      status: true,
      amount: true,
      currency: true,
      purpose: true,
      checkoutUrl: true,
      iframeUrl: true,
      providerPayload: true,
    },
  });

  if (!transaction || transaction.userId !== user.id) {
    return NextResponse.json({ error: "المعاملة غير موجودة." }, { status: 404 });
  }

  const payload = parseJson(transaction.providerPayload);
  if (transaction.provider !== "paymob" || !payload) {
    return NextResponse.json({ error: "جلسة الدفع غير متاحة لهذه المعاملة." }, { status: 400 });
  }

  return NextResponse.json({
    transaction: {
      id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      purpose: transaction.purpose,
      checkoutUrl: transaction.checkoutUrl,
      iframeUrl: transaction.iframeUrl,
    },
    session: {
      publicKey: payload.publicKey ?? null,
      clientSecret: payload.clientSecret ?? null,
      paymobScriptUrl: payload.paymobScriptUrl ?? null,
      intentionId: payload.intentionId ?? null,
      checkoutUrl: payload.checkoutUrl ?? transaction.checkoutUrl ?? null,
      iframeUrl: payload.iframeUrl ?? transaction.iframeUrl ?? null,
    },
  });
}
