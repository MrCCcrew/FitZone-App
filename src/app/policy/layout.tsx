import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | شروط استخدام FitZone",
  description:
    "Read the FitZone terms of use, payment terms, booking conditions, and website usage guidelines for customers and visitors.",
  keywords: [
    "FitZone terms",
    "FitZone terms of use",
    "شروط استخدام فيت زون",
    "سياسة الاستخدام FitZone",
    "gym terms and conditions",
    "fitness club terms",
  ],
  alternates: {
    canonical: "/policy",
  },
};

export default function PolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
