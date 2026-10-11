import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { users, xPostLearning } from "../db/schema";
import { listShortlist } from "../domain";
import { shouldRefreshAccessToken } from "./bot-credentials";
import { xCredentials } from "./config";
import { XAuthError, refreshBotAccessToken } from "./oauth";
import { openSecret, readSessionSecret, sealSecret } from "./seal";

type FetchLike = typeof fetch;

export const POSTS_TARGET = 100;
export const MAX_POST_CALLS = 2;
export const SUMMARY_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const X_POSTS_HINT =
  "Let my bot learn from my X posts";

export type XPostSummary = {
  interests: string;
  humor: string;
  communicationStyle: string;
  hobbies: string;
  familyLife: string;
};

export const X_POST_SUMMARY_KEYS = ["interests", "humor", "communicationStyle", "hobbies", "familyLife"] as const;

export const EMPTY_X_POST_SUMMARY: XPostSummary = {
  interests: "",
  humor: "",
  communicationStyle: "",
  hobbies: "",
  familyLife: "",
};

const SENSITIVE = [
  /\bchurches?\b/i,
  /\bmosques?\b/i,
  /\bsynagogues?\b/i,
  /\bbible\b/i,
  /\bquran\b/i,
  /\bkoran\b/i,
  /\bchristians?\b/i,
  /\bchristianity\b/i,
  /\bmuslims?\b/i,
  /\bislam(?:ic)?\b/i,
  /\bjewish\b/i,
  /\bjudaism\b/i,
  /\batheists?\b/i,
  /\batheism\b/i,
  /\bhindus?\b/i,
  /\bhinduism\b/i,
  /\bbuddhists?\b/i,
  /\bbuddhism\b/i,
  /\bprayers?\b/i,
  /\bpray(?:ing|ed)?\b/i,
  /\bcatholics?\b/i,
  /\bprotestants?\b/i,
  /\bevangelicals?\b/i,
  /\bgospel\b/i,
  /\ballah\b/i,
  /\bjesus\b/i,
  /\bchrist\b/i,
  /\bgod\b/i,
  /\brabbis?\b/i,
  /\bimams?\b/i,
  /\bpastors?\b/i,
  /\bworship\b/i,
  /\breligio(?:n|us)\b/i,
  /\bdemocrats?\b/i,
  /\brepublicans?\b/i,
  /\bgop\b/i,
  /\bvot(?:e|ed|ing)\b/i,
  /\belections?\b/i,
  /\btrump\b/i,
  /\bbiden\b/i,
  /\bharris\b/i,
  /\bmaga\b/i,
  /\bliberals?\b/i,
  /\bconservatives?\b/i,
  /\bcongress\b/i,
  /\bsenate\b/i,
  /\bpolitic(?:s|al)\b/i,
  /\bsocialists?\b/i,
  /\bcommunists?\b/i,
  /\bcancer\b/i,
  /\bdiabetes\b/i,
  /\bdepression\b/i,
  /\banxiety\b/i,
  /\bdiagnos(?:is|ed)\b/i,
  /\btherap(?:y|ist)\b/i,
  /\bdisabilit(?:y|ies)\b/i,
  /\bdisabled\b/i,
  /\bchronic\b/i,
  /\billness(?:es)?\b/i,
  /\bmedications?\b/i,
  /\bpregnan(?:t|cy)\b/i,
  /\bcovid\b/i,
  /\badhd\b/i,
  /\bptsd\b/i,
  /\bbipolar\b/i,
  /\bautis(?:m|tic)\b/i,
  /\bdiseases?\b/i,
  /\bsymptoms?\b/i,
  /\bhospital\b/i,
  /\bsurgery\b/i,
  /\bgay\b/i,
  /\blesbians?\b/i,
  /\bbisexuals?\b/i,
  /\bstraights?\b/i,
  /\bqueers?\b/i,
  /\bhomosexuals?\b/i,
  /\bheterosexuals?\b/i,
  /\bpansexuals?\b/i,
  /\basexuals?\b/i,
  /\blgbtq?\b/i,
  /\bsexual orientation\b/i,
  /\btransgender\b/i,
  /\bnon-?binary\b/i,
  /\bafrican american\b/i,
  /\bcaucasian\b/i,
  /\bhispanics?\b/i,
  /\blatin(?:o|a|x)s?\b/i,
  /\bindigenous\b/i,
  /\bethnic(?:ity)?\b/i,
  /\bracial\b/i,
  /\bracism\b/i,
  /\btrade union\b/i,
  /\blabor union\b/i,
  /\bonlyfans\b/i,
  /\bnudes?\b/i,
  /\bfetish(?:es)?\b/i,
  /\bsex life\b/i,
];

type Bucket = keyof XPostSummary;

const SIGNALS: { bucket: Bucket; pattern: RegExp; label: string }[] = [
  { bucket: "interests", pattern: /\bmusic\b/i, label: "music" },
  { bucket: "interests", pattern: /\bbooks?\b|\bnovels?\b|\breading\b/i, label: "books" },
  { bucket: "interests", pattern: /\bmovies?\b|\bfilms?\b|\bcinema\b/i, label: "movies" },
  { bucket: "interests", pattern: /\bart\b|\bmuseums?\b/i, label: "art" },
  { bucket: "interests", pattern: /\bcooking\b|\brecipes?\b/i, label: "cooking" },
  { bucket: "interests", pattern: /\btravel(?:ing|ling)?\b/i, label: "travel" },
  { bucket: "interests", pattern: /\bcoffee\b/i, label: "coffee" },
  { bucket: "interests", pattern: /\bdesign\b/i, label: "design" },
  { bucket: "interests", pattern: /\bphotography\b/i, label: "photography" },
  { bucket: "interests", pattern: /\bwriting\b/i, label: "writing" },
  { bucket: "interests", pattern: /\bscience\b/i, label: "science" },
  { bucket: "interests", pattern: /\bhistory\b/i, label: "history" },
  { bucket: "interests", pattern: /\bfashion\b/i, label: "fashion" },
  { bucket: "interests", pattern: /\bfood\b|\brestaurants?\b/i, label: "food" },
  { bucket: "interests", pattern: /\bpodcasts?\b/i, label: "podcasts" },
  { bucket: "humor", pattern: /\blol\b|\blmao\b|\bhaha+\b/i, label: "playful" },
  { bucket: "humor", pattern: /\bjokes?\b/i, label: "jokes" },
  { bucket: "humor", pattern: /\bsarcas(?:m|tic)\b/i, label: "sarcasm" },
  { bucket: "humor", pattern: /\bdry humor\b|\bhumor is dry\b|\bdeadpan\b|\bdry wit\b/i, label: "dry" },
  { bucket: "humor", pattern: /\bpuns?\b/i, label: "puns" },
  { bucket: "humor", pattern: /\bwitty\b/i, label: "witty" },
  { bucket: "communicationStyle", pattern: /\bshort texts?\b/i, label: "short texts" },
  { bucket: "communicationStyle", pattern: /\blong messages?\b/i, label: "long messages" },
  { bucket: "communicationStyle", pattern: /\bvoice notes?\b/i, label: "voice notes" },
  { bucket: "communicationStyle", pattern: /\btexting\b|\btexter\b/i, label: "texting" },
  { bucket: "communicationStyle", pattern: /\bslow repl(?:y|ies)\b/i, label: "slow replies" },
  { bucket: "communicationStyle", pattern: /\bquick repl(?:y|ies)\b/i, label: "quick replies" },
  { bucket: "communicationStyle", pattern: /\bemojis?\b/i, label: "emoji" },
  { bucket: "communicationStyle", pattern: /\bdirect\b/i, label: "direct" },
  { bucket: "communicationStyle", pattern: /\boverthink\w*/i, label: "overthinks" },
  { bucket: "communicationStyle", pattern: /\bphone calls?\b/i, label: "phone calls" },
  { bucket: "hobbies", pattern: /\bhiking\b|\btrails?\b/i, label: "hiking" },
  { bucket: "hobbies", pattern: /\brunning\b/i, label: "running" },
  { bucket: "hobbies", pattern: /\byoga\b/i, label: "yoga" },
  { bucket: "hobbies", pattern: /\bclimbing\b/i, label: "climbing" },
  { bucket: "hobbies", pattern: /\bcycling\b|\bbiking\b/i, label: "cycling" },
  { bucket: "hobbies", pattern: /\bbaking\b/i, label: "baking" },
  { bucket: "hobbies", pattern: /\bgardening\b/i, label: "gardening" },
  { bucket: "hobbies", pattern: /\bpottery\b/i, label: "pottery" },
  { bucket: "hobbies", pattern: /\bknitting\b/i, label: "knitting" },
  { bucket: "hobbies", pattern: /\bpainting\b/i, label: "painting" },
  { bucket: "hobbies", pattern: /\bgaming\b/i, label: "gaming" },
  { bucket: "hobbies", pattern: /\bsurfing\b/i, label: "surfing" },
  { bucket: "hobbies", pattern: /\bswimming\b/i, label: "swimming" },
  { bucket: "hobbies", pattern: /\bcamping\b/i, label: "camping" },
  { bucket: "familyLife", pattern: /\bdaughters?\b/i, label: "daughter" },
  { bucket: "familyLife", pattern: /\bsons?\b/i, label: "son" },
  { bucket: "familyLife", pattern: /\bkids?\b|\bchildren\b/i, label: "kids" },
  { bucket: "familyLife", pattern: /\b(?:mom|dad|mother|father|parents)\b/i, label: "parents" },
  { bucket: "familyLife", pattern: /\bfamily dinners?\b/i, label: "family dinners" },
  { bucket: "familyLife", pattern: /\b(?:nieces?|nephews?)\b/i, label: "nieces and nephews" },
  { bucket: "familyLife", pattern: /\b(?:brothers?|sisters?|siblings?)\b/i, label: "siblings" },
  { bucket: "familyLife", pattern: /\b(?:grandmas?|grandpas?|grandparents?)\b/i, label: "grandparents" },
  { bucket: "familyLife", pattern: /\bfamily\b/i, label: "family" },
];

export function postIsSensitive(text: string): boolean {
  return SENSITIVE.some((pattern) => pattern.test(text));
}

function scrubField(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || postIsSensitive(trimmed)) return "";
  return trimmed.length > 160 ? trimmed.slice(0, 160) : trimmed;
}

/** Short compatibility notes from the member's own posts. Sensitive posts are skipped, not inferred. */
export function summarizePosts(texts: readonly string[]): XPostSummary {
  const found: Record<Bucket, string[]> = {
    interests: [],
    humor: [],
    communicationStyle: [],
    hobbies: [],
    familyLife: [],
  };
  for (const raw of texts) {
    const text = raw.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
    if (!text || postIsSensitive(text)) continue;
    for (const signal of SIGNALS) {
      if (!signal.pattern.test(text)) continue;
      if (!found[signal.bucket].includes(signal.label)) found[signal.bucket].push(signal.label);
    }
  }
  return {
    interests: scrubField(found.interests.join(", ")),
    humor: scrubField(found.humor.join(", ")),
    communicationStyle: scrubField(found.communicationStyle.join(", ")),
    hobbies: scrubField(found.hobbies.join(", ")),
    familyLife: scrubField(found.familyLife.join(", ")),
  };
}

export function anonymousMatchLabel(person: { pronouns: string; age: number; city: string }): string {
  const gender = person.pronouns === "she/her" ? "Woman" : person.pronouns === "he/him" ? "Man" : "";
  return [gender, String(person.age), person.city].filter(Boolean).join(", ");
}

export function anonymizedMatchData(
  person: { pronouns: string; age: number; city: string },
  summary: XPostSummary | null,
): { label: string; xPosts: XPostSummary | null } {
  return { label: anonymousMatchLabel(person), xPosts: summary };
}

/** `GET /2/users/:id/tweets?max_results=100`, plus a pagination token on the second call. */
export function memberTweetsUrl(userId: string, paginationToken?: string): string {
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets`);
  url.searchParams.set("max_results", String(POSTS_TARGET));
  url.searchParams.set("tweet.fields", "text");
  url.searchParams.set("exclude", "retweets");
  if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
  return url.toString();
}

type TweetPage = {
  data?: { text?: unknown }[];
  meta?: { next_token?: unknown };
};

export async function fetchRecentPosts(userId: string, accessToken: string, fetchImpl: FetchLike = fetch): Promise<string[]> {
  const texts: string[] = [];
  let pagination: string | undefined;
  for (let call = 0; call < MAX_POST_CALLS && texts.length < POSTS_TARGET; call += 1) {
    const response = await fetchImpl(memberTweetsUrl(userId, pagination), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const payload = (await response.json().catch(() => null)) as TweetPage | null;
    if (!response.ok) throw new XAuthError("X did not return posts.");
    if (Array.isArray(payload?.data)) {
      for (const tweet of payload.data) {
        if (texts.length >= POSTS_TARGET) break;
        if (typeof tweet?.text === "string" && tweet.text.trim()) texts.push(tweet.text);
      }
    }
    const next = payload?.meta?.next_token;
    if (typeof next !== "string" || !next) break;
    pagination = next;
  }
  return texts;
}

export function summaryIsDue(summaryAt: string, now = Date.now()): boolean {
  const at = Date.parse(summaryAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= SUMMARY_WEEK_MS;
}

export function parseXPostSummary(raw: string): XPostSummary | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const summary = { ...EMPTY_X_POST_SUMMARY };
    for (const key of X_POST_SUMMARY_KEYS) {
      if (typeof parsed[key] !== "string") return null;
      summary[key] = scrubField(parsed[key]);
    }
    return summary;
  } catch {
    return null;
  }
}

function summaryJson(summary: XPostSummary): string {
  return JSON.stringify({
    interests: summary.interests,
    humor: summary.humor,
    communicationStyle: summary.communicationStyle,
    hobbies: summary.hobbies,
    familyLife: summary.familyLife,
  });
}

type LearningRow = {
  memberId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  tokenExpiresAt: string;
  summary: string;
  summaryAt: string;
};

function readRow(ctx: BotDateDb, memberId: string): LearningRow | undefined {
  return ctx.db.select().from(xPostLearning).where(eq(xPostLearning.memberId, memberId)).get();
}

function writeRow(ctx: BotDateDb, row: LearningRow): void {
  const existing = readRow(ctx, row.memberId);
  if (existing) {
    ctx.db.update(xPostLearning).set(row).where(eq(xPostLearning.memberId, row.memberId)).run();
    return;
  }
  ctx.db.insert(xPostLearning).values(row).run();
}

export function learnsFromXPosts(ctx: BotDateDb, memberId: string): boolean {
  return Boolean(readRow(ctx, memberId));
}

/** Null when the member has not opted in. */
export function storedXPostSummary(ctx: BotDateDb, memberId: string): XPostSummary | null {
  const row = readRow(ctx, memberId);
  if (!row) return null;
  return parseXPostSummary(row.summary) ?? { ...EMPTY_X_POST_SUMMARY };
}

export function optOutOfXPosts(ctx: BotDateDb, memberId: string): void {
  ctx.db.delete(xPostLearning).where(eq(xPostLearning.memberId, memberId)).run();
}

export async function learnFromGrant(
  ctx: BotDateDb,
  input: {
    memberId: string;
    xUserId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    secret: string;
    now?: number;
    fetchImpl?: FetchLike;
  },
): Promise<XPostSummary> {
  if (!/^\d{1,32}$/.test(input.xUserId)) throw new XAuthError("X did not return your account.");
  if (!input.secret) throw new XAuthError("SESSION_SECRET is required to store your X token.");
  const fetchImpl = input.fetchImpl ?? fetch;
  const posts = await fetchRecentPosts(input.xUserId, input.accessToken, fetchImpl);
  const summary = summarizePosts(posts);
  const now = input.now ?? Date.now();
  writeRow(ctx, {
    memberId: input.memberId,
    accessTokenCiphertext: sealSecret(input.accessToken, input.secret),
    refreshTokenCiphertext: sealSecret(input.refreshToken, input.secret),
    tokenExpiresAt: new Date(now + input.expiresIn * 1000).toISOString(),
    summary: summaryJson(summary),
    summaryAt: new Date(now).toISOString(),
  });
  return summary;
}

async function accessForRow(
  ctx: BotDateDb,
  row: LearningRow,
  secret: string,
  now: number,
  fetchImpl: FetchLike,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  let accessToken = openSecret(row.accessTokenCiphertext, secret);
  let refreshToken = openSecret(row.refreshTokenCiphertext, secret);
  let expiresAt = row.tokenExpiresAt;
  if (!shouldRefreshAccessToken(Date.parse(expiresAt), now)) {
    return { accessToken, refreshToken, expiresAt };
  }
  const credentials = xCredentials();
  if (!credentials) throw new XAuthError("Sign in with X is not configured.");
  const grant = await refreshBotAccessToken(credentials, refreshToken, fetchImpl);
  accessToken = grant.accessToken;
  refreshToken = grant.refreshToken;
  expiresAt = new Date(now + grant.expiresIn * 1000).toISOString();
  writeRow(ctx, {
    ...row,
    accessTokenCiphertext: sealSecret(accessToken, secret),
    refreshTokenCiphertext: sealSecret(refreshToken, secret),
    tokenExpiresAt: expiresAt,
  });
  return { accessToken, refreshToken, expiresAt };
}

/** Fetch again only when the last attempt is at least a week old. Failures wait a week too. */
export async function refreshXPostSummaryIfDue(
  ctx: BotDateDb,
  memberId: string,
  options: { fetchImpl?: FetchLike; now?: number; secret?: string | null } = {},
): Promise<void> {
  const row = readRow(ctx, memberId);
  if (!row) return;
  const now = options.now ?? Date.now();
  if (!summaryIsDue(row.summaryAt, now)) return;
  const secret = options.secret === undefined ? readSessionSecret() : options.secret;
  const stamp = new Date(now).toISOString();
  if (!secret) {
    writeRow(ctx, { ...row, summaryAt: stamp });
    return;
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const access = await accessForRow(ctx, row, secret, now, fetchImpl);
    const xUserId = memberXUserId(ctx, memberId);
    if (!xUserId) throw new XAuthError("X did not return your account.");
    const posts = await fetchRecentPosts(xUserId, access.accessToken, fetchImpl);
    const summary = summarizePosts(posts);
    const current = readRow(ctx, memberId) ?? row;
    writeRow(ctx, { ...current, summary: summaryJson(summary), summaryAt: stamp });
  } catch {
    console.error("X post summary refresh did not finish.");
    const current = readRow(ctx, memberId) ?? row;
    writeRow(ctx, { ...current, summaryAt: stamp });
  }
}

function memberXUserId(ctx: BotDateDb, memberId: string): string {
  const user = ctx.db.select().from(users).where(eq(users.id, memberId)).get();
  return user?.xUserId && /^\d{1,32}$/.test(user.xUserId) ? user.xUserId : "";
}

/** Refresh opted-in people on this member's shortlist, at most once a week each. */
export async function refreshDueXPostSummaries(
  ctx: BotDateDb,
  viewerId: string,
  options: { fetchImpl?: FetchLike; now?: number } = {},
): Promise<void> {
  const ids = listShortlist(ctx, viewerId).cards.map((card) => card.person.id);
  for (const memberId of ids) {
    await refreshXPostSummaryIfDue(ctx, memberId, options);
  }
}
