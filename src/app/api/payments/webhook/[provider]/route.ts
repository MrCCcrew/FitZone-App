import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments/registry";

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: providerKey } = await context.params;
    const provider = getPaymentProvider(providerKey);

    if (!provider) {
      return NextResponse.json({ error: "مزوّد الدفع غير معروف." }, { status: 404 });
    }

    const payload = await req.json().catch(() => null);
    const result = provider.handleWebhook
      ? await provider.handleWebhook(payload, req.headers)
      : { ok: true, message: "هذا المزوّد لا يستخدم Webhook حاليًا." };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[PAYMENTS_WEBHOOK_POST]", error);
    return NextResponse.json({ error: "تعذر معالجة إشعار الدفع." }, { status: 500 });
  }
}
