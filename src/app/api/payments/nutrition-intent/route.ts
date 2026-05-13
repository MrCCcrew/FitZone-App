import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { createPaymentTransaction } from "@/lib/payments/service";

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentAppUser();
    if (!currentUser?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });

    const body = await req.json() as {
      sessionId: string;
      provider?: string;
      paymentMethod?: string;
      returnUrl?: string;
      cancelUrl?: string;
    };

    if (!body.sessionId) return NextResponse.json({ error: "sessionId مطلوب" }, { status: 400 });

    const session = await db.nutritionSession.findFirst({
      where: { id: body.sessionId, userId: currentUser.id },
      include: { nutritionist: { select: { name: true } } },
    });

    if (!session) return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    if (session.status !== "approved") {
      return NextResponse.json({ error: "يجب تأكيد الموعد أولاً قبل الدفع" }, { status: 400 });
    }
    if (session.paidAt) return NextResponse.json({ error: "تم دفع هذه الجلسة مسبقاً" }, { status: 400 });

    const typeLabel = session.type === "consultation" ? "حجز كشف" : "إعادة كشف";
    const description = `${typeLabel} - دكتورة ${session.nutritionist.name}`;

    const user = await db.user.findUnique({
      where: { id: currentUser.id },
      select: { name: true, email: true, phone: true },
    });

    const txResult = await createPaymentTransaction({
      userId: currentUser.id,
      purpose: "private_session",
      amount: session.price,
      description,
      provider: body.provider,
      paymentMethod: body.paymentMethod,
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl,
      metadata: {
        type: "nutrition_session",
        nutritionSessionId: session.id,
      },
      customer: {
        name: user?.name ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
      },
    });

    // Link transaction to session
    await db.nutritionSession.update({
      where: { id: session.id },
      data: { paymentTransactionId: txResult.id },
    });

    return NextResponse.json({ transactionId: txResult.id, checkoutUrl: txResult.checkoutUrl });
  } catch (err) {
    console.error("[nutrition-intent]", err);
    return NextResponse.json({ error: "حدث خطأ أثناء إنشاء الدفع" }, { status: 500 });
  }
}
