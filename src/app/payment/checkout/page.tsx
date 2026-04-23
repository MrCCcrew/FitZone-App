"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SessionPayload = {
  transaction: {
    id: string;
    status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
    amount: number;
    currency: string;
    checkoutUrl: string | null;
    iframeUrl: string | null;
  };
  session: {
    checkoutUrl: string | null;
    iframeUrl: string | null;
  };
};

function PaymentCheckoutContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setError("رقم المعاملة غير موجود.");
      return;
    }

    let cancelled = false;

    async function redirectToHostedCheckout() {
      try {
        const response = await fetch(`/api/payments/session/${transactionId}`, { cache: "no-store" });
        const payload = (await response.json()) as SessionPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "تعذر تحميل رابط الدفع.");
        if (cancelled) return;

        const checkoutUrl =
          payload.session.checkoutUrl ??
          payload.session.iframeUrl ??
          payload.transaction.checkoutUrl ??
          payload.transaction.iframeUrl;

        if (payload.transaction.status === "paid") {
          window.location.href = `/payment/verify?transactionId=${payload.transaction.id}`;
          return;
        }

        if (!checkoutUrl) {
          throw new Error("رابط الدفع غير متاح لهذه المعاملة.");
        }

        window.location.href = checkoutUrl;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "تعذر التحويل إلى صفحة الدفع.");
        }
      }
    }

    void redirectToHostedCheckout();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <div className="min-h-screen bg-[#12060c] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-[28px] border border-[#ffbcdb]/15 bg-[#2a0f1b] p-6 text-center">
        <h1 className="text-2xl font-black">التحويل إلى Paymob</h1>
        <p className="mt-2 text-sm text-[#d7aabd]">
          تم إيقاف embedded checkout. سيتم تحويلك إلى صفحة Paymob المستضافة لإكمال الدفع.
        </p>
        {error ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
            <Link href="/account" className="inline-flex rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white">
              الرجوع إلى الحساب
            </Link>
          </div>
        ) : (
          <div className="mt-6 text-sm text-[#d7aabd]">جارٍ التحويل...</div>
        )}
      </div>
    </div>
  );
}

export default function PaymentCheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#12060c] text-white" />}>
      <PaymentCheckoutContent />
    </Suspense>
  );
}
