"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type SessionPayload = {
  transaction: {
    id: string;
    status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
    amount: number;
    currency: string;
  };
  session: {
    publicKey: string | null;
    clientSecret: string | null;
    paymobScriptUrl: string | null;
    checkoutUrl: string | null;
    iframeUrl: string | null;
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

function PaymentCheckoutContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scriptReady, setScriptReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!transactionId) {
      setError("رقم المعاملة غير موجود.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/payments/session/${transactionId}`, { cache: "no-store" });
        const data = (await response.json()) as SessionPayload & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "تعذر تحميل جلسة الدفع.");
        if (cancelled) return;
        setPayload(data);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "تعذر تحميل جلسة الدفع.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  useEffect(() => {
    if (!payload || !scriptReady || mounted) return;
    const publicKey = payload.session.publicKey;
    const clientSecret = payload.session.clientSecret;

    if (payload.transaction.status === "paid") {
      window.location.href = `/payment/verify?transactionId=${payload.transaction.id}`;
      return;
    }

    if (window.Paymob && publicKey && clientSecret) {
      try {
        window.Paymob(publicKey).checkoutButton(clientSecret).mount("#paymob-checkout");
        setMounted(true);
        return;
      } catch (err) {
        console.error("[PAYMOB_FLASH_MOUNT]", err);
      }
    }

    if (payload.session.iframeUrl) {
      window.location.href = payload.session.iframeUrl;
      return;
    }

    if (payload.session.checkoutUrl && payload.session.checkoutUrl !== window.location.href) {
      window.location.href = payload.session.checkoutUrl;
    }
  }, [payload, scriptReady, mounted]);

  const scriptUrl = useMemo(() => {
    return payload?.session.paymobScriptUrl ?? "https://nextstagingenv.s3.amazonaws.com/js/v1/paymob.js";
  }, [payload]);

  return (
    <div className="min-h-screen bg-[#12060c] text-white">
      {payload?.session.publicKey && payload?.session.clientSecret ? (
        <Script src={scriptUrl} strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      ) : null}

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-[32px] border border-[#ffbcdb]/15 bg-[#2a0f1b] p-6 sm:p-8">
          <h1 className="text-2xl font-black">الدفع الإلكتروني عبر Paymob</h1>
          <p className="mt-2 text-sm text-[#d7aabd]">
            سيتم تفعيل الطلب أو الاشتراك فقط بعد وصول webhook من Paymob والتحقق منه على السيرفر.
          </p>

          {loading ? <div className="mt-6 text-sm text-[#d7aabd]">جارٍ تجهيز جلسة الدفع...</div> : null}

          {!loading && error ? (
            <div className="mt-6 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          {!loading && payload ? (
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-[#ffbcdb]/15 bg-black/20 p-4 text-sm text-[#fff4f8]">
                <div>رقم المعاملة: {payload.transaction.id}</div>
                <div className="mt-1">
                  المبلغ: {Number(payload.transaction.amount).toLocaleString("ar-EG")} {payload.transaction.currency}
                </div>
              </div>

              {payload.transaction.status === "paid" ? (
                <Link
                  href={`/payment/verify?transactionId=${payload.transaction.id}`}
                  className="inline-flex rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white"
                >
                  متابعة حالة الدفع
                </Link>
              ) : (
                <>
                  <div id="paymob-checkout" className="min-h-[96px]" />
                  <div className="text-xs text-[#d7aabd]">
                    إذا لم يظهر نموذج الدفع تلقائيًا سيتم تحويلك إلى صفحة Paymob المستضافة.
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
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
