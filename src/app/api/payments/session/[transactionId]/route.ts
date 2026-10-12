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
      referenceCode: true,
      userId: true,
      provider: true,
      status: true,
      amount: true,
      currency: true,
      purpose: true,
      checkoutUrl: true,
      expiresAt: true,
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

  if (transaction.status === "failed" || transaction.status === "cancelled") {
    return NextResponse.json(
      {
        error: "محاولة الدفع هذه غير صالحة. يرجى بدء محاولة دفع جديدة.",
        code: "PAYMENT_SESSION_NOT_PAYABLE",
      },
      { status: 409 },
    );
  }

  if (
    transaction.status === "expired" ||
    (transaction.status !== "paid" &&
      (!transaction.expiresAt ||
        !Number.isFinite(transaction.expiresAt.getTime()) ||
        transaction.expiresAt.getTime() <= Date.now()))
  ) {
    return NextResponse.json(
      {
        error: "انتهت صلاحية رابط الدفع. يرجى بدء محاولة دفع جديدة.",
        code: "PAYMENT_SESSION_EXPIRED",
      },
      { status: 410 },
    );
  }

  if (
    transaction.status !== "pending" &&
    transaction.status !== "requires_action" &&
    transaction.status !== "paid"
  ) {
    return NextResponse.json(
      {
        error: "جلسة الدفع غير متاحة لهذه الحالة.",
        code: "PAYMENT_SESSION_INVALID_STATUS",
      },
      { status: 409 },
    );
  }

  const isPaid = transaction.status === "paid";

  return NextResponse.json({
    transaction: {
      id: transaction.id,
      referenceCode: transaction.referenceCode,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      purpose: transaction.purpose,
      checkoutUrl: isPaid ? null : transaction.checkoutUrl,
      iframeUrl: isPaid ? null : transaction.iframeUrl,
    },
    session: {
      publicKey: isPaid ? null : payload.publicKey ?? null,
      clientSecret: isPaid ? null : payload.clientSecret ?? null,
      intentionId: isPaid ? null : payload.intentionId ?? null,
      checkoutUrl: isPaid ? null : (payload.checkoutUrl ?? transaction.checkoutUrl ?? null),
      iframeUrl: isPaid ? null : (payload.iframeUrl ?? transaction.iframeUrl ?? null),
      checkoutExperience: payload.checkoutExperience ?? null,
      enabledMethodLabels: Array.isArray(payload.enabledMethodLabels) ? payload.enabledMethodLabels : [],
      paymentMethods: Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [],
    },
  });
}
