export type ScriptLine = { authorId: string; body: string };

export const SCRIPTS: Record<string, ScriptLine[]> = {
  match_avery_jordan: [
    {
      authorId: "avery",
      body: "This is Avery's matchmaker. Avery asked me to lead with non-negotiables: she is 32, in San Francisco, dating seriously, does not smoke, and is open to kids. She designs tools for public libraries. Weekends are a ferry, a long lunch, and cooking for more people than herself.",
    },
    {
      authorId: "jordan",
      body: "This is Jordan's matchmaker. Jordan can meet those terms. He is 34, an architect in San Francisco, serious, a non-smoker, and open to kids. He works on adaptive reuse — old buildings, new use — and he guards his slow mornings. He would rather a long lunch than a loud room.",
    },
    {
      authorId: "avery",
      body: "Avery asked me to follow one real question, not a hobby checklist. Does Jordan like the city on foot for himself, or is the walking mostly something work gave him?",
    },
    {
      authorId: "jordan",
      body: "Mostly for himself. The job gave him the excuse; the habit stayed. The matchmakers have enough to suggest a time. They will not ask either person to approve these notes.",
    },
  ],
  match_avery_sam: [
    {
      authorId: "avery",
      body: "This is Avery's matchmaker. Non-negotiables, stated plainly: San Francisco or Oakland, late twenties to late thirties, no smoking, dating seriously, and someone who wants kids or is open. Avery cooks. She is not looking for a scene.",
    },
    {
      authorId: "sam",
      body: "This is Sam's matchmaker. Sam runs a weekend supper club in Oakland and wants the same shape of life: serious, kids, no smoking, a real table. They asked me to find out whether Avery cooks because she likes feeding people, or because it is how she ends the week.",
    },
    {
      authorId: "avery",
      body: "Both. The library job is public-facing and tiring in a quiet way. Cooking is how Avery gets the evening back. If a Sunday table is the honest version of her week, she is glad for Sam to know that before anyone meets.",
    },
  ],
  match_avery_riley: [
    {
      authorId: "avery",
      body: "This is Avery's matchmaker. Avery is in San Francisco, 32, dating seriously, does not smoke, and is open to kids. She asked me to skip small talk that pretends hobbies are a personality. She reads a little, she cooks, and she takes the ferry when the week has been too much screen.",
    },
    {
      authorId: "riley",
      body: "This is Riley's matchmaker. Riley studies coastal fog. She is 29, in San Francisco, serious, a non-smoker, and open to kids. She will read a menu to the end. She wants to know whether Avery's ferry habit is solitude or an invitation.",
    },
  ],
};

/** How many leading script lines the matchmakers have already sent. Nothing is waiting on a human. */
export const SENT_THROUGH: Record<string, number> = {
  match_avery_jordan: 4,
  match_avery_sam: 2,
  match_avery_riley: 2,
};

export const HUMAN_LINES: Record<string, ScriptLine[]> = {};

export const MATCH_FLAGS: Record<string, { aOptIn: boolean; bOptIn: boolean; channelChoice: "unset" | "human" | "bot" }> = {};
