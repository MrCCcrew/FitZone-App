"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileStatus = {
  phoneVerified: boolean;
  profileComplete: boolean;
  hasPhone: boolean;
  eligible?: boolean;
};

type Step = "phone" | "code" | "success";

function messageForError(error: unknown): string {
  switch (error) {
    case "INVALID_EGYPTIAN_MOBILE_NUMBER":
      return "أدخلي رقم موبايل مصري صحيح.";
    case "OTP_NOT_APPROVED":
      return "رمز التحقق غير صحيح أو انتهت صلاحيته.";
    case "OTP_RATE_LIMITED":
      return "تم تجاوز عدد المحاولات. حاولي لاحقًا.";
    case "PHONE_CHALLENGE_INVALID":
    case "PHONE_CHALLENGE_REPLAYED":
      return "انتهت محاولة التحقق. أرسلي رمزًا جديدًا.";
    case "OTP_RATE_LIMIT_UNAVAILABLE":
      return "خدمة التحقق غير متاحة مؤقتًا.";
    default:
      return "تعذر إتمام العملية الآن. حاولي مرة أخرى.";
  }
}

export default function ProfilePhoneCompletion() {
  const router = useRouter();

  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successComplete, setSuccessComplete] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/me/phone-verification/status",
        { cache: "no-store", credentials: "same-origin" }
      );

      if (!response.ok) {
        setStatus(null);
        return;
      }

      const data = await response.json() as ProfileStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!open) return;

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  useEffect(() => {
    const openFromProfile = () => {
      if (status?.eligible !== true) return;
      setError("");
      setCode("");
      setChallenge("");
      setStep("phone");
      setChallenge("");
      setOpen(true);
    };

    window.addEventListener("fitzone:verify-profile-phone", openFromProfile);
    return () => {
      window.removeEventListener("fitzone:verify-profile-phone", openFromProfile);
    };
  }, [status]);

  async function submit(endpoint: "send" | "check") {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(
        `/api/me/phone-verification/${endpoint}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            endpoint === "send" ? { phone } : { phone, code, challenge }
          ),
        }
      );

      const data = await response.json().catch(
        () => ({} as Record<string, unknown>)
      );

      if (!response.ok) {
        setError(messageForError(data.error));
        return;
      }

      if (endpoint === "send" && !data.alreadyVerified) {
        if (typeof data.challenge !== "string" || !data.challenge) {
          setError("تعذر بدء التحقق. حاولي مرة أخرى.");
          return;
        }
        setChallenge(data.challenge);
        setStep("code");
        return;
      }

      if (endpoint === "send" && data.alreadyVerified) {
        const statusResponse = await fetch(
          "/api/me/phone-verification/status",
          { cache: "no-store", credentials: "same-origin" }
        );

        if (!statusResponse.ok) {
          setError("تعذر تحديث حالة الملف. حاولي مرة أخرى.");
          return;
        }

        const latest = await statusResponse.json() as ProfileStatus;

        if (!latest.phoneVerified || latest.eligible !== true) {
          setError("لم نتمكن من تأكيد توثيق الرقم.");
          return;
        }

        setSuccessComplete(Boolean(latest.profileComplete));
        setStatus(latest);
        setStep("success");
        setChallenge("");
        setCode("");
        router.refresh();
        return;
      }

      setSuccessComplete(Boolean(data.profileComplete));
      setStep("success");
      setChallenge("");
      setCode("");
      setStatus({
        phoneVerified: true,
        profileComplete: Boolean(data.profileComplete),
        hasPhone: true,
        eligible: true,
      });

      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخدمة. تحققي من الإنترنت وحاولي مجددًا.");
    } finally {
      setBusy(false);
    }
  }

  if (!status || status.eligible !== true) return null;
  if (status.phoneVerified && !open) return null;

  const showReminder =
    !status.phoneVerified && !dismissed && !open;

  return (
    <>
      {showReminder && (
        <div
          dir="rtl"
          className="fixed left-1/2 top-1/2 z-[80] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-pink-300/30 bg-[#341627] p-4 text-white shadow-2xl sm:bottom-5 sm:left-auto sm:right-6 sm:top-auto sm:w-[390px] sm:translate-x-0 sm:translate-y-0"
          role="status"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/20 text-2xl">
              ♡
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">خلّي حسابك مكتمل وآمن</p>
              <p className="mt-1 text-xs leading-6 text-pink-100/80">
                وثّقي رقم موبايلك بخطوة بسيطة علشان نكمّل بياناتك.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setChallenge("");
                  setError("");
                  setOpen(true);
                }}
                className="mt-3 rounded-xl bg-pink-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-pink-400"
              >
                توثيق رقم الهاتف
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="إخفاء التذكير مؤقتًا"
              className="rounded-lg px-2 py-1 text-pink-100/70 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          dir="rtl"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-verify-title"
            className="w-full max-w-md rounded-3xl border border-pink-300/20 bg-[#2b1422] p-6 text-white shadow-2xl sm:p-8"
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="text-3xl" aria-hidden="true">
                {step === "success" ? "🎉" : "🛡️"}
              </span>
              <button
                type="button"
                aria-label="إغلاق نافذة التحقق"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1 text-pink-100/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            <h2
              id="phone-verify-title"
              className="mb-2 text-xl font-black"
            >
              {step === "success"
                ? successComplete
                  ? "اكتمل ملفك الشخصي بنجاح!"
                  : "تم توثيق رقمك بنجاح!"
                : step === "code"
                  ? "أدخلي رمز التحقق"
                  : "وثّقي رقم موبايلك"}
            </h2>

            <p className="mb-6 text-sm leading-7 text-pink-100/75">
              {step === "success"
                ? successComplete
                  ? "كل بيانات ملفك المطلوبة اكتملت. أهلًا بيكي في FitZone!"
                  : "رقمك أصبح موثّقًا. تقدري تكمّلي بياناتك من صفحة حسابك."
                : step === "code"
                  ? "اكتبي الرمز اللي وصلك في رسالة SMS."
                  : "هتوصلك رسالة فيها رمز لتأكيد ملكيتك لرقم الموبايل."}
            </p>

            {step === "phone" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit("send");
                }}
                className="space-y-4"
              >
                <label
                  htmlFor="fitzone-profile-phone"
                  className="block text-sm font-bold"
                >
                  رقم الموبايل المصري
                </label>
                <input
                  id="fitzone-profile-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="01XXXXXXXXX"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={18}
                  required
                  className="w-full rounded-xl border border-pink-200/25 bg-white/10 px-4 py-3 text-left text-white outline-none focus:border-pink-400"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-pink-500 px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  {busy ? "جاري الإرسال..." : "إرسال رمز التحقق"}
                </button>
              </form>
            )}

            {step === "code" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit("check");
                }}
                className="space-y-4"
              >
                <label
                  htmlFor="fitzone-profile-code"
                  className="block text-sm font-bold"
                >
                  رمز التحقق
                </label>
                <input
                  id="fitzone-profile-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  pattern="[0-9]{4,10}"
                  required
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="••••••"
                  className="w-full rounded-xl border border-pink-200/25 bg-white/10 px-4 py-3 text-center text-xl tracking-[0.4em] text-white outline-none focus:border-pink-400"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-pink-500 px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  {busy ? "جاري التحقق..." : "تأكيد رقم الهاتف"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("phone");
                    setChallenge("");
                    setCode("");
                    setError("");
                  }}
                  className="w-full py-2 text-sm text-pink-200"
                >
                  تعديل الرقم أو إعادة إرسال الرمز
                </button>
              </form>
            )}

            {step === "success" && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
                className="w-full rounded-xl bg-pink-500 px-4 py-3 font-bold text-white"
              >
                {successComplete ? "رائع، شكرًا!" : "الذهاب إلى حسابي"}
              </button>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}