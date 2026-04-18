import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FitZone | أفضل نادي سيدات وأطفال في بني سويف",
    template: "%s | FitZone نادي سيدات بني سويف",
  },
  description:
    "FitZone أفضل نادي رياضي للسيدات والأطفال في بني سويف. كلاسات يوجا، زومبا، بيلاتس، باقات اشتراك بأسعار مناسبة، مدربات متخصصات، ومتجر منتجات رياضية. سجّلي الآن!",
  metadataBase: new URL("https://fitzoneland.com"),
  alternates: {
    canonical: "https://fitzoneland.com",
    languages: {
      "ar-EG": "https://fitzoneland.com",
      "en": "https://fitzoneland.com",
    },
  },
  applicationName: "FitZone",
  keywords: [
    // Arabic local keywords (highest priority)
    "أفضل نادي سيدات بني سويف",
    "أفضل جيم سيدات بني سويف",
    "نادي سيدات بني سويف",
    "جيم سيدات بني سويف",
    "نادي رياضي للسيدات بني سويف",
    "جيم للبنات بني سويف",
    "نادي لياقة سيدات",
    "أفضل جيم للسيدات",
    "أفضل نادي سيدات",
    "كلاسات يوجا بني سويف",
    "كلاسات زومبا بني سويف",
    "كلاسات بيلاتس بني سويف",
    "نادي أطفال بني سويف",
    "جيم أطفال بني سويف",
    "اشتراكات جيم بني سويف",
    "باقات جيم بني سويف",
    "عروض جيم بني سويف",
    "مدربات لياقة بني سويف",
    "متجر مكملات رياضية بني سويف",
    "منتجات رياضية بني سويف",
    "فيت زون",
    "فيت زون بني سويف",
    "نادي فيت زون",
    "FitZone",
    "FitZone Beni Suef",
    // English keywords
    "best women gym Beni Suef",
    "ladies gym Beni Suef",
    "women fitness club Beni Suef",
    "kids gym Beni Suef",
    "yoga classes Beni Suef",
    "zumba classes Beni Suef",
    "gym memberships Beni Suef",
    "fitness club Beni Suef",
    "personal training Beni Suef",
  ],
  category: "fitness",
  openGraph: {
    type: "website",
    url: "https://fitzoneland.com",
    siteName: "FitZone نادي سيدات بني سويف",
    title: "FitZone | أفضل نادي سيدات وأطفال في بني سويف",
    description:
      "أفضل نادي رياضي للسيدات والأطفال في بني سويف. كلاسات يوجا وزومبا وبيلاتس، باقات اشتراك، مدربات متخصصات، ومتجر رياضي.",
    locale: "ar_EG",
    images: [
      {
        url: "/fitzone-logo.jpeg",
        width: 1200,
        height: 1200,
        alt: "FitZone أفضل نادي سيدات بني سويف",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FitZone | أفضل نادي سيدات وأطفال في بني سويف",
    description:
      "أفضل نادي رياضي للسيدات والأطفال في بني سويف. كلاسات يوجا وزومبا وبيلاتس، باقات اشتراك، ومتجر رياضي.",
    images: ["/fitzone-logo.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/fitzone-logo.jpeg",
    shortcut: "/fitzone-logo.jpeg",
    apple: "/fitzone-logo.jpeg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FitZone",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e91e63",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "FitZone Fitness Club",
    alternateName: "فيت زون بني سويف",
    url: "https://fitzoneland.com",
    logo: "https://fitzoneland.com/fitzone-logo.jpeg",
    image: "https://fitzoneland.com/fitzone-logo.jpeg",
    address: {
      "@type": "PostalAddress",
      addressLocality: "بني سويف",
      addressCountry: "EG",
    },
    sameAs: [
      "https://www.facebook.com/fitzoneland",
      "https://www.instagram.com/fitzoneland",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FitZone | نادي سيدات بني سويف",
    url: "https://fitzoneland.com",
    inLanguage: ["ar", "en"],
    potentialAction: {
      "@type": "SearchAction",
      target: "https://fitzoneland.com/?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (typeof window === "undefined") return;
                if (window.location.hostname === "www.fitzoneland.com") {
                  window.location.replace(
                    "https://fitzoneland.com" +
                      window.location.pathname +
                      window.location.search +
                      window.location.hash
                  );
                }
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
