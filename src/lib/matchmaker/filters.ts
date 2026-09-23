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

/** First reason a pair should stay off the shortlist, or null when both sides clear. */
export function primaryHold(viewer: Member, candidate: Member): string | null {
  if (!viewer.prefs.locked || !candidate.prefs.locked) return "inactive";
  const mine = evaluateHardFilters(viewer.prefs, candidate.profile).find((check) => !check.pass);
  if (mine) return mine.key;
  const theirs = evaluateHardFilters(candidate.prefs, viewer.profile).find((check) => !check.pass);
  if (theirs) return `their-${theirs.key}`;
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
