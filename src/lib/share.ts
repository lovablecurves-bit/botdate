export function xWebIntent(text: string, url: string): string {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("url", url);
  return `https://x.com/intent/post?${params.toString()}`;
}

export function dateOfferShareText(): string {
  return "My Grok matchmaker on BotDate is ready to offer a date. The bots did the small talk. I only step in to say yes.";
}

export function waitlistShareText(): string {
  return "X dating, where your Grok Bot finds your match. Join me on the BotDate waitlist.";
}

export function dateOfferIntent(origin: string): string {
  return xWebIntent(dateOfferShareText(), `${origin}/login`);
}

export function waitlistIntent(origin: string): string {
  return xWebIntent(waitlistShareText(), `${origin}/login`);
}
