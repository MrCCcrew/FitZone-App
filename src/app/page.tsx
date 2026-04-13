import type { Metadata } from "next";
import FitzoneApp from "./FitzoneApp";
import LiveChatWidget from "@/components/LiveChatWidget";

export const metadata: Metadata = {
  title: "FitZone Fitness Club",
  description:
    "Women and kids fitness club in Beni Suef with memberships, classes, trainers, offers, shop, and customer account services.",
  keywords: [
    "FitZone",
    "FitZone Fitness Club",
    "فيت زون",
    "نادي فيت زون",
    "جيم بني سويف",
    "جيم للسيدات بني سويف",
    "نادي لياقة في بني سويف",
    "كلاسات رياضية بني سويف",
    "اشتراكات جيم",
    "عروض جيم",
    "gym in Beni Suef",
    "women gym in Beni Suef",
    "fitness club in Beni Suef",
    "gym memberships",
    "fitness classes",
    "personal training",
  ],
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  const healthClubJsonLd = {
    "@context": "https://schema.org",
    "@type": "HealthClub",
    name: "FitZone Fitness Club",
    url: "https://fitzoneland.com",
    image: "https://fitzoneland.com/fitzone-logo.jpeg",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Beni Suef",
      addressCountry: "EG",
    },
    areaServed: "Beni Suef",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(healthClubJsonLd) }}
      />
      <FitzoneApp />
      <LiveChatWidget />
    </>
  );
}
