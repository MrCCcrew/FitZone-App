"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SessionPayload = {
  transaction: {
    id: string;
    status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
    amount: number;
    currency: string;
    checkoutUrl: string | null;
  };
  session: {
    publicKey: string | null;
    clientSecret: string | null;
    paymobScriptUrl: string | null;
    intentionId: string | null;
    checkoutUrl: string | null;
    paymentMethods?: Array<{ id?: string | number; name?: string; method_type?: string; method_subtype?: string }>;
  };
};

declare global {
  interface Window {
    Paymob?: (publicKey: string) => {
      checkoutButton: (clientSecret: string) => {
        mount: (selector: string) => void;
      };
    };
  }
}

async function ensureScriptLoaded(src: string) {
  if (window.Paymob) return;

  const existing = document.querySelector<HTMLScriptElement>(`script[data-paymob-sdk="true"][src="${src}"]`);
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("تعذر تحميل صفحة الدفع.")), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.paymobSdk = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("تعذر تحميل صفحة الدفع."));
    document.head.appendChild(script);
  });
}

function PaymentCheckoutContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactionStatus, setTransactionStatus] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);

  useEffect(() => {
    if (!transactionId) {
      setError("تعذر فتح صفحة الدفع.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        const response = await fetch(`/api/payments/session/${transactionId}`, { cache: "no-store" });
        const payload = (await response.json()) as SessionPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "تعذر تحميل جلسة الدفع.");
        if (cancelled) return;

        setTransactionStatus(payload.transaction.status);

        if (payload.transaction.status === "paid") {
          window.location.href = `/payment/verify?transactionId=${payload.transaction.id}`;
          return;
        }

        const publicKey = payload.session.publicKey;
        const clientSecret = payload.session.clientSecret;
        const scriptUrl = payload.session.paymobScriptUrl;

        if (!publicKey || !clientSecret || !scriptUrl) {
          throw new Error("بيانات الدفع غير مكتملة حاليًا.");
        }

        setPaymentMethods(
          Array.isArray(payload.session.paymentMethods)
            ? payload.session.paymentMethods
                .map((method) => String(method.name ?? method.method_type ?? method.method_subtype ?? "").trim())
                .filter(Boolean)
            : [],
        );

        await ensureScriptLoaded(scriptUrl);
        if (cancelled) return;

        if (!window.Paymob) {
          throw new Error("تعذر تهيئة صفحة الدفع.");
        }

        const selector = "#paymob-flash-checkout";
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }

        window.Paymob(publicKey).checkoutButton(clientSecret).mount(selector);
        if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "تعذر فتح صفحة الدفع.");
        setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <div className="min-h-screen bg-[#12060c] px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-[#ffbcdb]/15 bg-[#2a0f1b] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:p-8">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black">إتمام الدفع</h1>
            <p className="mt-2 text-sm text-[#d7aabd]">
              اختر وسيلة الدفع المناسبة لك وأكمل العملية بأمان من خلال Paymob.
            </p>
          </div>
          {transactionId ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-[#d7aabd]">
              رقم العملية: <span className="font-mono text-[#fff4f8]">{transactionId}</span>
            </div>
          ) : null}
        </div>

        {paymentMethods.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200"
              >
                {method}
              </span>
            ))}
          </div>
        ) : null}

        {transactionStatus === "pending" || transactionStatus === "requires_action" ? (
          <div className="mt-5 rounded-2xl border border-pink-400/15 bg-black/20 px-4 py-3 text-sm text-[#d7aabd]">
            سيتم تحديث حالة الدفع تلقائيًا بعد إتمام العملية.
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
              {error}
            </div>
            <div className="flex flex-wrap gap-3">
              {transactionId ? (
                <Link
                  href={`/payment/verify?transactionId=${encodeURIComponent(transactionId)}`}
                  className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white"
                >
                  متابعة حالة الدفع
                </Link>
              ) : null}
              <Link href="/account" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-pink-100">
                الرجوع إلى الحساب
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            {loading ? (
              <div className="rounded-3xl border border-[#ffbcdb]/15 bg-black/20 px-6 py-10 text-center text-sm text-[#d7aabd]">
                جاري تجهيز صفحة الدفع...
              </div>
            ) : null}
            <div
              id="paymob-flash-checkout"
              ref={containerRef}
              className={`min-h-[420px] rounded-[28px] border border-white/10 bg-white p-3 text-black ${loading ? "hidden" : ""}`}
            />
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
