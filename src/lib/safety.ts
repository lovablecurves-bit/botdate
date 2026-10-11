import { milesBetween } from "./matchmaker/filters";

/** X accounts younger than this cannot sign in. */
export const MIN_X_ACCOUNT_AGE_DAYS = 90;
/** "Some followers." Empty and brand-new accounts fail this. */
export const MIN_X_FOLLOWERS = 10;
/** Sent bot messages one member may deliver per UTC day. */
export const BOT_MESSAGES_PER_DAY = 25;
/** Distinct reporters that auto-pause a member for founder review. */
export const REPORTS_BEFORE_PAUSE = 3;

export const DATE_SAFETY_TIP = "Meet in a public place, and tell a friend where you're going.";

export const SCAM_MESSAGE_ERROR =
  "BotDate blocked that message and flagged the account. Don't ask for money, crypto, gift cards, investments, wire transfers, off-platform contact, or financial details.";

export const RATE_LIMIT_ERROR = "Your bot has reached today's message limit. Try again tomorrow.";

/**
 * Display name (normalized) → the real X handle, without @.
 * A match is allowed only when the signing-in account is that handle and X says it is verified.
 */
export const FAMOUS_HANDLES: Record<string, string> = {
  "elon musk": "elonmusk",
  "donald trump": "realdonaldtrump",
  "taylor swift": "taylorswift13",
  "barack obama": "barackobama",
  "joe biden": "joebiden",
  "kamala harris": "kamalaharris",
  "jeff bezos": "jeffbezos",
  "bill gates": "billgates",
  "mark zuckerberg": "zuck",
  "tim cook": "tim_cook",
  "sam altman": "sama",
  "oprah winfrey": "oprah",
  "kim kardashian": "kimkardashian",
  "lebron james": "kingjames",
  "cristiano ronaldo": "cristiano",
  "lady gaga": "ladygaga",
  "beyonce": "beyonce",
  "rihanna": "rihanna",
  "kanye west": "kanyewest",
  "selena gomez": "selenagomez",
  "justin bieber": "justinbieber",
  "ariana grande": "arianagrande",
  "dwayne johnson": "therock",
};

export type XSignupProfile = {
  name: string;
  handle: string;
  createdAt?: string;
  followers?: number;
  verified?: boolean;
};

export type ScamHit = { reason: string };

const SCAM_RULES: { reason: string; pattern: RegExp }[] = [
  { reason: "money", pattern: /\b(cash\s*app|cashapp|venmo|paypal|zelle|western union|moneygram|send (?:me )?(?:money|cash|a payment)|wire(?:d| transfer)?)\b/i },
  { reason: "crypto", pattern: /\b(bitcoin|btc|ethereum|\beth\b|usdt|crypto(?:currency)?|seed phrase|wallet address|nft)\b/i },
  { reason: "gift card", pattern: /\bgift\s*cards?\b|\b(?:steam|itunes|google play) cards?\b/i },
  { reason: "investment", pattern: /\b(invest(?:ment)? opportunity|forex|guaranteed returns|double your money|trading signals?)\b/i },
  { reason: "financial info", pattern: /\b(routing number|bank account|iban|swift code|credit card|card number|cvv|social security|\bssn\b)\b/i },
  { reason: "off-platform", pattern: /\b(telegram|whatsapp|whats app|snapchat|\bkik\b|signal me|text me at|call me at|email me at|my number is|off[- ]platform)\b/i },
];

export function normalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/** Error string when this X account may not join. Null when it may. */
export function rejectXSignup(profile: XSignupProfile, now = new Date()): string | null {
  const created = Date.parse(profile.createdAt ?? "");
  if (!Number.isFinite(created)) {
    return "X did not confirm how old this account is, so BotDate cannot sign it in.";
  }
  const ageDays = (now.getTime() - created) / 86_400_000;
  if (ageDays < MIN_X_ACCOUNT_AGE_DAYS) {
    return "This X account is under 90 days old. BotDate only signs in established accounts.";
  }
  const followers = profile.followers ?? 0;
  if (!Number.isFinite(followers) || followers < MIN_X_FOLLOWERS) {
    return "This X account needs more followers before it can join.";
  }
  return impersonationError(profile.name, profile.handle, profile.verified === true);
}

/** Error when a display name impersonates a public figure. Null when the name is fine. */
export function impersonationError(name: string, handle: string | null | undefined, verified: boolean): string | null {
  const norm = normalizePersonName(name);
  if (!norm) return null;
  for (const [famous, allowed] of Object.entries(FAMOUS_HANDLES)) {
    if (norm !== famous && !norm.includes(famous)) continue;
    const real = normalizeHandle(handle ?? "") === allowed && verified;
    if (real) return null;
    return "That name matches a public figure. Only their verified X account can use it.";
  }
  return null;
}

export function scanBotMessage(body: string): ScamHit | null {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return null;
  for (const rule of SCAM_RULES) {
    if (rule.pattern.test(text)) return { reason: rule.reason };
  }
  return null;
}

export function genderWord(pronouns: string): string | null {
  if (pronouns === "she/her") return "Woman";
  if (pronouns === "he/him") return "Man";
  return null;
}

/** Privacy label such as "Woman, 34, Oakland · 12 mi". No name and no photo. */
export function anonymousDescriptor(
  person: { pronouns: string; age: number; city: string },
  viewerCity: string,
): string {
  const parts: string[] = [];
  const gender = genderWord(person.pronouns);
  if (gender) parts.push(gender);
  if (Number.isInteger(person.age) && person.age > 0) parts.push(String(person.age));
  const city = person.city.trim();
  if (city) parts.push(city);
  const head = parts.join(", ") || "Member";
  const miles = city ? milesBetween(viewerCity, city) : null;
  return miles == null ? head : `${head} · ${miles} mi`;
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hide the other person's name in a transcript unless the log is allowed to show it. */
export function redactTranscript(body: string, displayName: string, reveal: "anonymous" | "first-name" | "full"): string {
  const full = displayName.trim();
  if (!full || reveal === "full") return body;
  const tokens = full.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? full;
  const rest = tokens.slice(1);
  if (reveal === "first-name") {
    let next = body.replace(new RegExp(escapeReg(full), "gi"), first);
    for (const token of rest) {
      if (token.length < 2) continue;
      next = next.replace(new RegExp(`\\b${escapeReg(token)}\\b`, "gi"), "");
    }
    return next.replace(/[ ]{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }
  let next = body.replace(new RegExp(escapeReg(full), "gi"), "They");
  if (first.length > 1) {
    next = next.replace(new RegExp(`\\b${escapeReg(first)}'s\\b`, "gi"), "Their");
    next = next.replace(new RegExp(`\\b${escapeReg(first)}\\b`, "gi"), "They");
  }
  for (const token of rest) {
    if (token.length < 2) continue;
    next = next.replace(new RegExp(`\\b${escapeReg(token)}\\b`, "gi"), "");
  }
  return next.replace(/[ ]{2,}/g, " ").trim();
}
