import { isProfileComplete, type Gender, type KidsFilter, type KidsStance, type Member, type Prefs, type Profile, type Seeking } from "../types";

export type FilterKey = "age" | "city" | "smoking" | "kids" | "intent" | "seeking";

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
  seeking: "Outside who you are seeking",
  "their-age": "You are outside their age range",
  "their-city": "You are outside their cities",
  "their-smoking": "You don't clear their smoking dealbreaker",
  "their-kids": "You don't clear their kids dealbreaker",
  "their-intent": "You don't clear their intent dealbreaker",
  "their-seeking": "You are outside who they are seeking",
  inactive: "Hasn't locked dealbreakers",
};

/** True when `seeking` accepts the other member's Man or Woman gender. */
export function seekingMatches(seeking: Seeking | null, gender: Gender | null): boolean {
  if (gender !== "man" && gender !== "woman") return false;
  if (seeking === "either") return true;
  if (seeking === "men") return gender === "man";
  if (seeking === "women") return gender === "woman";
  return false;
}

function seekingDetail(seeking: Seeking | null, gender: Gender | null, pass: boolean): string {
  if (seeking == null) return "You have not set who you are seeking";
  if (gender !== "man" && gender !== "woman") return "Gender is not set";
  const label = gender === "man" ? "Man" : "Woman";
  if (seeking === "either") return "Seeking either men or women";
  const wanted = seeking === "men" ? "men" : "women";
  return pass ? `${label}, which matches seeking ${wanted}` : `${label}, and you are seeking ${wanted}`;
}

function kidsOk(filter: KidsFilter, stance: KidsStance): boolean {
  if (filter === "any") return true;
  if (filter === "wants") return stance === "wants" || stance === "open";
  return stance === "doesnt" || stance === "open";
}

export function evaluateHardFilters(filters: Prefs, profile: Profile): FilterCheck[] {
  const agePass =
    profile.age != null &&
    filters.ageMin != null &&
    filters.ageMax != null &&
    profile.age >= filters.ageMin &&
    profile.age <= filters.ageMax;
  const cityPass = profile.city != null && (filters.cities ?? []).includes(profile.city);
  const smokingPass = filters.smoking === "any" || profile.smoking === false;
  const kidsPass = kidsOk(filters.kids, profile.kids);
  const intentPass = filters.intent === "any" || filters.intent === profile.intent;
  const seekingPass = seekingMatches(filters.seeking, profile.gender);

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
    { key: "seeking", pass: seekingPass, detail: seekingDetail(filters.seeking, profile.gender, seekingPass) },
  ];
}

/** First reason a pair should stay off the shortlist, or null when both sides clear. */
export function primaryHold(viewer: Member, candidate: Member): string | null {
  if (!isProfileComplete(viewer) || !isProfileComplete(candidate)) return "inactive";
  if (!viewer.prefs.locked || !candidate.prefs.locked) return "inactive";
  const mine = evaluateHardFilters(viewer.prefs, candidate.profile).find((check) => !check.pass);
  if (mine) return mine.key;
  const theirs = evaluateHardFilters(candidate.prefs, viewer.profile).find((check) => !check.pass);
  if (theirs) return `their-${theirs.key}`;
  return null;
}

export function mutualPass(viewer: Member, candidate: Member): boolean {
  if (!isProfileComplete(viewer) || !isProfileComplete(candidate)) return false;
  if (!seekingMatches(viewer.prefs.seeking, candidate.profile.gender)) return false;
  if (!seekingMatches(candidate.prefs.seeking, viewer.profile.gender)) return false;
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
  if (viewer.profile.city && viewer.profile.city === candidate.profile.city) {
    score += 2;
    notes.push("Same city");
  }
  if (viewer.profile.intent === candidate.profile.intent) score += 1;
  return { score, notes };
}
