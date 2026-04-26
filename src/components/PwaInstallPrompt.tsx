"use client";

import { useEffect, useMemo, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  const visible = useMemo(() => {
    if (dismissed || isStandaloneMode()) return false;
    return Boolean(deferredPrompt) || isIosDevice();
  }, [deferredPrompt, dismissed]);

  async function installApp() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
        setDismissed(true);
      }
      return;
    }

    if (isIosDevice()) {
      setShowIosHelp(true);
    }
  }

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-3xl border border-pink-200/40 bg-[#2a0f1f]/95 p-4 text-[#fff4f8] shadow-[0_24px_80px_rgba(30,8,18,0.35)] backdrop-blur-xl">
        <div className="mb-2 text-sm font-black">ثبتي FitZone على الهاتف</div>
        <div className="mb-3 text-xs leading-6 text-[#f5cddd]">
          افتحي الموقع كتطبيق سريع من الشاشة الرئيسية للوصول السهل للحساب والكلاسات والعروض.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void installApp()}
            className="rounded-2xl bg-pink-600 px-4 py-2 text-sm font-black text-white transition hover:bg-pink-500"
          >
            تثبيت الآن
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-white/75 transition hover:border-white/20 hover:text-white"
          >
            لاحقًا
          </button>
        </div>
      </div>

      {showIosHelp ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-pink-200/20 bg-[#2a0f1f] p-6 text-[#fff4f8] shadow-2xl">
            <div className="mb-3 text-lg font-black">تثبيت التطبيق على iPhone أو iPad</div>
            <div className="space-y-2 text-sm leading-7 text-[#f5cddd]">
              <p>1. اضغطي زر المشاركة في Safari.</p>
              <p>2. اختاري "Add to Home Screen".</p>
              <p>3. اضغطي "Add" وسيظهر FitZone كتطبيق مستقل.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowIosHelp(false)}
              className="mt-5 rounded-2xl bg-pink-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-pink-500"
            >
              فهمت
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
