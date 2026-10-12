import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

type PendingCheckoutStatus =
  | "none"
  | "payable"
  | "not_payable"
  | "awaiting_confirmation";

function reply(
  status: PendingCheckoutStatus,
  purchaseId: string | null = null,
  transactionId: string | null = null,
) {
  return NextResponse.json(
    { status, purchaseId, transactionId },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function reject(status: number, error: string) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function isFutureDate(value: Date | null, now: Date) {
  return value instanceof Date &&
    Number.isFinite(value.getTime()) &&
    value.getTime() > now.getTime();
}

function hasPersistedPaymobCheckout(payment: {
  checkoutUrl: string | null;
  providerPayload: string | null;
}): boolean {
  try {
    const parsed: unknown = payment.providerPayload
      ? JSON.parse(payment.providerPayload)
      : null;

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return false;
    }

    const payload = parsed as Record<string, unknown>;
    const checkoutUrl = payload.checkoutUrl ?? payment.checkoutUrl;

    if (
      typeof checkoutUrl !== "string" ||
      !checkoutUrl.trim()
    ) {
      return false;
    }

    return new URL(checkoutUrl).protocol === "https:";
  } catch {
    return false;
  }
}
export async function GET(req: Request) {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return reject(401, "يجب تسجيل الدخول أولًا.");
  }

  const url = new URL(req.url);
  const offerId = url.searchParams.get("offerId")?.trim() ?? "";

  if (!offerId) {
    return reject(400, "يرجى تحديد العرض.");
  }

  try {
    const purchase = await db.offerBoxPurchase.findFirst({
      where: {
        userId: user.id,
        offerId,
        status: "pending_payment",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        userId: true,
        offerId: true,
        status: true,
        holdExpiresAt: true,
        paymentTransactionId: true,
      },
    });

    if (!purchase) {
      return reply("none");
    }

    // Defense in depth, including against unexpected query results.
    if (
      purchase.userId !== user.id ||
      purchase.offerId !== offerId ||
      purchase.status !== "pending_payment"
    ) {
      return reject(404, "عملية الشراء غير متاحة.");
    }

    if (!purchase.paymentTransactionId) {
      // Checkout creation may have been interrupted before
      // linking the durable payment transaction.
      return reply("awaiting_confirmation");
    }

    const payment = await db.paymentTransaction.findUnique({
      where: {
        id: purchase.paymentTransactionId,
      },
      select: {
        id: true,
        userId: true,
        purpose: true,
        provider: true,
        status: true,
        expiresAt: true,
        checkoutUrl: true,
        providerPayload: true,
      },
    });

    if (!payment) {
      return reply("awaiting_confirmation");
    }

    if (
      payment.id !== purchase.paymentTransactionId ||
      payment.userId !== user.id ||
      payment.purpose !== "offer_box"
    ) {
      return reject(404, "عملية الدفع غير متاحة.");
    }

    if (payment.status === "paid") {
      // Never turn a confirmed payment into another checkout.
      return reply("awaiting_confirmation");
    }

    if (
      !isFutureDate(purchase.holdExpiresAt, new Date()) ||
      !isFutureDate(payment.expiresAt, new Date()) ||
      payment.status === "failed" ||
      payment.status === "cancelled" ||
      payment.status === "expired"
    ) {
      return reply("not_payable");
    }

    if (
      payment.provider !== "paymob" ||
      (
        payment.status !== "pending" &&
        payment.status !== "requires_action"
      )
    ) {
      // Unknown provider or transitional payment state:
      // do not expose a potentially unsafe checkout.
      return reply("awaiting_confirmation");
    }

    if (!hasPersistedPaymobCheckout(payment)) {
      return reply("awaiting_confirmation");
    }

    return reply(
      "payable",
      purchase.id,
      payment.id,
    );
  } catch (error) {
    console.error("[OFFER_BOX_PENDING_GET]", error);

    return reject(
      500,
      "تعذر التحقق من عملية الدفع المعلقة حاليًا.",
    );
  }
}