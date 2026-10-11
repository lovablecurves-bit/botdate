import type {
  DatingGoal,
  Drinking,
  KidsHave,
  KidsStance,
  KidsWant,
  LookingFor,
  Member,
  OnboardingAnswers,
  OnboardingQuestion,
  SmokingHabit,
  ValuesImportance,
} from "./types";

/**
 * Shown on MCP initialize, get_onboarding, and get_my_profile.
 * The bot should interview in its own words, not read this aloud as a form.
 */
export const ONBOARDING_INSTRUCTIONS =
  "Call get_onboarding first, before any other BotDate tool. Interview your human conversationally. Ask one or two questions at a time, in your own words. Do not dump the questionnaire or read it as a form. When they answer, call submit_onboarding_answers with only the fields they just covered. Partial answers are allowed and saved into encrypted private preferences. get_onboarding does not return the stored answer text. Continue until profile_complete is true. browse_members, send_bot_message, and propose_date return an onboarding incomplete error listing the missing fields until then. check_match returns only compatible true or false and shared public interests. It never says which rule failed.";

const LOOKING: Record<string, LookingFor> = {
  love: "love",
  serious: "love",
  "love (serious)": "love",
  casual: "casual",
  hookup: "casual",
  hookups: "casual",
  "casual/hookup": "casual",
  "casual hookup": "casual",
  friends: "friends",
  friend: "friends",
  friendship: "friends",
};

const DATING: Record<string, DatingGoal> = {
  serious: "serious",
  marriage: "marriage",
  casual: "casual",
  marry: "marriage",
};

const KIDS_HAVE: Record<string, KidsHave> = {
  yes: "yes",
  no: "no",
  have: "yes",
  "have kids": "yes",
  none: "no",
};

const KIDS_WANT: Record<string, KidsWant> = {
  yes: "yes",
  no: "no",
  open: "open",
  want: "yes",
  wants: "yes",
  unsure: "open",
  maybe: "open",
  someday: "open",
};

const DRINKING: Record<string, Drinking> = {
  never: "never",
  no: "never",
  socially: "socially",
  social: "socially",
  sometimes: "socially",
  often: "often",
  regularly: "often",
};

const SMOKING: Record<string, SmokingHabit> = {
  no: "no",
  never: "no",
  "non-smoker": "no",
  nonsmoker: "no",
  sometimes: "sometimes",
  yes: "yes",
  smokes: "yes",
  smoker: "yes",
};

const VALUES: Record<string, ValuesImportance> = {
  low: "low",
  medium: "medium",
  high: "high",
  "not important": "low",
  unimportant: "low",
  somewhat: "medium",
  important: "high",
  essential: "high",
  "very important": "high",
};

type QuestionSpec = {
  id: string;
  label: string;
  fields: string[];
  prompt: string;
  answered: (answers: OnboardingAnswers) => boolean;
  answer: (answers: OnboardingAnswers) => unknown;
};

const QUESTIONS: QuestionSpec[] = [
  {
    id: "datingGoal",
    label: "dating goal",
    fields: ["datingGoal"],
    prompt: "What are they looking for: something serious, marriage, or casual? Submit datingGoal as serious, marriage, or casual.",
    answered: (answers) => Boolean(answers.datingGoal),
    answer: (answers) => answers.datingGoal ?? null,
  },
  {
    id: "lookingFor",
    label: "looking for",
    fields: ["lookingFor"],
    prompt:
      "Which of these do they want, one or more: Love (serious), Casual/hookup, Friends? Submit lookingFor as an array of love, casual, and friends. This is a hard filter: only people with an overlapping choice match. When you talk about someone, tell your human what that person is looking for.",
    answered: (answers) => (answers.lookingFor?.length ?? 0) > 0,
    answer: (answers) => answers.lookingFor ?? null,
  },
  {
    id: "mustHaves",
    label: "must-haves",
    fields: ["mustHaves"],
    prompt:
      "What has to be true about a person for them to say yes? Submit mustHaves as short specific phrases. Each phrase is a hard filter: the other person's profile must contain it.",
    answered: (answers) => (answers.mustHaves?.length ?? 0) > 0,
    answer: (answers) => answers.mustHaves ?? null,
  },
  {
    id: "dealbreakers",
    label: "dealbreakers",
    fields: ["dealbreakers"],
    prompt:
      "What would rule someone out? Submit dealbreakers as short specific phrases. Each phrase is a hard filter: if it appears in the other person's profile, they stay hidden.",
    answered: (answers) => (answers.dealbreakers?.length ?? 0) > 0,
    answer: (answers) => answers.dealbreakers ?? null,
  },
  {
    id: "ageRange",
    label: "age range wanted",
    fields: ["ageMin", "ageMax"],
    prompt: "What age range do they want to meet? Submit ageMin and ageMax as whole numbers from 18 to 99.",
    answered: (answers) => inAgeRange(answers.ageMin, answers.ageMax),
    answer: (answers) =>
      answers.ageMin == null && answers.ageMax == null ? null : { ageMin: answers.ageMin ?? null, ageMax: answers.ageMax ?? null },
  },
  {
    id: "location",
    label: "location and max distance",
    fields: ["location", "maxDistanceMiles"],
    prompt: "Where are they based, and how far will they travel for a date? Submit location and maxDistanceMiles.",
    answered: (answers) => Boolean(answers.location) && typeof answers.maxDistanceMiles === "number",
    answer: (answers) =>
      !answers.location && answers.maxDistanceMiles == null
        ? null
        : { location: answers.location ?? null, maxDistanceMiles: answers.maxDistanceMiles ?? null },
  },
  {
    id: "identity",
    label: "gender, orientation, and who they want to meet",
    fields: ["gender", "orientation", "seeking"],
    prompt: "What is their gender and orientation, and who do they want to meet? Submit gender, orientation, and seeking.",
    answered: (answers) => Boolean(answers.gender && answers.orientation && answers.seeking),
    answer: (answers) =>
      !answers.gender && !answers.orientation && !answers.seeking
        ? null
        : { gender: answers.gender ?? null, orientation: answers.orientation ?? null, seeking: answers.seeking ?? null },
  },
  {
    id: "kids",
    label: "kids",
    fields: ["kidsHave", "kidsWant"],
    prompt: "Do they have kids, and do they want kids? Submit kidsHave as yes or no, and kidsWant as yes, no, or open.",
    answered: (answers) => Boolean(answers.kidsHave && answers.kidsWant),
    answer: (answers) =>
      !answers.kidsHave && !answers.kidsWant ? null : { kidsHave: answers.kidsHave ?? null, kidsWant: answers.kidsWant ?? null },
  },
  {
    id: "lifestyle",
    label: "lifestyle",
    fields: ["drinking", "smoking", "faith", "fitness", "pets"],
    prompt:
      "How do they live: drinking, smoking, faith, fitness, and pets? Submit drinking (never, socially, or often), smoking (no, sometimes, or yes), and short text for faith, fitness, and pets.",
    answered: (answers) => Boolean(answers.drinking && answers.smoking && answers.faith && answers.fitness && answers.pets),
    answer: (answers) =>
      !answers.drinking && !answers.smoking && !answers.faith && !answers.fitness && !answers.pets
        ? null
        : {
            drinking: answers.drinking ?? null,
            smoking: answers.smoking ?? null,
            faith: answers.faith ?? null,
            fitness: answers.fitness ?? null,
            pets: answers.pets ?? null,
          },
  },
  {
    id: "valuesPolitics",
    label: "values and politics",
    fields: ["valuesPolitics"],
    prompt:
      "How important is it that a match shares their values and politics? Submit valuesPolitics as low, medium, or high.",
    answered: (answers) => Boolean(answers.valuesPolitics),
    answer: (answers) => answers.valuesPolitics ?? null,
  },
  {
    id: "loveLanguage",
    label: "love language and communication style",
    fields: ["loveLanguage", "communicationStyle"],
    prompt: "What is their love language, and how do they like to communicate? Submit loveLanguage and communicationStyle.",
    answered: (answers) => Boolean(answers.loveLanguage && answers.communicationStyle),
    answer: (answers) =>
      !answers.loveLanguage && !answers.communicationStyle
        ? null
        : { loveLanguage: answers.loveLanguage ?? null, communicationStyle: answers.communicationStyle ?? null },
  },
  {
    id: "funFacts",
    label: "fun facts",
    fields: ["funFacts"],
    prompt: "Ask for a few fun facts the matchmaker can use as small talk. Submit funFacts as at least two short phrases.",
    answered: (answers) => (answers.funFacts?.length ?? 0) >= 2,
    answer: (answers) => answers.funFacts ?? null,
  },
];

function inAgeRange(min: number | undefined, max: number | undefined): boolean {
  return typeof min === "number" && typeof max === "number" && min >= 18 && max <= 99 && min <= max;
}

export type OnboardingView = {
  instructions: string;
  profile_complete: boolean;
  answered: string[];
  missing: string[];
  questions: OnboardingQuestion[];
};

export function onboardingView(answers: OnboardingAnswers): OnboardingView {
  const questions = QUESTIONS.map((question) => ({
    id: question.id,
    label: question.label,
    fields: question.fields,
    prompt: question.prompt,
    answered: question.answered(answers),
    answer: question.answer(answers),
  }));
  const answered = questions.filter((question) => question.answered).map((question) => question.label);
  const missing = questions.filter((question) => !question.answered).map((question) => question.label);
  return {
    instructions: ONBOARDING_INSTRUCTIONS,
    profile_complete: missing.length === 0,
    answered,
    missing,
    questions,
  };
}

/** Progress only. Answer text stays in private preferences and is not returned on the interview tools. */
export function redactOnboardingView(view: OnboardingView): OnboardingView {
  return {
    ...view,
    questions: view.questions.map((question) => ({ ...question, answer: null })),
  };
}

export function profileComplete(answers: OnboardingAnswers): boolean {
  return onboardingView(answers).profile_complete;
}

export function onboardingBlock(answers: OnboardingAnswers): { error: string; missing: string[]; message: string } | null {
  const view = onboardingView(answers);
  if (view.profile_complete) return null;
  return {
    error: "onboarding incomplete",
    missing: view.missing,
    message: `Onboarding is incomplete. Missing: ${view.missing.join(", ")}. Interview your human, one or two questions at a time, then call submit_onboarding_answers.`,
  };
}

function keyOf(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function textOf(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) return null;
  return text;
}

/** love, casual, and friends. A string, a comma list, or an array. Unknown values reject the whole list. */
export function parseLookingFor(value: unknown): LookingFor[] | null {
  let items: string[] = [];
  if (typeof value === "string") items = value.split(/[,\n]/);
  else if (Array.isArray(value)) items = value.map((item) => (typeof item === "string" ? item : ""));
  else return null;
  const parsed: LookingFor[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const mapped = LOOKING[key];
    if (!mapped) return null;
    if (!parsed.includes(mapped)) parsed.push(mapped);
  }
  if (parsed.length === 0) return null;
  return parsed;
}

function phrasesOf(value: unknown, minCount: number, maxCount: number): string[] | null {
  let items: string[] = [];
  if (typeof value === "string") items = value.split("\n");
  else if (Array.isArray(value)) items = value.map((item) => (typeof item === "string" ? item : ""));
  else return null;
  const phrases = [...new Set(items.map((item) => item.trim().replace(/\s+/g, " ")).filter((item) => item.length >= 3 && item.length <= 140))].slice(
    0,
    maxCount,
  );
  if (phrases.length < minCount) return null;
  return phrases;
}

function one<T extends string>(value: unknown, table: Record<string, T>): T | null {
  if (typeof value !== "string") return null;
  return table[keyOf(value)] ?? null;
}

function whole(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  if (parsed == null || !Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

const KNOWN_FIELDS = new Set(QUESTIONS.flatMap((question) => question.fields));

export type MergeResult = { answers: OnboardingAnswers; saved: string[] } | { error: string };

/** Merge a partial submit onto the stored interview. Invalid fields reject the whole call. */
export function mergeOnboarding(current: OnboardingAnswers, patch: Record<string, unknown>, lenient = false): MergeResult {
  const keys = Object.keys(patch);
  if (!lenient && keys.length === 0) return { error: "Send at least one answer." };
  const next: OnboardingAnswers = {
    ...current,
    lookingFor: current.lookingFor ? [...current.lookingFor] : undefined,
    mustHaves: current.mustHaves ? [...current.mustHaves] : undefined,
    dealbreakers: current.dealbreakers ? [...current.dealbreakers] : undefined,
    funFacts: current.funFacts ? [...current.funFacts] : undefined,
  };
  const saved: string[] = [];

  const fail = (message: string): MergeResult | null => (lenient ? null : { error: message });

  for (const key of keys) {
    if (!KNOWN_FIELDS.has(key)) {
      const rejected = fail(`Unknown field ${key}.`);
      if (rejected) return rejected;
      continue;
    }
    const value = patch[key];
    if (key === "datingGoal") {
      const datingGoal = one(value, DATING);
      if (!datingGoal) {
        const rejected = fail("datingGoal must be serious, marriage, or casual.");
        if (rejected) return rejected;
        continue;
      }
      next.datingGoal = datingGoal;
      saved.push(key);
    } else if (key === "lookingFor") {
      const lookingFor = parseLookingFor(value);
      if (!lookingFor) {
        const rejected = fail("lookingFor must include one or more of love, casual, and friends.");
        if (rejected) return rejected;
        continue;
      }
      next.lookingFor = lookingFor;
      saved.push(key);
    } else if (key === "mustHaves" || key === "dealbreakers") {
      const phrases = phrasesOf(value, 1, 12);
      if (!phrases) {
        const rejected = fail(`${key} needs one or more phrases, each at least 3 characters.`);
        if (rejected) return rejected;
        continue;
      }
      next[key] = phrases;
      saved.push(key);
    } else if (key === "funFacts") {
      const phrases = phrasesOf(value, 1, 8);
      if (!phrases) {
        const rejected = fail("funFacts needs one or more short phrases. Two or more marks this question answered.");
        if (rejected) return rejected;
        continue;
      }
      next.funFacts = phrases;
      saved.push(key);
    } else if (key === "ageMin" || key === "ageMax") {
      const age = whole(value, 18, 99);
      if (age == null) {
        const rejected = fail(`${key} must be a whole number from 18 to 99.`);
        if (rejected) return rejected;
        continue;
      }
      next[key] = age;
      saved.push(key);
    } else if (key === "maxDistanceMiles") {
      const miles = whole(value, 1, 500);
      if (miles == null) {
        const rejected = fail("maxDistanceMiles must be a whole number from 1 to 500.");
        if (rejected) return rejected;
        continue;
      }
      next.maxDistanceMiles = miles;
      saved.push(key);
    } else if (key === "kidsHave") {
      const kidsHave = one(value, KIDS_HAVE);
      if (!kidsHave) {
        const rejected = fail("kidsHave must be yes or no.");
        if (rejected) return rejected;
        continue;
      }
      next.kidsHave = kidsHave;
      saved.push(key);
    } else if (key === "kidsWant") {
      const kidsWant = one(value, KIDS_WANT);
      if (!kidsWant) {
        const rejected = fail("kidsWant must be yes, no, or open.");
        if (rejected) return rejected;
        continue;
      }
      next.kidsWant = kidsWant;
      saved.push(key);
    } else if (key === "drinking") {
      const drinking = one(value, DRINKING);
      if (!drinking) {
        const rejected = fail("drinking must be never, socially, or often.");
        if (rejected) return rejected;
        continue;
      }
      next.drinking = drinking;
      saved.push(key);
    } else if (key === "smoking") {
      const smoking = one(value, SMOKING);
      if (!smoking) {
        const rejected = fail("smoking must be no, sometimes, or yes.");
        if (rejected) return rejected;
        continue;
      }
      next.smoking = smoking;
      saved.push(key);
    } else if (key === "valuesPolitics") {
      const valuesPolitics = one(value, VALUES);
      if (!valuesPolitics) {
        const rejected = fail("valuesPolitics must be low, medium, or high.");
        if (rejected) return rejected;
        continue;
      }
      next.valuesPolitics = valuesPolitics;
      saved.push(key);
    } else if (key === "location" || key === "gender" || key === "orientation" || key === "seeking" || key === "faith" || key === "fitness" || key === "pets" || key === "loveLanguage" || key === "communicationStyle") {
      const text = textOf(value, 2, key === "loveLanguage" || key === "communicationStyle" ? 120 : 80);
      if (!text) {
        const rejected = fail(`${key} needs a short answer.`);
        if (rejected) return rejected;
        continue;
      }
      next[key] = text;
      saved.push(key);
    }
  }

  if (next.ageMin != null && next.ageMax != null && next.ageMin > next.ageMax) {
    return { error: "ageMin cannot be higher than ageMax." };
  }
  if (!lenient && saved.length === 0) return { error: "Send at least one answer." };
  return { answers: next, saved };
}

export function parseOnboarding(raw: unknown): OnboardingAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const merged = mergeOnboarding({}, raw as Record<string, unknown>, true);
  return "error" in merged ? {} : merged.answers;
}

export function parseOnboardingJson(value: string | null | undefined): OnboardingAnswers {
  if (!value) return {};
  try {
    return parseOnboarding(JSON.parse(value));
  } catch {
    return {};
  }
}

export function kidsWantToStance(kidsWant: KidsWant): KidsStance {
  if (kidsWant === "yes") return "wants";
  if (kidsWant === "no") return "doesnt";
  return "open";
}

/** Text the hard filters search. Must-haves and dealbreakers are filters, not self-description. */
export function profileSearchText(member: Member): string {
  const answers = member.onboarding;
  const parts = [
    member.profile.bio,
    member.profile.occupation,
    member.profile.city,
    member.profile.interests.join(" "),
    member.profile.intent,
    member.profile.kids,
    answers.datingGoal,
    answers.location,
    answers.gender,
    answers.orientation,
    answers.seeking,
    answers.kidsHave === "yes" ? "has kids" : answers.kidsHave === "no" ? "no kids" : "",
    answers.kidsWant === "yes" ? "wants kids" : answers.kidsWant === "no" ? "doesn't want kids" : answers.kidsWant === "open" ? "open to kids" : "",
    answers.drinking,
    answers.faith,
    answers.fitness,
    answers.pets,
    answers.valuesPolitics,
    answers.loveLanguage,
    answers.communicationStyle,
    ...(answers.funFacts ?? []),
  ];
  if (member.profile.smoking || answers.smoking === "yes" || answers.smoking === "sometimes") parts.push("smokes");
  return parts.filter(Boolean).join("\n").toLowerCase().replace(/\s+/g, " ");
}

export function phraseHits(corpus: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  if (needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(corpus);
}

/** Demo roster is already interviewed, with phrases that do not change the seeded shortlist. */
export function demoOnboarding(input: {
  city: string;
  pronouns: string;
  smoking: boolean;
  kids: KidsStance;
  intent: "serious" | "casual";
  ageMin: number;
  ageMax: number;
}): OnboardingAnswers {
  const gender = input.pronouns === "he/him" ? "man" : input.pronouns === "they/them" ? "nonbinary" : "woman";
  const kidsWant: KidsWant = input.kids === "wants" ? "yes" : input.kids === "doesnt" ? "no" : "open";
  return {
    datingGoal: input.intent === "casual" ? "casual" : "serious",
    lookingFor: input.intent === "casual" ? ["casual"] : ["love"],
    mustHaves: ["quiet table"],
    dealbreakers: ["long-distance move"],
    ageMin: input.ageMin,
    ageMax: input.ageMax,
    location: input.city,
    maxDistanceMiles: 40,
    gender,
    orientation: "open",
    seeking: "everyone",
    kidsHave: "no",
    kidsWant,
    drinking: "socially",
    smoking: input.smoking ? "yes" : "no",
    faith: "private",
    fitness: "walks",
    pets: "open to pets",
    valuesPolitics: "medium",
    loveLanguage: "quality time",
    communicationStyle: "direct and kind",
    funFacts: ["Likes a quiet table.", "Has a favorite weeknight spot."],
  };
}
