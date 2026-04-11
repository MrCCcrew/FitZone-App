"use client";

import { useEffect, useState } from "react";
import LegalPage from "../legal/LegalPage";

type LegalContent = {
  title: string;
  titleEn?: string;
  updatedAt: string;
  updatedAtEn?: string;
  content: string;
  contentEn?: string;
};

const DEFAULT_REFUND: LegalContent = {
  title: "سياسة الاسترجاع والإلغاء",
  titleEn: "Refund and Cancellation Policy",
  updatedAt: "آخر تحديث: 2026-04-08",
  updatedAtEn: "Last updated: 2026-04-08",
  content:
    "نسعى لتقديم أفضل تجربة. توضح هذه السياسة آلية الاسترجاع والإلغاء.\n\n1) الاشتراكات: قد تكون غير قابلة للاسترداد بعد التفعيل إلا إذا نص العرض على غير ذلك.\n2) الباقات والعروض: تطبق شروط الاسترجاع الخاصة بكل عرض كما تظهر عند الشراء.\n3) الحجوزات: يمكن تعديل المواعيد وفق الشروط الموضحة داخل الحساب.\n4) المنتجات: يمكن استرجاع المنتجات وفق حالة المنتج وسياسة المتجر.\n5) التواصل: للاستفسارات أو طلب الاسترجاع يرجى التواصل مع فريق الدعم.",
  contentEn:
    "We aim to provide the best experience possible. This policy explains how refunds and cancellations are handled.\n\n1) Memberships: they may become non-refundable after activation unless the offer states otherwise.\n2) Packages and offers: each offer follows its own refund terms as shown before purchase.\n3) Bookings: schedules may be adjusted according to the terms shown in the account.\n4) Products: products may be returned depending on their condition and the store policy.\n5) Contact: for questions or refund requests, please contact the support team.",
};

export default function RefundPage() {
  const [content, setContent] = useState<LegalContent>(DEFAULT_REFUND);

  useEffect(() => {
    fetch("/api/site-content?sections=refund", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.refund && typeof data.refund === "object") {
          setContent({ ...DEFAULT_REFUND, ...(data.refund as Partial<LegalContent>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
