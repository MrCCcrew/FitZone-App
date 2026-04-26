"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SessionPayload = {
  transaction: {
    id: string;
    referenceCode?: string | null;
    status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
    checkoutUrl: string | null;
  };
  session: {
    checkoutUrl: string | null;
    enabledMethodLabels?: Array<{ key?: string; label?: string }>;
  };
  error?: string;
};

function PaymentCheckoutContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const [error, setError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [methods, setMethods] = useState<string[]>([]);

  useEffect(() => {
    if (!transactionId) {
      setError("تعذر فتح صفحة الدفع.");
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        const response = await fetch(`/api/payments/session/${transactionId}`, { cache: "no-store" });
        const payload = (await response.json()) as SessionPayload;
        if (!response.ok) {
          throw new Error(payload.error ?? "تعذر تحميل جلسة الدفع.");
        }
        if (cancelled) return;

        const nextUrl = payload.session.checkoutUrl ?? payload.transaction.checkoutUrl ?? null;
        setReferenceCode(payload.transaction.referenceCode ?? payload.transaction.id);
        setCheckoutUrl(nextUrl);
        setMethods(
          Array.isArray(payload.session.enabledMethodLabels)
            ? payload.session.enabledMethodLabels.map((item) => String(item.label ?? "").trim()).filter(Boolean)
            : [],
        );

        if (payload.transaction.status === "paid") {
          window.location.replace(`/payment/verify?transactionId=${encodeURIComponent(payload.transaction.id)}`);
          return;
        }

        if (!nextUrl) {
          throw new Error("رابط الدفع غير متاح لهذه المعاملة.");
        }

        window.location.replace(nextUrl);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "تعذر تحويلك إلى Paymob.");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <div className="min-h-screen bg-[#12060c] px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-2xl rounded-[32px] border border-[#ffbcdb]/15 bg-[#2a0f1b] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:p-8">
        <h1 className="text-2xl font-black">تحويلك إلى Paymob</h1>
        <p className="mt-3 text-sm text-[#d7aabd]">
          سيتم فتح صفحة Paymob الموحدة لعرض وسائل الدفع الإلكترونية المفعلة وإتمام العملية بأمان.
        </p>

        {referenceCode ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-[#d7aabd]">
            رقم العملية: <span className="font-mono text-[#fff4f8]">{referenceCode}</span>
          </div>
        ) : null}

        {methods.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {methods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200"
              >
                {method}
              </span>
            ))}
          </div>
        ) : null}

        {!error ? (
          <div className="mt-6 rounded-3xl border border-[#ffbcdb]/15 bg-black/20 px-6 py-10 text-center text-sm text-[#d7aabd]">
            جارٍ تحويلك الآن إلى صفحة الدفع الموحدة...
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
              {error}
            </div>
            <div className="flex flex-wrap gap-3">
              {checkoutUrl ? (
                <a href={checkoutUrl} className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white">
                  فتح Paymob
                </a>
              ) : null}
              {transactionId ? (
                <Link
                  href={`/payment/verify?transactionId=${encodeURIComponent(transactionId)}`}
                  className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-pink-100"
                >
                  متابعة حالة الدفع
                </Link>
              ) : null}
            </div>
          </div>
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
