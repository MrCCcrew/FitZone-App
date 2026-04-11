"use client";

import { useLang } from "@/lib/language";

type LegalContent = {
  title: string;
  titleEn?: string;
  updatedAt: string;
  updatedAtEn?: string;
  content: string;
  contentEn?: string;
};

function renderContent(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => (
      <p key={`${line}-${idx}`} style={{ margin: "0 0 12px", lineHeight: 1.9 }}>
        {line}
      </p>
    ));
}

export default function LegalPage({ content }: { content: LegalContent }) {
  const { lang } = useLang();
  const isArabic = lang === "ar";
  const localizedTitle = isArabic ? content.title : content.titleEn ?? content.title;
  const localizedUpdatedAt = isArabic ? content.updatedAt : content.updatedAtEn ?? content.updatedAt;
  const localizedContent = isArabic ? content.content : content.contentEn ?? content.content;

  return (
    <main
      dir={isArabic ? "rtl" : "ltr"}
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #F8ECF0 0%, #FFF6F9 100%)",
        color: "#2b1c26",
        fontFamily: "'Cairo', sans-serif",
        padding: "60px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 20,
          padding: "36px 28px",
          boxShadow: "0 20px 50px rgba(233, 30, 99, 0.12)",
          border: "1px solid rgba(233, 30, 99, 0.12)",
        }}
      >
        <button
          type="button"
          onClick={() => {
            window.location.href = "/";
          }}
          style={{
            border: "1px solid rgba(236, 72, 153, 0.35)",
            background: "rgba(236, 72, 153, 0.12)",
            color: "#e91e63",
            fontWeight: 700,
            fontSize: 13,
            borderRadius: 999,
            padding: "8px 16px",
            cursor: "pointer",
            marginBottom: 18,
          }}
        >
          {isArabic ? "العودة للصفحة الرئيسية" : "Back to home"}
        </button>
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>{localizedTitle}</h1>
          <div style={{ fontSize: 13, color: "#8d6c7a" }}>{localizedUpdatedAt}</div>
        </div>
        <div style={{ fontSize: 15 }}>{renderContent(localizedContent)}</div>
      </div>
    </main>
  );
}
