import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

export async function POST(req: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: providerKey } = await context.params;

  // Always return 200 to Paymob to prevent retries; errors are logged internally.
  try {
    const provider = getPaymentProvider(providerKey);
    if (!provider?.handleWebhook) {
      return NextResponse.json({ received: true, message: "Provider does not support webhooks." });
    }

    const payload = await req.json().catch(() => null);
    const result = await provider.handleWebhook(payload, req.headers);

    if (!result.ok || !result.transactionId || !result.status) {
      console.warn(`[WEBHOOK:${providerKey}] Ignored:`, result.message);
      return NextResponse.json({ received: true });
    }

    const status = result.status;

    // Update provider references before business effects
    if (result.providerReference || result.externalReference || result.payload) {
      await db.paymentTransaction
        .update({
          where: { id: result.transactionId },
          data: {
            providerReference: result.providerReference ?? undefined,
            externalReference: result.externalReference ?? undefined,
            providerPayload: result.payload ? JSON.stringify(result.payload) : undefined,
          },
        })
        .catch((err: unknown) => {
          console.error(`[WEBHOOK:${providerKey}] Failed to update references:`, err);
        });
    }

    // Run business effects (membership activation, order confirmation, etc.)
    if (status === "paid" || status === "failed" || status === "cancelled") {
      await updatePaymentTransactionStatus(result.transactionId, status).catch((err: unknown) => {
        console.error(`[WEBHOOK:${providerKey}] Failed to update status to ${status}:`, err);
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK:${providerKey}] Unexpected error:`, error);
    // Still return 200 so Paymob doesn't keep retrying
    return NextResponse.json({ received: true });
  }
}
