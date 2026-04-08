"use client";

import { useEffect, useState } from "react";
import LegalPage from "../legal/LegalPage";

const DEFAULT_POLICY = {
  title: "سياسة الاستخدام والشروط",
  updatedAt: "آخر تحديث: 2026-04-08",
  content:
    "باستخدامك لهذا الموقع أو خدمات Fit Zone فإنك تقر بأنك قرأت هذه السياسة ووافقت عليها.\n\n1) الاستخدام المقبول: يُمنع إساءة الاستخدام أو نشر محتوى مخالف.\n2) الاشتراكات والحجوزات: أي حجز أو اشتراك يتم وفق المواعيد والسياسات المعروضة داخل الموقع.\n3) المدفوعات: يتم الدفع عبر الوسائل المعتمدة داخل الموقع، وأي رسوم موضّحة يتم إظهارها قبل التأكيد النهائي.\n4) المحتوى والملكية الفكرية: جميع المحتويات والصور والشعارات مملوكة لـ Fit Zone أو مرخّصة لها.\n5) التعديلات: نحتفظ بحق تعديل هذه السياسة، وسيتم تحديث تاريخ آخر تعديل أعلاه.",
};

export default function PolicyPage() {
  const [content, setContent] = useState(DEFAULT_POLICY);

  useEffect(() => {
    fetch("/api/site-content?sections=policy", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.policy && typeof data.policy === "object") {
          setContent({ ...DEFAULT_POLICY, ...(data.policy as Partial<typeof DEFAULT_POLICY>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
