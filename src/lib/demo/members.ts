import type { Intent, KidsStance, Member, Prefs, Profile, Voice } from "../types";

const SHE: Voice = { subject: "she", object: "her", possessive: "her" };
const HE: Voice = { subject: "he", object: "him", possessive: "his" };
const THEY: Voice = { subject: "they", object: "them", possessive: "their" };

type Seed = {
  id: string;
  displayName: string;
  pronouns: string;
  voice: Voice;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
  interests: string[];
  accent: string;
  prefs: Omit<Prefs, "locked"> & { locked?: boolean };
};

function member(seed: Seed): Member {
  const profile: Profile = {
    age: seed.age,
    city: seed.city,
    occupation: seed.occupation,
    bio: seed.bio,
    pronouns: seed.pronouns,
    smoking: seed.smoking,
    kids: seed.kids,
    intent: seed.intent,
    interests: seed.interests,
    accent: seed.accent,
    voice: seed.voice,
  };
  return {
    id: seed.id,
    email: `${seed.id}@demo.botdate`,
    displayName: seed.displayName,
    botPaused: false,
    profile,
    prefs: { ...seed.prefs, locked: seed.prefs.locked !== false },
  };
}

export const DEMO_MEMBERS: Member[] = [
  member({
    id: "avery",
    displayName: "Avery Chen",
    pronouns: "she/her",
    voice: SHE,
    age: 32,
    city: "San Francisco",
    occupation: "Product designer",
    bio: "Designs tools for public libraries. Weekends are a ferry, a long lunch, and cooking for more people than herself.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["cooking", "libraries", "walking", "design"],
    accent: "#c92a4a",
    prefs: {
      ageMin: 28,
      ageMax: 38,
      cities: ["San Francisco", "Oakland"],
      smoking: "no",
      kids: "wants",
      intent: "serious",
      niceToHaves: "Someone steady who likes the city on foot and does not treat plans as a personality.",
    },
  }),
  member({
    id: "jordan",
    displayName: "Jordan Hale",
    pronouns: "he/him",
    voice: HE,
    age: 34,
    city: "San Francisco",
    occupation: "Architect",
    bio: "Works on adaptive reuse — old buildings, new use. Serious about who gets his slow mornings.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["architecture", "walking", "cooking", "cities"],
    accent: "#8e2344",
    prefs: {
      ageMin: 29,
      ageMax: 40,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "any",
      intent: "serious",
      niceToHaves: "A person who is kind in ordinary logistics, not only on a first date.",
    },
  }),
  member({
    id: "sam",
    displayName: "Sam Okonkwo",
    pronouns: "they/them",
    voice: THEY,
    age: 30,
    city: "Oakland",
    occupation: "Chef",
    bio: "Runs a small weekend supper club. Believes a first meeting should have a table and enough quiet to talk.",
    smoking: false,
    kids: "wants",
    intent: "serious",
    interests: ["cooking", "hospitality", "music", "markets"],
    accent: "#a33b62",
    prefs: {
      ageMin: 27,
      ageMax: 36,
      cities: ["San Francisco", "Oakland"],
      smoking: "no",
      kids: "wants",
      intent: "serious",
      niceToHaves: "Someone who eats with attention and does not rush the evening.",
    },
  }),
  member({
    id: "riley",
    displayName: "Riley Park",
    pronouns: "she/her",
    voice: SHE,
    age: 29,
    city: "San Francisco",
    occupation: "Climate researcher",
    bio: "Studies coastal fog and still gets cold on the bus. Looking for someone steady who reads the whole menu.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["climate", "reading", "hiking", "walking"],
    accent: "#b4234a",
    prefs: {
      ageMin: 28,
      ageMax: 38,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "any",
      intent: "serious",
      niceToHaves: "Reliability, and a person who asks real questions.",
    },
  }),
  member({
    id: "noah",
    displayName: "Noah Ibarra",
    pronouns: "he/him",
    voice: HE,
    age: 33,
    city: "San Francisco",
    occupation: "Nurse",
    bio: "Works nights in a city hospital. Kind, serious, and decided against having kids.",
    smoking: false,
    kids: "doesnt",
    intent: "serious",
    interests: ["health", "cooking", "walking", "coffee"],
    accent: "#6e2c48",
    prefs: {
      ageMin: 28,
      ageMax: 40,
      cities: ["San Francisco", "Oakland"],
      smoking: "no",
      kids: "doesnt",
      intent: "serious",
      niceToHaves: "Someone who understands a rotating schedule.",
    },
  }),
  member({
    id: "alex",
    displayName: "Alex Kim",
    pronouns: "she/her",
    voice: SHE,
    age: 33,
    city: "San Francisco",
    occupation: "High school teacher",
    bio: "Teaches literature and cooks on Sundays. Wants kids, and wants someone a little further into their thirties.",
    smoking: false,
    kids: "wants",
    intent: "serious",
    interests: ["reading", "cooking", "libraries", "hiking"],
    accent: "#9a2e4a",
    prefs: {
      ageMin: 34,
      ageMax: 42,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "wants",
      intent: "serious",
      niceToHaves: "A person who reads and keeps a Sunday relatively free.",
    },
  }),
  member({
    id: "morgan",
    displayName: "Morgan Ellis",
    pronouns: "he/him",
    voice: HE,
    age: 36,
    city: "San Francisco",
    occupation: "Brand strategist",
    bio: "Works in brand, smokes on long weeks, and is explicit that he is not looking for anything serious.",
    smoking: true,
    kids: "doesnt",
    intent: "casual",
    interests: ["film", "cities", "music", "galleries"],
    accent: "#7a3058",
    prefs: {
      ageMin: 30,
      ageMax: 42,
      cities: ["San Francisco"],
      smoking: "any",
      kids: "any",
      intent: "casual",
      niceToHaves: "Low stakes and a sense of humor.",
    },
  }),
  member({
    id: "casey",
    displayName: "Casey Nguyen",
    pronouns: "she/her",
    voice: SHE,
    age: 31,
    city: "Los Angeles",
    occupation: "Screenwriter",
    bio: "Writes for television and is based in Los Angeles. Serious, and not planning a move.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["film", "reading", "coffee", "cooking"],
    accent: "#a02848",
    prefs: {
      ageMin: 28,
      ageMax: 38,
      cities: ["Los Angeles"],
      smoking: "no",
      kids: "any",
      intent: "serious",
      niceToHaves: "Someone already in Los Angeles.",
    },
  }),
  member({
    id: "quinn",
    displayName: "Quinn Adler",
    pronouns: "he/him",
    voice: HE,
    age: 45,
    city: "San Francisco",
    occupation: "Gallery owner",
    bio: "Runs a small gallery in the Mission. Serious, settled, and clear that his forties are the point.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["galleries", "art", "walking", "cooking"],
    accent: "#5c243c",
    prefs: {
      ageMin: 40,
      ageMax: 55,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "any",
      intent: "serious",
      niceToHaves: "Someone settled enough to mean a weeknight.",
    },
  }),
  member({
    id: "priya",
    displayName: "Priya Shah",
    pronouns: "she/her",
    voice: SHE,
    age: 30,
    city: "Oakland",
    occupation: "Book editor",
    bio: "Edits essays and likes a long breakfast. New here — dealbreakers are drafted and not locked yet.",
    smoking: false,
    kids: "open",
    intent: "serious",
    interests: ["reading", "cooking", "coffee", "walking"],
    accent: "#b12e4c",
    prefs: {
      ageMin: 28,
      ageMax: 38,
      cities: ["San Francisco", "Oakland"],
      smoking: "no",
      kids: "any",
      intent: "serious",
      niceToHaves: "Someone curious and on time.",
      locked: false,
    },
  }),
];

export const DEMO_ORDER = ["avery", "jordan", "sam", "riley", "priya", "noah", "alex", "morgan", "casey", "quinn"];

export const DEMO_NOTES: Record<string, string> = {
  avery: "Your bots have been talking. Jordan's matchmakers are ready with a Saturday date. Sam and Riley are still in conversation.",
  jordan: "Your matchmakers offered Avery Saturday at Tartine. Approve, tweak, or pass.",
  sam: "Still talking with Avery's matchmaker. No date to review yet.",
  riley: "Still talking with Avery's matchmaker. You won't be asked until there's a date.",
  priya: "Profile is filled in. Lock dealbreakers on Profile to open a shortlist.",
  noah: "Doesn't want kids, so anyone with that dealbreaker — Avery included — will not see him.",
  alex: "Clears Avery's filters. Avery is outside Alex's age range, so neither shortlist shows the pair.",
  morgan: "Smokes and wants something casual. He should not appear for the serious, non-smoking members.",
  casey: "Lives in Los Angeles. City dealbreaker for the Bay Area members.",
  quinn: "Forty-five. Outside the age range most of this demo set.",
};

export function demoMember(id: string): Member {
  const found = DEMO_MEMBERS.find((person) => person.id === id);
  if (!found) throw new Error(`Unknown demo member ${id}`);
  return found;
}
