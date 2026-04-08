"use client";

import { useEffect, useState } from "react";
import LegalPage from "../legal/LegalPage";

const DEFAULT_PRIVACY = {
  title: "سياسة الخصوصية",
  updatedAt: "آخر تحديث: 2026-04-08",
  content:
    "نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية.\n\n1) البيانات التي نجمعها: الاسم، البريد الإلكتروني، الهاتف، وبيانات الحجز/الاشتراك عند الحاجة.\n2) استخدام البيانات: لإدارة الحساب، الحجز، إرسال إشعارات مهمة، وتحسين الخدمة.\n3) مشاركة البيانات: لا نشارك بياناتك مع أطراف خارجية إلا عند الضرورة لتنفيذ الخدمة (مثل شركات الدفع/الشحن) أو وفق القانون.\n4) الأمان: نستخدم إجراءات مناسبة لحماية البيانات من الوصول غير المصرح به.\n5) حقوقك: يمكنك طلب تعديل أو حذف بياناتك عبر الدعم.",
};

export default function PrivacyPage() {
  const [content, setContent] = useState(DEFAULT_PRIVACY);

  useEffect(() => {
    fetch("/api/site-content?sections=privacy", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.privacy && typeof data.privacy === "object") {
          setContent({ ...DEFAULT_PRIVACY, ...(data.privacy as Partial<typeof DEFAULT_PRIVACY>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
