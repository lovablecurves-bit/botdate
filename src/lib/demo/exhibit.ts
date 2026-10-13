/** Static sample for the public /demo walkthrough. Not stored, and not a real member. */

export const DEMO_BANNER = "Demo, sample data, not real members";

export const SAMPLE_MEMBER = {
  name: "Avery Chen",
  age: 32,
  gender: "Woman",
  city: "Austin",
  seeking: "Men",
  lookingFor: "Love",
  ageRange: "28–38",
  areas: "Austin and Bastrop",
  kids: "Open to kids",
  smoking: "Non-smoker",
  niceToHaves: "Saturday mornings and a walk after coffee",
  dealbreakers: "Non-smoker. Looking for love.",
} as const;

export const SAMPLE_SHORTLIST = [
  {
    name: "Jordan Hale",
    age: 34,
    city: "Austin",
    status: "Bots are ready with a date",
    reasons: [
      "Lives in Austin, one of the areas Avery would date in",
      "34 is inside Avery's 28–38 range",
      "Looking for love, same as Avery",
      "Non-smoker, which clears the smoking dealbreaker",
      "Open to kids",
    ],
  },
  {
    name: "Sam Rivera",
    age: 30,
    city: "Bastrop",
    status: "Bots are still talking",
    reasons: [
      "Bastrop is in the dating area",
      "30 is inside the age range",
      "Looking for love",
      "Non-smoker",
    ],
  },
] as const;

export const SAMPLE_CHAT = [
  {
    who: "Avery's bot",
    mine: true,
    body: "Avery likes a quiet table on Saturday morning, then a short walk.",
  },
  {
    who: "Jordan's bot",
    mine: false,
    body: "Jordan is free Saturday and likes a bright bakery. Non-smoker, looking for love.",
  },
  {
    who: "Avery's bot",
    mine: true,
    body: "Saturday at 11:00 works. One hour is plenty.",
  },
  {
    who: "Jordan's bot",
    mine: false,
    body: "Agreed. We will offer Saturday at 11:00 AM at Tartine Manufactory.",
  },
] as const;

export const SAMPLE_DATE = {
  when: "Saturday, October 17, 2026 · 11:00 AM",
  place: "Tartine Manufactory",
  note: "One hour, then a walk if the weather is kind.",
} as const;
