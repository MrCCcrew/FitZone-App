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
    default: "FitZone Fitness Club | نادي لياقة للسيدات والأطفال في بني سويف",
    template: "%s | FitZone Fitness Club",
  },
  description:
    "FitZone Fitness Club in Beni Suef for women and kids. Memberships, classes, trainers, offers, shop, and customer account services in one place.",
  metadataBase: new URL("https://fitzoneland.com"),
  alternates: {
    canonical: "https://fitzoneland.com",
  },
  applicationName: "FitZone",
  keywords: [
    "FitZone",
    "FitZone Beni Suef",
    "gym in Beni Suef",
    "women fitness club",
    "kids fitness",
    "fitness memberships",
    "gym classes",
    "personal training",
  ],
  category: "fitness",
  openGraph: {
    type: "website",
    url: "https://fitzoneland.com",
    siteName: "FitZone Fitness Club",
    title: "FitZone Fitness Club",
    description:
      "Women and kids fitness club in Beni Suef with memberships, classes, trainers, offers, shop, and account services.",
    locale: "ar_EG",
    images: [
      {
        url: "/fitzone-logo.jpeg",
        width: 1200,
        height: 1200,
        alt: "FitZone Fitness Club",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FitZone Fitness Club",
    description:
      "Women and kids fitness club in Beni Suef with memberships, classes, trainers, offers, and shop services.",
    images: ["/fitzone-logo.jpeg"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
    url: "https://fitzoneland.com",
    logo: "https://fitzoneland.com/fitzone-logo.jpeg",
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FitZone Fitness Club",
    url: "https://fitzoneland.com",
    inLanguage: ["ar", "en"],
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
