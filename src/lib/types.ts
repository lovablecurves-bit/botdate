export type KidsStance = "wants" | "open" | "doesnt";
export type Intent = "serious" | "casual";
export type SmokingFilter = "no" | "any";
export type KidsFilter = "wants" | "doesnt" | "any";
export type IntentFilter = Intent | "any";
/** Who a member wants to meet. Unknown until their own bot sets it. */
export type Seeking = "men" | "women" | "either";
export type ChannelChoice = "unset" | "human" | "bot";
export type ApprovalStatus = "pending" | "sent" | "killed";
export type ProposalStatus = "proposed" | "confirmed" | "declined" | "withdrawn";

export type Voice = {
  subject: "she" | "he" | "they";
  object: "her" | "him" | "them";
  possessive: "her" | "his" | "their";
};

/** Man or Woman. Unknown until the member's own bot sets it. */
export type Gender = "man" | "woman";

export type Profile = {
  age: number | null;
  city: string | null;
  occupation: string;
  bio: string;
  gender: Gender | null;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
  interests: string[];
  accent: string;
  voice: Voice;
};

export type Prefs = {
  ageMin: number | null;
  ageMax: number | null;
  cities: string[] | null;
  smoking: SmokingFilter;
  kids: KidsFilter;
  intent: IntentFilter;
  /** men, women, or either. Null until the member sets it. */
  seeking: Seeking | null;
  niceToHaves: string;
  locked: boolean;
};

export type XAccount = {
  userId: string;
  handle: string;
  avatarUrl: string;
};

export type Member = {
  id: string;
  email: string;
  displayName: string;
  botPaused: boolean;
  profile: Profile;
  prefs: Prefs;
  xAccount: XAccount | null;
  /** First real X member. Demo profiles are never the founder. */
  founder: boolean;
  /** 1-based number among real X members. Null on the demo roster. */
  memberNumber: number | null;
  /** First-login Connect your Grok Bot step has been dismissed. */
  connectSeen: boolean;
  /** Stripe Customer id, once Checkout has created one. */
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** Stripe subscription status: active, trialing, canceled, and the rest. Empty until a webhook writes one. */
  subscriptionStatus: string | null;
};

export type MemberInput = {
  displayName: string;
  gender: Gender | null;
  age: number | null;
  city: string | null;
  occupation: string;
  bio: string;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
  interests: string[];
  ageMin: number | null;
  ageMax: number | null;
  cities: string[] | null;
  smokingFilter: SmokingFilter;
  kidsFilter: KidsFilter;
  intentFilter: IntentFilter;
  seeking: Seeking | null;
  niceToHaves: string;
  locked: boolean;
};

/** Suggested cities. Austin first, then Bastrop. Bots may also save any other city as free text. */
export const CITIES = ["Austin", "Bastrop", "San Francisco", "Oakland", "Berkeley", "Los Angeles"] as const;

export const INTERESTS = [
  "cooking",
  "libraries",
  "walking",
  "design",
  "architecture",
  "cities",
  "hospitality",
  "music",
  "markets",
  "climate",
  "reading",
  "hiking",
  "coffee",
  "film",
  "galleries",
  "health",
  "art",
] as const;

export function voiceForGender(gender: Gender | null): Voice {
  if (gender === "man") return { subject: "he", object: "him", possessive: "his" };
  if (gender === "woman") return { subject: "she", object: "her", possessive: "her" };
  return { subject: "they", object: "them", possessive: "their" };
}

export function genderLabel(gender: Gender | null): string {
  if (gender === "man") return "Man";
  if (gender === "woman") return "Woman";
  return "";
}

export function parseSeeking(value: string): Seeking | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "men" || normalized === "women" || normalized === "either") return normalized;
  return null;
}

/** Age, city, gender, who they are seeking, and a real preference range are set. Until then the member is not browsable or matchable. */
export function isProfileComplete(member: {
  profile: Pick<Profile, "age" | "city" | "gender">;
  prefs: Pick<Prefs, "ageMin" | "ageMax" | "cities" | "seeking">;
}): boolean {
  const { age, city, gender } = member.profile;
  const { ageMin, ageMax, cities, seeking } = member.prefs;
  return (
    typeof age === "number" &&
    Number.isInteger(age) &&
    age >= 18 &&
    age <= 99 &&
    typeof city === "string" &&
    city.trim().length >= 2 &&
    (gender === "man" || gender === "woman") &&
    (seeking === "men" || seeking === "women" || seeking === "either") &&
    typeof ageMin === "number" &&
    Number.isInteger(ageMin) &&
    typeof ageMax === "number" &&
    Number.isInteger(ageMax) &&
    ageMin >= 18 &&
    ageMax <= 99 &&
    ageMin <= ageMax &&
    Array.isArray(cities) &&
    cities.length > 0
  );
}

export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function matchIdFor(a: string, b: string): string {
  const [x, y] = canonicalPair(a, b);
  return `match_${x}_${y}`;
}
