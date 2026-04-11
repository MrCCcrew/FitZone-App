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

const DEFAULT_POLICY: LegalContent = {
  title: "سياسة الاستخدام والشروط",
  titleEn: "Terms of Use",
  updatedAt: "آخر تحديث: 2026-04-08",
  updatedAtEn: "Last updated: 2026-04-08",
  content:
    "باستخدامك لهذا الموقع أو خدمات Fit Zone فإنك تقر بأنك قرأت هذه السياسة ووافقت عليها.\n\n1) الاستخدام المقبول: يُمنع إساءة الاستخدام أو نشر محتوى مخالف.\n2) الاشتراكات والحجوزات: أي حجز أو اشتراك يتم وفق المواعيد والسياسات المعروضة داخل الموقع.\n3) المدفوعات: يتم الدفع عبر الوسائل المعتمدة داخل الموقع، وأي رسوم موضحة يتم إظهارها قبل التأكيد النهائي.\n4) المحتوى والملكية الفكرية: جميع المحتويات والصور والشعارات مملوكة لـ Fit Zone أو مرخصة لها.\n5) التعديلات: نحتفظ بحق تعديل هذه السياسة، وسيتم تحديث تاريخ آخر تعديل أعلاه.",
  contentEn:
    "By using this website or Fit Zone services, you confirm that you have read and accepted this policy.\n\n1) Acceptable use: misuse of the platform or publishing prohibited content is not allowed.\n2) Memberships and bookings: any booking or subscription is handled according to the schedules and policies shown on the website.\n3) Payments: payment is made through the approved methods shown on the website, and any applicable fees are displayed before final confirmation.\n4) Content and intellectual property: all content, images, and logos are owned by Fit Zone or licensed to it.\n5) Changes: we reserve the right to update this policy, and the last updated date above will be revised when that happens.",
};

export default function PolicyPage() {
  const [content, setContent] = useState<LegalContent>(DEFAULT_POLICY);

  useEffect(() => {
    fetch("/api/site-content?sections=policy", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.policy && typeof data.policy === "object") {
          setContent({ ...DEFAULT_POLICY, ...(data.policy as Partial<LegalContent>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
