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

const DEFAULT_PRIVACY: LegalContent = {
  title: "سياسة الخصوصية",
  titleEn: "Privacy Policy",
  updatedAt: "آخر تحديث: 2026-04-08",
  updatedAtEn: "Last updated: 2026-04-08",
  content:
    "نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية.\n\n1) البيانات التي نجمعها: الاسم، البريد الإلكتروني، الهاتف، وبيانات الحجز أو الاشتراك عند الحاجة.\n2) استخدام البيانات: لإدارة الحساب، والحجز، وإرسال إشعارات مهمة، وتحسين الخدمة.\n3) مشاركة البيانات: لا نشارك بياناتك مع أطراف خارجية إلا عند الضرورة لتنفيذ الخدمة أو وفق القانون.\n4) الأمان: نستخدم إجراءات مناسبة لحماية البيانات من الوصول غير المصرح به.\n5) حقوقك: يمكنك طلب تعديل أو حذف بياناتك عبر الدعم.",
  contentEn:
    "We respect your privacy and are committed to protecting your personal data.\n\n1) Data we collect: your name, email address, phone number, and booking or membership details when needed.\n2) How we use data: to manage your account, bookings, important notifications, and service improvement.\n3) Sharing data: we do not share your data with third parties unless needed to deliver the service or when required by law.\n4) Security: we use appropriate safeguards to protect your data from unauthorized access.\n5) Your rights: you can request correction or deletion of your data through support.",
};

export default function PrivacyPage() {
  const [content, setContent] = useState<LegalContent>(DEFAULT_PRIVACY);

  useEffect(() => {
    fetch("/api/site-content?sections=privacy", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.privacy && typeof data.privacy === "object") {
          setContent({ ...DEFAULT_PRIVACY, ...(data.privacy as Partial<LegalContent>) });
        }
      })
      .catch(() => {});
  }, []);

  return <LegalPage content={content} />;
}
