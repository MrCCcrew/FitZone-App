"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PaymentTransaction = {
  id: string;
  status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
  amount: number;
  currency: string;
  purpose: string;
  provider: string;
  checkoutUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

const STATUS_LABELS: Record<PaymentTransaction["status"], string> = {
  pending: "قيد الانتظار",
  requires_action: "بانتظار تأكيد التحويل",
  paid: "تم الدفع",
  failed: "فشلت",
  cancelled: "ملغية",
  expired: "منتهية",
};

function PaymentVerifyContent() {
  const searchParams = useSearchParams();
  const transactionId = searchParams.get("transactionId");
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<PaymentTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!transactionId) {
      setError("رقم المعاملة غير موجود.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/payments/verify/${transactionId}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error ?? "تعذر التحقق من حالة الدفع.");
        }
        if (!cancelled) {
          setTransaction(payload.transaction ?? null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "تعذر التحقق من حالة الدفع.");
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

  const statusLabel = useMemo(() => {
    if (!transaction) return "";
    return STATUS_LABELS[transaction.status] ?? transaction.status;
  }, [transaction]);

  const submitConfirmation = async () => {
    if (!transactionId) return;
    setConfirming(true);
    setResult(null);
    try {
      const res = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, reference: reference.trim() || null, note: note.trim() || null }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "تعذر إرسال التأكيد.");
      }
      setResult("تم إرسال التأكيد للإدارة بنجاح. سيتم مراجعة التحويل قريبًا.");
    } catch (err: unknown) {
      setResult(err instanceof Error ? err.message : "تعذر إرسال التأكيد.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#12060c] text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-black">التحقق من الدفع</h1>
        <p className="mt-2 text-sm text-[#d7aabd]">
          استخدمي هذه الصفحة لتأكيد التحويل بعد الدفع من الهاتف.
        </p>

        <div className="mt-6 rounded-3xl border border-[#ffbcdb]/20 bg-[#2a0f1b] p-6">
          {loading && <div className="text-sm text-[#d7aabd]">جاري التحقق من المعاملة...</div>}
          {!loading && error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {!loading && !error && transaction && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full border border-pink-300/20 bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">
                  {statusLabel}
                </span>
                <span className="text-[#d7aabd]">المبلغ:</span>
                <span className="font-black">
                  {Number(transaction.amount).toLocaleString("ar-EG")} {transaction.currency}
                </span>
              </div>
              <div className="text-xs text-[#d7aabd]">
                رقم المعاملة: <span className="text-white">{transaction.id}</span>
              </div>

              {transaction.checkoutUrl && (
                <a
                  href={transaction.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white"
                >
                  فتح رابط الدفع
                </a>
              )}

              <div className="rounded-2xl border border-[#ffbcdb]/15 bg-black/20 p-4">
                <div className="text-sm font-bold text-[#fff4f8]">تأكيد التحويل</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="رقم مرجعي أو آخر 4 أرقام"
                    className="rounded-xl border border-[#ffbcdb]/20 bg-[#3f1426] px-3 py-2 text-sm text-white outline-none"
                  />
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="ملاحظة اختيارية"
                    className="rounded-xl border border-[#ffbcdb]/20 bg-[#3f1426] px-3 py-2 text-sm text-white outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={submitConfirmation}
                  disabled={confirming}
                  className="mt-3 w-full rounded-xl border border-pink-300/20 bg-pink-500/15 px-4 py-2.5 text-sm font-bold text-pink-100 disabled:opacity-60"
                >
                  {confirming ? "جاري إرسال التأكيد..." : "إرسال التأكيد"}
                </button>
                {result && <div className="mt-3 text-xs text-[#d7aabd]">{result}</div>}
              </div>
            </div>
          )}
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
