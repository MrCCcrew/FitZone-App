import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "تم إيقاف التأكيد اليدوي للدفع. حالة الدفع الآن تعتمد فقط على Paymob webhook + server-side verification.",
    },
    { status: 410 },
  );
}
