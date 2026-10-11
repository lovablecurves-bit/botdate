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

/** Invite-only line. A referral code is appended as ?ref= so the next person is tracked. */
export function waitlistShareText(code?: string): string {
  const link = code ? `${BOTDATE_PUBLIC_URL}?ref=${code}` : BOTDATE_PUBLIC_URL;
  return `I'm in on BotDate 💘 my Grok Bot finds my match. Invite-only for now 👀 ${link}`;
}

export function dateOfferIntent(origin: string): string {
  return xWebIntent(dateOfferShareText(), `${origin}/login`);
}

export function waitlistIntent(): string {
  return xWebIntent(waitlistShareText());
}

export function waitlistReferralUrl(code: string): string {
  return `${BOTDATE_PUBLIC_URL}?ref=${code}`;
}

export function joinedWaitlistIntent(code: string): string {
  return xWebIntent(waitlistShareText(code));
}
