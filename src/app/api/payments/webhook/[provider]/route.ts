import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments/registry";
import { updatePaymentTransactionStatus, verifyPaymentTransaction } from "@/lib/payments/service";

function parseWebhookPayload(rawText: string, contentType: string | null) {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  if (contentType?.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(trimmed);
    const jsonCandidate = params.get("data") ?? params.get("payload");
    if (jsonCandidate) {
      try {
        return JSON.parse(jsonCandidate) as unknown;
      } catch {
        return Object.fromEntries(params.entries());
      }
    }
    return Object.fromEntries(params.entries());
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    try {
      const params = new URLSearchParams(trimmed);
      return Object.fromEntries(params.entries());
    } catch {
      return null;
    }
  }
}

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

    const rawText = await req.text();
    const payload = parseWebhookPayload(rawText, req.headers.get("content-type"));
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

    if (result.status === "paid" || result.status === "failed") {
      await verifyPaymentTransaction(result.transactionId).catch(async (error: unknown) => {
        console.error(`[WEBHOOK:${providerKey}] Verification after webhook failed`, error);
        await updatePaymentTransactionStatus(result.transactionId!, result.status!, result.message ?? null).catch(() => null);
      });
    } else if (result.status === "cancelled" || result.status === "expired") {
      await updatePaymentTransactionStatus(result.transactionId, result.status, result.message ?? null).catch((error: unknown) => {
        console.error(`[WEBHOOK:${providerKey}] Failed to persist terminal state`, error);
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`[WEBHOOK:${providerKey}] Unexpected error`, error);
    return NextResponse.json({ received: true });
  }
}
