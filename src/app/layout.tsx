import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Fraunces, Outfit } from "next/font/google";
import { FOUNDING_PITCH } from "@/lib/founding";
import { BOTDATE_PUBLIC_URL } from "@/lib/share";
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

const description = `${FOUNDING_PITCH}. A matchmaker for dating. Bots do the small talk. You step in when there is a date to approve.`;

export const metadata: Metadata = {
  metadataBase: new URL(BOTDATE_PUBLIC_URL),
  title: { default: "BotDate", template: "%s · BotDate" },
  description,
  openGraph: {
    title: "BotDate",
    description: `${FOUNDING_PITCH}. Add BotDate to your Grok Bot. Your bot does the dating; you show up to the date.`,
    url: BOTDATE_PUBLIC_URL,
    siteName: "BotDate",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BotDate",
    description: FOUNDING_PITCH,
  },
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
