import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { matchCheckHits } from "./db/schema";
import { getMember } from "./domain";
import { mutualPass } from "./matchmaker/filters";
import { pairBlocked } from "./moderation";
import { kidsWantToStance } from "./onboarding";
import { readPrivatePrefs } from "./private-prefs";
import type { Intent, Member, OnboardingAnswers } from "./types";

export const MATCH_CHECKS_PER_MINUTE = 10;
export const MATCH_CHECKS_PER_DAY = 50;
export const MATCH_CHECK_LIMIT_ERROR = "Too many match checks. Try again later.";

export type MatchCheckResult = {
  status: number;
  body: { compatible: boolean; shared: string[] } | { error: string };
};

export type MatchLogEvent = { compatible: boolean } | { limited: true };

/** Log a boolean only. Never a member id, a failed rule, or plaintext. */
function logMatch(event: MatchLogEvent, observe?: (event: MatchLogEvent) => void) {
  console.info(JSON.stringify(event));
  observe?.(event);
}

function utcDayStart(now: number): number {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day.getTime();
}

function rateLimited(ctx: BotDateDb, memberId: string, now = Date.now()): boolean {
  const rows = ctx.db.select({ createdAt: matchCheckHits.createdAt }).from(matchCheckHits).where(eq(matchCheckHits.memberId, memberId)).all();
  const day = utcDayStart(now);
  const minute = now - 60_000;
  let today = 0;
  let recent = 0;
  for (const row of rows) {
    const at = Date.parse(row.createdAt);
    if (Number.isNaN(at)) continue;
    if (at >= day) today += 1;
    if (at >= minute) recent += 1;
  }
  return today >= MATCH_CHECKS_PER_DAY || recent >= MATCH_CHECKS_PER_MINUTE;
}

function recordHit(ctx: BotDateDb, memberId: string) {
  ctx.db.insert(matchCheckHits).values({ id: randomUUID(), memberId, createdAt: new Date().toISOString() }).run();
}

/** Dealbreakers from the encrypted interview, including the age range, over the plaintext columns. */
export function overlayPrivateAnswers(member: Member, answers: OnboardingAnswers): Member {
  const profile = { ...member.profile };
  const prefs = { ...member.prefs };
  if (answers.datingGoal) {
    const intent: Intent = answers.datingGoal === "casual" ? "casual" : "serious";
    profile.intent = intent;
    prefs.intent = intent;
  }
  if (answers.ageMin != null && answers.ageMax != null) {
    prefs.ageMin = answers.ageMin;
    prefs.ageMax = answers.ageMax;
  }
  if (answers.location) profile.city = answers.location;
  if (answers.smoking) profile.smoking = answers.smoking !== "no";
  if (answers.kidsWant) profile.kids = kidsWantToStance(answers.kidsWant);
  return { ...member, profile, prefs, onboarding: answers };
}

function sharedInterests(viewer: Member, candidate: Member): string[] {
  const theirs = new Set(candidate.profile.interests);
  return viewer.profile.interests.filter((interest) => theirs.has(interest));
}

function closed(shared: string[], observe?: (event: MatchLogEvent) => void): MatchCheckResult {
  logMatch({ compatible: false }, observe);
  return { status: 200, body: { compatible: false, shared } };
}

/**
 * Hard dealbreakers both ways. The body is only compatible plus shared public interests.
 * Missing or unreadable preferences fail closed. The failed rule is not returned.
 */
export function checkMatch(
  ctx: BotDateDb,
  memberId: string,
  otherMemberId: string,
  observe?: (event: MatchLogEvent) => void,
): MatchCheckResult {
  const otherId = otherMemberId.trim();
  if (!otherId) return { status: 400, body: { error: "Send other_member_id." } };
  if (otherId === memberId) return { status: 400, body: { error: "Send another member." } };
  const key = readPrivatePrefs(ctx, memberId);
  if (!key.ok && key.error !== "Private preferences could not be read.") {
    return { status: 503, body: { error: key.error } };
  }
  if (rateLimited(ctx, memberId)) {
    logMatch({ limited: true }, observe);
    return { status: 429, body: { error: MATCH_CHECK_LIMIT_ERROR } };
  }
  recordHit(ctx, memberId);
  const viewer = getMember(ctx, memberId);
  const candidate = getMember(ctx, otherId);
  if (!viewer || !candidate || pairBlocked(ctx, memberId, otherId)) return closed([], observe);
  const mine = key.ok ? key : readPrivatePrefs(ctx, memberId);
  const theirs = readPrivatePrefs(ctx, otherId);
  if (!mine.ok || !theirs.ok || !mine.answers || !theirs.answers) return closed(sharedInterests(viewer, candidate), observe);
  const pass = mutualPass(overlayPrivateAnswers(viewer, mine.answers), overlayPrivateAnswers(candidate, theirs.answers));
  logMatch({ compatible: pass }, observe);
  return { status: 200, body: { compatible: pass, shared: sharedInterests(viewer, candidate) } };
}
