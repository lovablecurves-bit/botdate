import type { MetadataRoute } from "next";
import { PWA_BACKGROUND, PWA_THEME } from "@/lib/pwa";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BotDate",
    short_name: "BotDate",
    description: "A matchmaker for dating. Bots do the small talk. You step in when there is a date to approve.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
