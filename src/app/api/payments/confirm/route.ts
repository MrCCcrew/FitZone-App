import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

function safeParse(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as { transactionId?: string; reference?: string; note?: string };
    if (!body.transactionId) {
      return NextResponse.json({ error: "معاملة الدفع غير محددة." }, { status: 400 });
    }

    const transaction = await db.paymentTransaction.findUnique({
      where: { id: body.transactionId },
      select: { id: true, userId: true, metadata: true, status: true },
    });

    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: "معاملة الدفع غير موجودة." }, { status: 404 });
    }

    const metadata = safeParse(transaction.metadata);
    const updated = await db.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: transaction.status === "paid" ? transaction.status : "requires_action",
        metadata: JSON.stringify({
          ...metadata,
          customerReference: body.reference ?? null,
          customerNote: body.note ?? null,
          customerConfirmedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({ success: true, transactionId: updated.id });
  } catch (error) {
    console.error("[PAYMENTS_CONFIRM_POST]", error);
    return NextResponse.json({ error: "تعذر إرسال تأكيد الدفع." }, { status: 500 });
  }
}
