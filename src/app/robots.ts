import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/account/",
          "/api/",
          "/login",
          "/register",
          "/verify-email",
          "/payment/verify",
        ],
      },
    ],
    sitemap: "https://fitzoneland.com/sitemap.xml",
    host: "https://fitzoneland.com",
  };
}
