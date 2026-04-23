import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { verifyPaymentTransaction } from "@/lib/payments/service";

// Browsers that land here via GET (misconfigured Paymob redirect) get sent to the verify page
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const transactionId =
    searchParams.get("merchant_order_id") ??
    searchParams.get("special_reference") ??
    searchParams.get("transactionId") ??
    "";
  const destination = transactionId
    ? `/payment/verify?transactionId=${encodeURIComponent(transactionId)}`
    : "/payment/verify";
  return NextResponse.redirect(new URL(destination, req.url), { status: 302 });
}

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerKey } = await context.params;

  try {
    const provider = getPaymentProvider(providerKey);
    if (!provider?.handleWebhook) {
      return NextResponse.json({ received: true, message: "Provider does not support webhooks." });
    }

    const payload = await req.json().catch(() => null);
    const result = await provider.handleWebhook(payload, req.headers);

    if (!result.ok || !result.transactionId) {
      console.warn(`[WEBHOOK:${providerKey}] Ignored`, result.message);
      return NextResponse.json({ received: true });
    }

    if (result.providerReference || result.externalReference || result.payload) {
      await db.paymentTransaction.update({
        where: { id: result.transactionId },
        data: {
          providerReference: result.providerReference ?? undefined,
          externalReference: result.externalReference ?? undefined,
          providerPayload: result.payload ? JSON.stringify(result.payload) : undefined,
        },
      }).catch((error: unknown) => {
        console.error(`[WEBHOOK:${providerKey}] Failed to persist references`, error);
      });
    }

    if (result.status === "paid" || result.status === "failed" || result.status === "cancelled") {
      await verifyPaymentTransaction(result.transactionId).catch((error: unknown) => {
        console.error(`[WEBHOOK:${providerKey}] Verification after webhook failed`, error);
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK:${providerKey}] Unexpected error`, error);
    return NextResponse.json({ received: true });
  }
}
