import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { InstallHint } from "@/components/install-hint";
import { PWA_THEME } from "@/lib/pwa";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "BotDate", template: "%s · BotDate" },
  description: "A matchmaker for dating. Bots do the small talk. You step in when there is a date to approve.",
  applicationName: "BotDate",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BotDate", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: PWA_THEME,
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className={outfit.className}>
        {children}
        <InstallHint />
      </body>
    </html>
  );
}
