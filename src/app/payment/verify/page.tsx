"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type PaymentTransaction = {
  id: string;
  referenceCode?: string | null;
  status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
  amount: number;
  currency: string;
  purpose: string;
  provider: string;
  checkoutUrl?: string | null;
  metadata?: {
    membershipInvoice?: {
      membershipName?: string;
      membershipNameEn?: string;
    };
  } | null;
};

const STATUS_LABELS: Record<PaymentTransaction["status"], string> = {
  pending: "جارٍ انتظار تأكيد الدفع",
  requires_action: "الدفع قيد المعالجة",
  paid: "تم تأكيد الدفع بنجاح",
  failed: "فشل الدفع",
  cancelled: "تم إلغاء العملية",
  expired: "انتهت صلاحية العملية",
};

function PaymentVerifyContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const returnState = searchParams.get("state");
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<PaymentTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setError("رقم المعاملة غير موجود.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const response = await fetch(`/api/payments/verify/${transactionId}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; transaction?: PaymentTransaction };
        if (!response.ok) throw new Error(payload.error ?? "تعذر التحقق من حالة الدفع.");
        if (cancelled) return;

        const nextTransaction = payload.transaction ?? null;
        setTransaction(nextTransaction);
        setError(null);
        setLoading(false);

        if (
          nextTransaction &&
          (nextTransaction.status === "pending" || nextTransaction.status === "requires_action")
        ) {
          timeoutId = setTimeout(() => {
            void load();
          }, 4000);
        }
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "تعذر التحقق من حالة الدفع.");
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [transactionId]);

  const statusLabel = useMemo(() => {
    if (!transaction) return "";
    return STATUS_LABELS[transaction.status] ?? transaction.status;
  }, [transaction]);

  const membershipName = transaction?.metadata?.membershipInvoice?.membershipName ?? null;
  const isPaid = transaction?.status === "paid";
  const isMembership = transaction?.purpose === "membership";
  const isCancelledFromReturn =
    returnState === "cancel" &&
    (transaction?.status === "pending" || transaction?.status === "requires_action" || !transaction);

  return (
    <div className="min-h-screen bg-[#12060c] text-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {isPaid ? (
          <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
            <div className="mb-3 text-5xl">✓</div>
            <div className="mb-1 text-2xl font-black text-green-300">
              {isMembership
                ? `تم الاشتراك${membershipName ? ` في ${membershipName}` : ""} بنجاح`
                : "تم تأكيد الدفع بنجاح"}
            </div>
            {isMembership ? (
              <div className="mt-1 text-sm text-green-200">
                اشتراكك أصبح نشطًا بعد تأكيد Paymob من السيرفر.
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-black">متابعة الدفع</h1>
            <p className="mt-2 text-sm text-[#d7aabd]">
              هذه الصفحة تعرض الحالة من السيرفر. لا يتم اعتبار العملية ناجحة إلا بعد تأكيد Paymob ووصول التحقق النهائي.
            </p>
          </>
        )}

        <div className="mt-6 rounded-3xl border border-[#ffbcdb]/20 bg-[#2a0f1b] p-6">
          {isCancelledFromReturn ? (
            <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              تم إلغاء عملية الدفع قبل الإتمام. يمكنك إعادة المحاولة من نفس الصفحة إذا بقيت المعاملة قابلة للدفع.
            </div>
          ) : null}

          {loading ? <div className="text-sm text-[#d7aabd]">جارٍ التحقق من المعاملة...</div> : null}

          {!loading && error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {!loading && !error && transaction ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    isPaid
                      ? "border-green-500/30 bg-green-500/15 text-green-300"
                      : "border-pink-300/20 bg-pink-500/15 text-pink-200"
                  }`}
                >
                  {statusLabel}
                </span>
                <span className="text-[#d7aabd]">المبلغ:</span>
                <span className="font-black">
                  {Number(transaction.amount).toLocaleString("ar-EG")} {transaction.currency}
                </span>
              </div>

              {membershipName ? (
                <div className="text-sm text-[#d7aabd]">
                  الباقة: <span className="font-bold text-white">{membershipName}</span>
                </div>
              ) : null}

              <div className="text-xs text-[#d7aabd]">
                رقم المعاملة: <span className="text-white">{transaction.referenceCode ?? transaction.id}</span>
              </div>

              {transaction.status === "pending" || transaction.status === "requires_action" ? (
                <div className="rounded-2xl border border-[#ffbcdb]/15 bg-black/20 p-4 text-sm text-[#d7aabd]">
                  إذا أكملت الدفع بالفعل فانتظر بضع ثوانٍ. سيتم تحديث الحالة تلقائيًا بعد وصول إشعار Paymob والتحقق منه على السيرفر.
                </div>
              ) : null}

              {transaction.status === "failed" ||
              transaction.status === "cancelled" ||
              transaction.status === "expired" ||
              isCancelledFromReturn ? (
                <div className="flex flex-wrap gap-3">
                  {transaction.checkoutUrl ? (
                    <a
                      href={transaction.checkoutUrl}
                      className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white"
                    >
                      إعادة محاولة الدفع
                    </a>
                  ) : null}
                  <Link href="/account" className="rounded-xl border border-pink-300/20 px-5 py-3 text-sm font-bold text-pink-100">
                    الرجوع إلى الحساب
                  </Link>
                </div>
              ) : null}

              {isPaid ? (
                <div className="flex flex-wrap gap-3">
                  <Link href="/account" className="rounded-xl bg-pink-600 px-5 py-3 text-sm font-bold text-white">
                    الذهاب إلى حسابي
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#12060c] text-white" />}>
      <PaymentVerifyContent />
    </Suspense>
  );
}
