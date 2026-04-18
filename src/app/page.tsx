import type { Metadata } from "next";
import FitzoneApp from "./FitzoneApp";
import LiveChatWidget from "@/components/LiveChatWidget";

export const metadata: Metadata = {
  title: "FitZone | أفضل نادي سيدات وأطفال في بني سويف",
  description:
    "FitZone أفضل نادي رياضي للسيدات والأطفال في بني سويف. كلاسات يوجا، زومبا، بيلاتس، باقات اشتراك بأسعار مناسبة، مدربات متخصصات، ومتجر منتجات رياضية. سجّلي الآن!",
  keywords: [
    "أفضل نادي سيدات بني سويف",
    "أفضل جيم سيدات بني سويف",
    "نادي سيدات بني سويف",
    "جيم سيدات بني سويف",
    "كلاسات يوجا بني سويف",
    "كلاسات زومبا بني سويف",
    "نادي أطفال بني سويف",
    "اشتراكات جيم بني سويف",
    "FitZone",
    "فيت زون بني سويف",
    "best women gym Beni Suef",
    "ladies gym Beni Suef",
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
    alternateName: "فيت زون - نادي سيدات بني سويف",
    description: "أفضل نادي رياضي للسيدات والأطفال في بني سويف. نقدم كلاسات يوجا وزومبا وبيلاتس، باقات اشتراك متنوعة، مدربات متخصصات، ومتجر منتجات رياضية.",
    url: "https://fitzoneland.com",
    image: "https://fitzoneland.com/fitzone-logo.jpeg",
    logo: "https://fitzoneland.com/fitzone-logo.jpeg",
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      addressLocality: "بني سويف",
      addressRegion: "Beni Suef",
      addressCountry: "EG",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 29.0661,
      longitude: 31.0993,
    },
    areaServed: {
      "@type": "City",
      name: "بني سويف",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
        opens: "07:00",
        closes: "22:00",
      },
    ],
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "كلاسات يوجا", value: true },
      { "@type": "LocationFeatureSpecification", name: "كلاسات زومبا", value: true },
      { "@type": "LocationFeatureSpecification", name: "كلاسات بيلاتس", value: true },
      { "@type": "LocationFeatureSpecification", name: "برامج أطفال", value: true },
      { "@type": "LocationFeatureSpecification", name: "مدربات متخصصات", value: true },
      { "@type": "LocationFeatureSpecification", name: "متجر منتجات رياضية", value: true },
    ],
    sameAs: [
      "https://www.facebook.com/fitzoneland",
      "https://www.instagram.com/fitzoneland",
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "ما هو أفضل نادي سيدات في بني سويف؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FitZone هو أفضل نادي رياضي للسيدات في بني سويف، ويقدم كلاسات يوجا وزومبا وبيلاتس مع مدربات متخصصات، وباقات اشتراك مناسبة لجميع المستويات.",
        },
      },
      {
        "@type": "Question",
        name: "هل يوجد جيم للسيدات فقط في بني سويف؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "نعم، FitZone نادي رياضي مخصص للسيدات والأطفال فقط في بني سويف، مما يوفر بيئة مريحة وآمنة.",
        },
      },
      {
        "@type": "Question",
        name: "ما هي الكلاسات المتاحة في FitZone بني سويف؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "يقدم FitZone كلاسات متنوعة تشمل: يوجا، زومبا، بيلاتس، تمارين القوة، وبرامج مخصصة للأطفال، مع جداول صباحية ومسائية.",
        },
      },
      {
        "@type": "Question",
        name: "كم تكلفة الاشتراك في نادي FitZone بني سويف؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "يقدم FitZone باقات اشتراك متنوعة تناسب جميع الميزانيات، من باقات شهرية وفصلية وسنوية. زوري الموقع لمعرفة أحدث العروض والأسعار.",
        },
      },
      {
        "@type": "Question",
        name: "هل يوجد برامج رياضية للأطفال في بني سويف؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "نعم، يقدم FitZone برامج رياضية متخصصة للأطفال في بني سويف، مصممة لتناسب مختلف الأعمار مع مدربات متخصصات في تدريب الأطفال.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(healthClubJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FitzoneApp />
      <LiveChatWidget />
    </>
  );
}
