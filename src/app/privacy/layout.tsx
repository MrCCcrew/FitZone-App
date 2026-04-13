import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | سياسة الخصوصية في FitZone",
  description:
    "Learn how FitZone handles personal data, account information, bookings, memberships, and service-related privacy protections.",
  keywords: [
    "FitZone privacy policy",
    "سياسة الخصوصية فيت زون",
    "privacy policy gym website",
    "fitness club privacy policy",
    "data privacy FitZone",
    "حماية البيانات FitZone",
  ],
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
