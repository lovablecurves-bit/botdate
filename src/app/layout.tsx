import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Fraunces, Outfit } from "next/font/google";
import { BOTDATE_PUBLIC_URL, sharePreview } from "@/lib/share";
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

const preview = sharePreview();

export const metadata: Metadata = {
  metadataBase: new URL(BOTDATE_PUBLIC_URL),
  title: { default: "BotDate", template: "%s · BotDate" },
  description: preview.description,
  openGraph: preview.openGraph,
  twitter: preview.twitter,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fff0f8",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable}`}>
      <body className={outfit.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
