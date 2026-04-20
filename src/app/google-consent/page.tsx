"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/lib/language";

export default function GoogleConsentPage() {
  const router = useRouter();
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "en" ? en : ar;

  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    if (!accepted) {
      setError(t("يجب الموافقة على الشروط أولاً.", "You must accept the terms first."));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; redirectTo?: string };
      if (d.ok) {
        router.replace(d.redirectTo ?? "/");
      } else {
        setError(d.error ?? t("حدث خطأ، حاول مرة أخرى.", "An error occurred. Please try again."));
      }
    } catch {
      setError(t("تعذر الاتصال بالخادم.", "Could not connect to server."));
    } finally {
      setLoading(false);
    }
  }

  function handleDecline() {
    router.replace("/login");
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#0f0a0c,#1a0c14)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'Cairo','Tajawal',sans-serif",
      direction: lang === "ar" ? "rtl" : "ltr",
    }}>
      <div style={{
        background: "rgba(255,255,255,.04)",
        border: "1px solid rgba(233,30,99,.25)",
        borderRadius: 24,
        padding: "32px 28px",
        maxWidth: 560,
        width: "100%",
        boxShadow: "0 24px 60px rgba(0,0,0,.5)",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📋</div>
          <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 22, marginBottom: 8 }}>
            {t("مرحباً بك في FitZone 🎉", "Welcome to FitZone 🎉")}
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.7 }}>
            {t(
              "قبل إكمال التسجيل بحساب جوجل، يرجى قراءة والموافقة على الشروط والتعليمات التالية.",
              "Before completing your Google sign-up, please read and agree to the following terms and instructions."
            )}
          </p>
        </div>

        {/* Terms box */}
        <div style={{
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 16,
          padding: "20px 18px",
          marginBottom: 20,
          maxHeight: 320,
          overflowY: "auto",
        }}>
          <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            📌 {t("التعليمات وشروط إنشاء الحساب", "Account Creation Terms & Instructions")}
          </p>

          {[
            ["🔐", t("تفعيل الحساب", "Account Activation"),
              t("حسابك مرتبط بحساب جوجل ويمكن استخدامه فوراً.", "Your account is linked to Google and can be used immediately.")],
            ["🎁", t("نقاط الولاء", "Loyalty Points"),
              t("كل 1 جنيه = نقاط تراكمية تستخدمها على أي خدمة. صلاحيتها 6 شهور.", "Every 1 EGP = cumulative points usable on any service. Valid for 6 months.")],
            ["🎉", t("نقاط الترحيب", "Welcome Points"),
              t("بمجرد إنشاء الحساب، هيتم إضافة 100 نقطة هدية ترحيباً بيكِ 🎁", "Upon account creation, 100 gift points will be added as a welcome bonus 🎁")],
            ["👥", t("نظام الإحالة", "Referral System"),
              t("ستجدين كود الإحالة الخاص بك داخل حسابك. شاركيه مع أصحابك — لما أي عضو يشترك في باقة مدفوعة باستخدام كودك، هتاخدي 50 جنيه رصيد في محفظتك.", "You'll find your referral code in your profile. Share it — when any member subscribes to a paid plan using your code, you earn 50 EGP wallet credit.")],
            ["🔒", t("الأمان والخصوصية", "Security & Privacy"),
              t("بياناتك سرية تماماً ولن تُشارك مع أي طرف ثالث.", "Your data is completely confidential and will not be shared with any third party.")],
            ["📞", t("الدعم", "Support"),
              t("في أي مشكلة، تقدري تتواصلي مع خدمة العملاء في أي وقت.", "For any issue, you can contact customer service at any time.")],
          ].map(([icon, title, body]) => (
            <div key={String(title)} style={{ marginBottom: 12 }}>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{icon} {title}</p>
              <p style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.7, paddingRight: 4 }}>• {body}</p>
            </div>
          ))}

          <div style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 12, marginTop: 4 }}>
            <p style={{ color: "#f472b6", fontSize: 13, fontWeight: 600 }}>
              ✔️ {t("التسجيل سهل وسريع — ابدئي الآن واستفيدي من النقاط والهدايا 🎁", "Quick & easy sign-up — start now and enjoy points and gifts 🎁")}
            </p>
          </div>
        </div>

        {/* Checkbox */}
        <label style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          cursor: "pointer",
          marginBottom: 20,
          color: "#d1d5db",
          fontSize: 14,
          lineHeight: 1.6,
        }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            style={{ marginTop: 3, accentColor: "#e91e63", width: 16, height: 16, flexShrink: 0 }}
          />
          {t("قرأت وأوافق على جميع التعليمات والشروط المذكورة أعلاه.", "I have read and agree to all the terms and instructions above.")}
        </label>

        {error && (
          <div style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.3)",
            color: "#f87171",
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <button
          onClick={handleAccept}
          disabled={loading || !accepted}
          style={{
            width: "100%",
            padding: "13px",
            borderRadius: 12,
            border: "none",
            background: accepted ? "linear-gradient(135deg,#e91e63,#c2185b)" : "rgba(255,255,255,.08)",
            color: accepted ? "#fff" : "#6b7280",
            fontWeight: 900,
            fontSize: 15,
            cursor: loading || !accepted ? "not-allowed" : "pointer",
            marginBottom: 10,
            fontFamily: "inherit",
            transition: "all .2s",
            boxShadow: accepted ? "0 8px 24px rgba(233,30,99,.3)" : "none",
          }}
        >
          {loading ? t("⏳ جاري الدخول...", "⏳ Signing in...") : t("✅ أوافق وأكمل التسجيل", "✅ Agree and continue")}
        </button>

        <button
          onClick={handleDecline}
          disabled={loading}
          style={{
            width: "100%",
            padding: "11px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.1)",
            background: "transparent",
            color: "#9ca3af",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("إلغاء والعودة لتسجيل الدخول", "Cancel and go back to login")}
        </button>
      </div>
    </div>
  );
}
