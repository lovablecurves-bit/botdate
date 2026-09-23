export type KidsStance = "wants" | "open" | "doesnt";
export type Intent = "serious" | "casual";
export type SmokingFilter = "no" | "any";
export type KidsFilter = "wants" | "doesnt" | "any";
export type IntentFilter = Intent | "any";
export type ChannelChoice = "unset" | "human" | "bot";
export type ApprovalStatus = "pending" | "sent" | "killed";
export type ProposalStatus = "proposed" | "confirmed" | "declined" | "withdrawn";

export type Voice = {
  subject: "she" | "he" | "they";
  object: "her" | "him" | "them";
  possessive: "her" | "his" | "their";
};

export type Profile = {
  age: number;
  city: string;
  occupation: string;
  bio: string;
  pronouns: string;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
  interests: string[];
  accent: string;
  voice: Voice;
};

export type Prefs = {
  ageMin: number;
  ageMax: number;
  cities: string[];
  smoking: SmokingFilter;
  kids: KidsFilter;
  intent: IntentFilter;
  niceToHaves: string;
  locked: boolean;
};

export type Member = {
  id: string;
  email: string;
  displayName: string;
  botPaused: boolean;
  profile: Profile;
  prefs: Prefs;
};

export type MemberInput = {
  displayName: string;
  pronouns: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
  interests: string[];
  ageMin: number;
  ageMax: number;
  cities: string[];
  smokingFilter: SmokingFilter;
  kidsFilter: KidsFilter;
  intentFilter: IntentFilter;
  niceToHaves: string;
  locked: boolean;
};

export const CITIES = ["San Francisco", "Oakland", "Berkeley", "Los Angeles"] as const;

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

export const PRONOUNS = ["she/her", "he/him", "they/them"] as const;

export function voiceForPronouns(pronouns: string): Voice {
  if (pronouns === "he/him") return { subject: "he", object: "him", possessive: "his" };
  if (pronouns === "they/them") return { subject: "they", object: "them", possessive: "their" };
  return { subject: "she", object: "her", possessive: "her" };
}

export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function matchIdFor(a: string, b: string): string {
  const [x, y] = canonicalPair(a, b);
  return `match_${x}_${y}`;
}
