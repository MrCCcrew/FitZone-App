import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | سياسة الاسترجاع والإلغاء في FitZone",
  description:
    "Review FitZone refund and cancellation terms for memberships, bookings, packages, offers, and store products.",
  keywords: [
    "FitZone refund policy",
    "FitZone cancellation policy",
    "سياسة الاسترجاع فيت زون",
    "سياسة الإلغاء FitZone",
    "gym refund policy",
    "fitness club cancellation terms",
  ],
  alternates: {
    canonical: "/refund",
  },
};

export default function RefundLayout({ children }: { children: React.ReactNode }) {
  return children;
}
