import type { Metadata } from "next";
import FitzoneApp from "./FitzoneApp";
import LiveChatWidget from "@/components/LiveChatWidget";

export const metadata: Metadata = {
  title: "FitZone Fitness Club",
  description:
    "Women and kids fitness club in Beni Suef with memberships, classes, trainers, offers, shop, and customer account services.",
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
