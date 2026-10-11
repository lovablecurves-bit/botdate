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

/** The product account mentioned on every public shot. */
export const BOTDATE_X_ACCOUNT = "BotDateApp";

const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** @handle without the @. Null when it is not a real X handle. */
export function crushHandle(value: string): string | null {
  const handle = value.trim().replace(/^@+/, "");
  if (!X_HANDLE.test(handle)) return null;
  return handle;
}

/** Default line when the member's bot does not write one. */
export function shotTemplate(handle: string): string {
  return `@${handle} my bot thinks we'd be a great match. Go on a BotDate with me? 💘`;
}

export function memberReferralLink(code: string): string {
  return `${BOTDATE_PUBLIC_URL}?ref=${code}`;
}

/**
 * Cute post for one crush. The text always names @BotDateApp and the member's referral link.
 * `message` is the bot's line when they wrote one; otherwise the template is used.
 * This does not call X. The member posts it themselves.
 */
export function composeShot(input: { handle: string; code: string; message?: string | null }):
  | { handle: string; text: string; intentUrl: string }
  | { error: string } {
  const handle = crushHandle(input.handle);
  if (!handle) return { error: "Enter an X handle. Letters, numbers, and underscores, up to 15 characters." };
  if (handle.toLowerCase() === BOTDATE_X_ACCOUNT.toLowerCase()) return { error: "Pick a person, not @BotDateApp." };
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9]{6,16}$/.test(code)) return { error: "A referral code is required." };
  const link = memberReferralLink(code);
  const custom = (input.message ?? "").replace(/\s+/g, " ").trim();
  let text = custom || shotTemplate(handle);
  if (!new RegExp(`@${handle}\\b`, "i").test(text)) text = `@${handle} ${text}`;
  if (!/@BotDateApp\b/i.test(text)) text = `${text} via @BotDateApp`;
  if (!text.includes(link)) text = `${text} ${link}`;
  return { handle, text, intentUrl: xWebIntent(text) };
}
