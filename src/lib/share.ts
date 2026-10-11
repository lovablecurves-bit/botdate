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

export function dateOfferIntent(origin: string): string {
  return xWebIntent(dateOfferShareText(), `${origin}/login`);
}

/** Signup invite. The code is credited when that person creates an account. */
export function signupReferralUrl(code: string): string {
  return `${BOTDATE_PUBLIC_URL}?ref=${code}`;
}
