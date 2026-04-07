import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
  title: "FitZone Fitness Club | بني سويف",
  description: "أول نادي لياقة بدنية للسيدات والأطفال في بني سويف",
  metadataBase: new URL("https://fitzoneland.com"),
  alternates: { canonical: "https://fitzoneland.com" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
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
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
