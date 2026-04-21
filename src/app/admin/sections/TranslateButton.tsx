"use client";

import { useState } from "react";

export function TranslateButton({
  from,
  onTranslated,
  endpoint = "/api/admin/translate",
}: {
  from: string;
  onTranslated: (text: string) => void;
  endpoint?: string;
}) {
  const [loading, setLoading] = useState(false);

  const translate = async () => {
    if (!from.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: from }),
      });
      const data = (await res.json()) as { translated?: string; error?: string };
      if (data.translated) {
        onTranslated(data.translated);
      } else {
        window.alert(data.error ?? "تعذر الترجمة.");
      }
    } catch {
      window.alert("تعذر الاتصال بخدمة الترجمة.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={translate}
      disabled={!from.trim() || loading}
      title="ترجم النص العربي إلى الإنجليزية تلقائياً"
      className="flex-shrink-0 rounded-xl border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-xs font-bold text-sky-300 transition-colors hover:bg-sky-950/70 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? "⏳" : "🌐 ترجمة"}
    </button>
  );
}
