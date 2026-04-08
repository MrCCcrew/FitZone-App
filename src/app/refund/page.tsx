"use client";

import { useEffect, useState } from "react";
import LegalPage from "../legal/LegalPage";

const DEFAULT_REFUND = {
  title: "سياسة الاسترجاع والإلغاء",
  updatedAt: "آخر تحديث: 2026-04-08",
  content:
    "نسعى لتقديم أفضل تجربة. توضح هذه السياسة آلية الاسترجاع والإلغاء.\n\n1) الاشتراكات: قد تكون غير قابلة للاسترداد بعد التفعيل، إلا إذا نصّت العروض على غير ذلك.\n2) الباقات/العروض: تُطبق شروط الاسترجاع الخاصة بكل عرض كما تظهر عند الشراء.\n3) الحجوزات: يمكن تعديل المواعيد وفق الشروط الموضحة داخل الحساب.\n4) المنتجات: يمكن استرجاع المنتجات وفق حالة المنتج وسياسة المتجر (إن وجدت).\n5) التواصل: للاستفسارات أو طلب استرجاع، يرجى التواصل مع فريق الدعم.",
};

export default function RefundPage() {
  const [content, setContent] = useState(DEFAULT_REFUND);

  useEffect(() => {
    fetch("/api/site-content?sections=refund", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.refund && typeof data.refund === "object") {
          setContent({ ...DEFAULT_REFUND, ...(data.refund as Partial<typeof DEFAULT_REFUND>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
