import { phraseHits, profileSearchText } from "../onboarding";
import type { KidsFilter, KidsStance, Member, Prefs, Profile } from "../types";

export type FilterKey = "age" | "city" | "smoking" | "kids" | "intent";

export type FilterCheck = {
  key: FilterKey;
  pass: boolean;
  detail: string;
};

export const HOLD_LABELS: Record<string, string> = {
  age: "Outside your age range",
  city: "Outside your cities",
  smoking: "Smoking doesn't clear your dealbreaker",
  kids: "Kids stance doesn't clear your dealbreaker",
  intent: "Intent doesn't clear your dealbreaker",
  "their-age": "You are outside their age range",
  "their-city": "You are outside their cities",
  "their-smoking": "You don't clear their smoking dealbreaker",
  "their-kids": "You don't clear their kids dealbreaker",
  "their-intent": "You don't clear their intent dealbreaker",
  "must-have": "Doesn't meet a must-have",
  dealbreaker: "Hits a dealbreaker",
  distance: "Outside your max distance",
  "their-must-have": "You don't meet a must-have of theirs",
  "their-dealbreaker": "You hit one of their dealbreakers",
  "their-distance": "You are outside their max distance",
  "looking-for": "Looking for doesn't overlap",
  inactive: "Hasn't locked dealbreakers",
};

function kidsOk(filter: KidsFilter, stance: KidsStance): boolean {
  if (filter === "any") return true;
  if (filter === "wants") return stance === "wants" || stance === "open";
  return stance === "doesnt" || stance === "open";
}

export function evaluateHardFilters(filters: Prefs, profile: Profile): FilterCheck[] {
  const agePass = profile.age >= filters.ageMin && profile.age <= filters.ageMax;
  const cityPass = filters.cities.includes(profile.city);
  const smokingPass = filters.smoking === "any" || profile.smoking === false;
  const kidsPass = kidsOk(filters.kids, profile.kids);
  const intentPass = filters.intent === "any" || filters.intent === profile.intent;

  const smokingDetail = smokingPass
    ? filters.smoking === "no"
      ? "Non-smoker"
      : "You did not set a smoking dealbreaker"
    : "Smokes, which misses your dealbreaker";

  let kidsDetail = "You did not set a kids dealbreaker";
  if (!kidsPass) kidsDetail = "Kids stance misses your dealbreaker";
  else if (filters.kids === "wants" && profile.kids === "wants") kidsDetail = "Wants kids";
  else if (filters.kids === "wants" && profile.kids === "open") kidsDetail = "Open to kids, which clears your kids dealbreaker";
  else if (filters.kids === "doesnt" && profile.kids === "doesnt") kidsDetail = "Doesn't want kids";
  else if (filters.kids === "doesnt" && profile.kids === "open") kidsDetail = "Open to kids, which clears your kids dealbreaker";

  let intentDetail = "You did not set an intent dealbreaker";
  if (!intentPass) intentDetail = "Intent misses your dealbreaker";
  else if (filters.intent === "serious") intentDetail = "Dating seriously";
  else if (filters.intent === "casual") intentDetail = "Looking for something casual";

  return [
    {
      key: "age",
      pass: agePass,
      detail: agePass
        ? `Age ${profile.age} is inside ${filters.ageMin}–${filters.ageMax}`
        : `Age ${profile.age} is outside ${filters.ageMin}–${filters.ageMax}`,
    },
    {
      key: "city",
      pass: cityPass,
      detail: cityPass ? `${profile.city} is one of your cities` : `${profile.city} is outside your cities`,
    },
    { key: "smoking", pass: smokingPass, detail: smokingDetail },
    { key: "kids", pass: kidsPass, detail: kidsDetail },
    { key: "intent", pass: intentPass, detail: intentDetail },
  ];
}

const PLACE_MILES: [string, string, number][] = [
  ["san francisco", "oakland", 12],
  ["san francisco", "berkeley", 14],
  ["san francisco", "los angeles", 380],
  ["oakland", "berkeley", 10],
  ["oakland", "los angeles", 370],
  ["berkeley", "los angeles", 375],
];

const PLACE_ALIASES: Record<string, string> = {
  sf: "san francisco",
  "san fran": "san francisco",
  la: "los angeles",
  oak: "oakland",
};

function canonPlace(value: string): string {
  const raw = value.trim().toLowerCase().replace(/\s+/g, " ");
  const aliased = PLACE_ALIASES[raw] ?? raw;
  const head = aliased.split(",")[0]?.trim() ?? aliased;
  return PLACE_ALIASES[head] ?? head;
}

function placeOf(member: Member): string {
  return canonPlace(member.onboarding.location || member.profile.city || "");
}

/** Miles between two places, or null when the pair is not in the local table. */
export function milesBetween(a: string, b: string): number | null {
  const left = canonPlace(a);
  const right = canonPlace(b);
  if (!left || !right) return null;
  if (left === right) return 0;
  const row = PLACE_MILES.find(([from, to]) => (from === left && to === right) || (from === right && to === left));
  return row ? row[2] : null;
}

function withinMaxDistance(viewer: Member, candidate: Member): boolean {
  const max = viewer.onboarding.maxDistanceMiles;
  if (max == null) return false;
  const miles = milesBetween(placeOf(viewer), placeOf(candidate));
  return miles != null && miles <= max;
}

function firstStructuredMiss(viewer: Member, candidate: Member): FilterKey | null {
  for (const check of evaluateHardFilters(viewer.prefs, candidate.profile)) {
    if (check.pass) continue;
    if (check.key === "city" && withinMaxDistance(viewer, candidate)) continue;
    return check.key;
  }
  return null;
}

function lookingOverlaps(viewer: Member, candidate: Member): boolean {
  const mine = viewer.onboarding.lookingFor ?? [];
  const theirs = candidate.onboarding.lookingFor ?? [];
  if (mine.length === 0 || theirs.length === 0) return false;
  return mine.some((choice) => theirs.includes(choice));
}

function phraseHold(viewer: Member, candidate: Member): "must-have" | "dealbreaker" | null {
  const corpus = profileSearchText(candidate);
  for (const phrase of viewer.onboarding.mustHaves ?? []) {
    if (!phraseHits(corpus, phrase)) return "must-have";
  }
  for (const phrase of viewer.onboarding.dealbreakers ?? []) {
    if (phraseHits(corpus, phrase)) return "dealbreaker";
  }
  return null;
}

function distanceMiss(viewer: Member, candidate: Member): boolean {
  if (viewer.onboarding.maxDistanceMiles == null) return false;
  return !withinMaxDistance(viewer, candidate);
}

/** First reason a pair should stay off the shortlist, or null when both sides clear. */
export function primaryHold(viewer: Member, candidate: Member): string | null {
  if (!viewer.prefs.locked || !candidate.prefs.locked) return "inactive";
  const mine = firstStructuredMiss(viewer, candidate);
  if (mine) return mine;
  const theirs = firstStructuredMiss(candidate, viewer);
  if (theirs) return `their-${theirs}`;
  if (!lookingOverlaps(viewer, candidate)) return "looking-for";
  const phrase = phraseHold(viewer, candidate);
  if (phrase) return phrase;
  const theirPhrase = phraseHold(candidate, viewer);
  if (theirPhrase) return `their-${theirPhrase}`;
  if (distanceMiss(viewer, candidate)) return "distance";
  if (distanceMiss(candidate, viewer)) return "their-distance";
  return null;
}

export function mutualPass(viewer: Member, candidate: Member): boolean {
  return primaryHold(viewer, candidate) === null;
}

export function softRank(viewer: Member, candidate: Member): { score: number; notes: string[] } {
  const overlaps = viewer.profile.interests.filter((interest) => candidate.profile.interests.includes(interest));
  const notes: string[] = [];
  let score = overlaps.length * 3;
  if (overlaps.length) {
    const pretty = overlaps.map((interest) => interest.slice(0, 1).toUpperCase() + interest.slice(1));
    notes.push(`Shared interests: ${pretty.join(", ")}`);
  }
  if (viewer.profile.city === candidate.profile.city) {
    score += 2;
    notes.push("Same city");
  }
  if (viewer.profile.intent === candidate.profile.intent) score += 1;
  return { score, notes };
}
