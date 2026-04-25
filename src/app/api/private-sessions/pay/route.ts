import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { ensurePrivateAttendancePass } from "@/lib/attendance";
import { createPaymentTransaction } from "@/lib/payments/service";

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });

  const body = (await req.json()) as { applicationId?: string; paymentMethod?: string };
  if (!body.applicationId) return NextResponse.json({ error: "معرّف الطلب مطلوب." }, { status: 400 });

  const app = await db.privateSessionApplication.findUnique({
    where: { id: body.applicationId },
    include: {
      trainer: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });

  if (!app) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
  if (app.userId !== user.id) return NextResponse.json({ error: "غير مصرح." }, { status: 403 });
  if (app.status !== "approved") return NextResponse.json({ error: "لم تتم الموافقة على هذا الطلب بعد." }, { status: 400 });
  if (!app.trainerPrice || app.trainerPrice <= 0) return NextResponse.json({ error: "لم يتم تحديد سعر لهذا الطلب." }, { status: 400 });

  const label = app.type === "mini_private" ? "ميني برايفيت" : "برايفيت";
  const description = `${label} مع المدربة ${app.trainer.name}`;
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

  try {
    const result = await createPaymentTransaction({
      userId: user.id,
      provider: "paymob",
      amount: app.trainerPrice,
      purpose: "private_session",
      description,
      paymentMethod: "paymob",
      returnUrl: `${origin}/account?tab=myPrivateSessions`,
      cancelUrl: `${origin}/account?tab=myPrivateSessions`,
      customer: { name: app.user.name, email: app.user.email, phone: app.user.phone },
      metadata: { privateSessionApplicationId: app.id, type: app.type, trainerId: app.trainer.id },
    });

    await db.privateSessionApplication.update({
      where: { id: app.id },
      data: { paymentTransactionId: result.id },
    });

    // If payment succeeds immediately (e.g. wallet-only), mark as paid
    if (result.status === "paid") {
      await db.privateSessionApplication.update({
        where: { id: app.id },
        data: { status: "paid", paidAt: new Date() },
      });
      await ensurePrivateAttendancePass(app.id).catch(() => null);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({
      redirectUrl: result.checkoutUrl ?? result.iframeUrl ?? null,
      transactionId: result.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "حدث خطأ أثناء تهيئة الدفع." },
      { status: 500 },
    );
  }
}
