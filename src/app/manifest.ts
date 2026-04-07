import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitZone Fitness Club",
    short_name: "FitZone",
    description: "نادي فيت زون للسيدات والأطفال في بني سويف.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff5fa",
    theme_color: "#e91e63",
    lang: "ar",
    dir: "rtl",
    orientation: "portrait",
    icons: [
      {
        src: "/fitzone-logo.jpeg",
        sizes: "192x192",
        type: "image/jpeg",
      },
      {
        src: "/fitzone-logo.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
      },
      {
        src: "/fitzone-logo.jpeg",
        sizes: "180x180",
        type: "image/jpeg",
        purpose: "any",
      },
    ],
  };
}
