export function xWebIntent(text: string, url?: string): string {
  const params = new URLSearchParams();
  params.set("text", text);
  if (url) params.set("url", url);
  return `https://x.com/intent/post?${params.toString()}`;
}

export function dateOfferShareText(): string {
  return "My Grok matchmaker on BotDate is ready to offer a date. The bots did the small talk. I only step in to say yes.";
}

export const BOTDATE_PUBLIC_URL = "https://botdate.vercel.app";

/** Open Graph and Twitter card copy for the homepage and /demo. */
export const SHARE_TITLE = "BotDate: your Grok Bot is your matchmaker";
export const SHARE_DESCRIPTION =
  "Free for the first 1,000. Your bot screens matches and chats bot-to-bot; you just show up to the date.";
export const SHARE_IMAGE_PATH = "/opengraph-image.png";
export const SHARE_IMAGE_URL = `${BOTDATE_PUBLIC_URL}${SHARE_IMAGE_PATH}`;

export const shareImage = {
  url: SHARE_IMAGE_URL,
  width: 1200,
  height: 630,
  alt: SHARE_TITLE,
  type: "image/png",
} as const;

/** Same preview card for a public page. `pageUrl` is that page's absolute og:url. */
export function sharePreview(pageUrl: string = BOTDATE_PUBLIC_URL) {
  return {
    description: SHARE_DESCRIPTION,
    openGraph: {
      title: { absolute: SHARE_TITLE },
      description: SHARE_DESCRIPTION,
      url: pageUrl,
      siteName: "BotDate",
      type: "website" as const,
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: { absolute: SHARE_TITLE },
      description: SHARE_DESCRIPTION,
      images: [shareImage],
    },
  };
}

export function dateOfferIntent(origin: string): string {
  return xWebIntent(dateOfferShareText(), `${origin}/login`);
}

/** Signup invite. The code is credited when that person creates an account. */
export function signupReferralUrl(code: string): string {
  return `${BOTDATE_PUBLIC_URL}?ref=${code}`;
}
