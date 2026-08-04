import type { Metadata } from "next";
import FitzoneApp, { type InitialHomeData } from "./FitzoneApp";
import AICoachClientOnly from "@/components/AICoachClientOnly";
import HydrationAuthDebugProbe, { type HydrationServerSnapshot } from "@/components/HydrationAuthDebugProbe";
import { getInitialHomeData as loadInitialHomeData } from "@/lib/home-initial-data";
import { getHydrationServerSessionMarker, isHydrationAuthDebugEnabled } from "@/lib/hydration-auth-debug-server";

export const dynamic = "force-dynamic";

async function getInitialHomeData() {
  try {
    return await loadInitialHomeData() as InitialHomeData;
  } catch {
    return { memberships: [], offers: [], hero: null, announcements: [] } as InitialHomeData;
  }
}

export const metadata: Metadata = {
  icons: {
    icon: "/fitzone-logo-200.jpeg",
    apple: "/fitzone-logo-200.jpeg",
  },
  title: "FitZone | أفضل نادي سيدات في بني سويف ومصر",
  description:
    "FitZone أفضل نادي رياضي للسيدات والأطفال في بني سويف، مصر. كلاسات يوجا، زومبا، بيلاتس، باقات اشتراك بأسعار مناسبة، مدربات متخصصات، ومتجر منتجات رياضية. سجّلي الآن!",
  keywords: [
    "أفضل نادي سيدات بني سويف",
    "أفضل جيم سيدات بني سويف",
    "نادي سيدات بني سويف",
    "جيم سيدات بني سويف",
    "أفضل نادي سيدات في مصر",
    "جيم سيدات في مصر",
    "نادي سيدات مصر",
    "كلاسات يوجا بني سويف",
    "كلاسات زومبا بني سويف",
    "نادي أطفال بني سويف",
    "اشتراكات جيم بني سويف",
    "FitZone",
    "فيت زون بني سويف",
    "best women gym Beni Suef",
    "ladies gym Egypt",
  ],
  alternates: {
    canonical: "/",
  },
};

const isolationSections = new Set(["hero", "announcement", "offers", "memberships", "home-widgets", "tour", "ai-coach", "push-prompt"]);

export default async function Home({ searchParams }: { searchParams: Promise<{ hydrationDisable?: string | string[] }> }) {
  const requestedDisable = (await searchParams).hydrationDisable;
  const requestedSection = Array.isArray(requestedDisable) ? requestedDisable[0] : requestedDisable;
  const hydrationDisable = isHydrationAuthDebugEnabled() && requestedSection && isolationSections.has(requestedSection)
    ? requestedSection
    : undefined;
  const announcementRendered = hydrationDisable !== "announcement";
  const initialHomeData = await getInitialHomeData();
  const hydrationDebugEnabled = isHydrationAuthDebugEnabled();
  const session = hydrationDebugEnabled ? await getHydrationServerSessionMarker() : null;
  const hydrationSnapshot: HydrationServerSnapshot | null = hydrationDebugEnabled
    ? {
        hasSession: session?.hasSession ?? false,
        role: session?.role ?? null,
        lang: "ar",
        dir: "rtl",
        currentPage: "home",
        // Hero content is loaded with the same server snapshot used by the
        // first client render, so hydration observes identical content.
        heroSlideIds: Array.isArray(initialHomeData.hero?.slides) ? initialHomeData.hero.slides.filter((slide): slide is string => typeof slide === "string") : [],
        offerIds: initialHomeData.offers.map((offer) => offer.id),
        membershipIds: initialHomeData.memberships.map((membership) => membership.id),
        conditionalComponents: ["FitzoneApp", "AICoachClientOnly"],
      }
    : null;
  if (hydrationSnapshot) {
    console.info("[Hydration auth debug server]", {
      component: "page",
      hasSession: hydrationSnapshot.hasSession,
      role: hydrationSnapshot.role,
      lang: hydrationSnapshot.lang,
      dir: hydrationSnapshot.dir,
      currentPage: hydrationSnapshot.currentPage,
      heroSlideCount: hydrationSnapshot.heroSlideIds.length,
      heroSlideIds: hydrationSnapshot.heroSlideIds,
      offerCount: hydrationSnapshot.offerIds.length,
      offerIds: hydrationSnapshot.offerIds,
      membershipCount: hydrationSnapshot.membershipIds.length,
      membershipIds: hydrationSnapshot.membershipIds,
      conditionalComponents: hydrationSnapshot.conditionalComponents,
    });
    console.info("[Hydration isolation server]", { hydrationDisable: hydrationDisable ?? null, announcementRendered });
  }
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
    areaServed: [
      { "@type": "City", name: "بني سويف" },
      { "@type": "Country", name: "مصر" },
    ],
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
      {
        "@type": "Question",
        name: "أين أجد نادي سيدات في مصر؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FitZone في بني سويف من أفضل أندية السيدات في مصر، ويقدم بيئة رياضية مخصصة للسيدات والأطفال مع مدربات متخصصات وكلاسات متنوعة.",
        },
      },
      {
        "@type": "Question",
        name: "ما هو أفضل جيم للسيدات في مصر؟",
        acceptedAnswer: {
          "@type": "Answer",
          text: "FitZone في بني سويف يُعدّ من أفضل أندية اللياقة للسيدات في مصر، حيث يجمع بين الكلاسات المتنوعة والمدربات المتخصصات والأسعار المناسبة.",
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
      <FitzoneApp initialHomeData={initialHomeData} hydrationDisable={hydrationDisable} />
      {hydrationSnapshot && <HydrationAuthDebugProbe snapshot={hydrationSnapshot} />}
      {hydrationDisable !== "ai-coach" && <AICoachClientOnly />}
    </>
  );
}
