import { eq } from "drizzle-orm";
import { founderXIds } from "../billing/access";
import type { BotDateDb } from "../db/open";
import { prefs, profiles, users } from "../db/schema";
import { getMember } from "../domain";
import { voiceForPronouns } from "../types";
import type { XProfile } from "./profile";

const ACCENTS = ["#ff2d92", "#ff3d6e", "#ff4db8", "#ff1744", "#ff5c8a"];

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function accentFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % ACCENTS.length;
  return ACCENTS[hash] ?? ACCENTS[0];
}

function flagged(value: unknown): boolean {
  return value === true || value === 1;
}

/**
 * Number real X members in sign-in order. The earliest becomes member #1
 * and keeps the founder flag. Demo rows have no X id and are skipped.
 * A second call is a no-op once every real member is numbered and one is founder.
 */
export function ensureRealMemberNumbers(ctx: BotDateDb) {
  const rows = ctx.db
    .select()
    .from(users)
    .all()
    .filter((row) => row.xUserId);
  if (rows.length === 0) return;
  const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const needsNumber = ordered.some((row) => row.memberNumber == null);
  const needsFounder = !ordered.some((row) => flagged(row.founder));
  if (needsNumber || needsFounder) {
    let max = 0;
    for (const row of ordered) {
      if (row.memberNumber != null) max = Math.max(max, Number(row.memberNumber));
    }
    if (needsNumber) {
      for (const row of ordered) {
        if (row.memberNumber != null) continue;
        max += 1;
        ctx.db
          .update(users)
          .set({ memberNumber: max, founder: max === 1 || flagged(row.founder) })
          .where(eq(users.id, row.id))
          .run();
        row.memberNumber = max;
        row.founder = max === 1 || flagged(row.founder);
      }
    }
    if (!ordered.some((row) => flagged(row.founder))) {
      const first = ordered.find((row) => Number(row.memberNumber) === 1) ?? ordered[0];
      if (first) {
        ctx.db.update(users).set({ founder: true }).where(eq(users.id, first.id)).run();
        first.founder = true;
      }
    }
  }
  const configured = new Set(founderXIds());
  if (configured.size === 0) return;
  for (const row of ordered) {
    if (!row.xUserId || !configured.has(row.xUserId) || flagged(row.founder)) continue;
    ctx.db.update(users).set({ founder: true }).where(eq(users.id, row.id)).run();
    row.founder = true;
  }
}

export function markConnectSeen(ctx: BotDateDb, userId: string) {
  ctx.db.update(users).set({ connectSeen: true }).where(eq(users.id, userId)).run();
}

export function upsertXMember(ctx: BotDateDb, profile: XProfile): { userId: string; locked: boolean; connectSeen: boolean } {
  const existing = ctx.db.select().from(users).where(eq(users.xUserId, profile.xUserId)).get();
  const name = clip(profile.name, 60) || profile.handle;
  const bio = clip(profile.bio, 500);
  if (existing) {
    const member = getMember(ctx, existing.id);
    const locked = Boolean(member?.prefs.locked);
    ctx.db
      .update(users)
      .set({
        xHandle: profile.handle,
        xAvatarUrl: profile.avatarUrl,
        xCreatedAt: profile.createdAt || null,
        xFollowers: profile.followers ?? 0,
        xVerified: profile.verified === true,
        ...(locked ? {} : { displayName: name }),
      })
      .where(eq(users.id, existing.id))
      .run();
    if (member && !locked && bio) {
      ctx.db.update(profiles).set({ bio }).where(eq(profiles.userId, existing.id)).run();
    }
    ensureRealMemberNumbers(ctx);
    return { userId: existing.id, locked, connectSeen: Boolean(member?.connectSeen) };
  }

  const id = `x_${profile.xUserId}`;
  const now = new Date().toISOString();
  const pronouns = "they/them";
  ctx.db
    .insert(users)
    .values({
      id,
      email: `${id}@x.botdate`,
      displayName: name,
      botPaused: false,
      createdAt: now,
      xUserId: profile.xUserId,
      xHandle: profile.handle,
      xAvatarUrl: profile.avatarUrl,
      xCreatedAt: profile.createdAt || null,
      xFollowers: profile.followers ?? 0,
      xVerified: profile.verified === true,
      founder: false,
      memberNumber: null,
      connectSeen: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
    })
    .run();
  ctx.db
    .insert(profiles)
    .values({
      userId: id,
      age: 30,
      city: "San Francisco",
      occupation: "New here",
      bio: bio || "Signed in with X.",
      pronouns,
      smoking: false,
      kids: "open",
      intent: "serious",
      interests: "[]",
      accent: accentFor(id),
      voice: JSON.stringify(voiceForPronouns(pronouns)),
    })
    .run();
  ctx.db
    .insert(prefs)
    .values({
      userId: id,
      ageMin: 25,
      ageMax: 45,
      cities: JSON.stringify(["San Francisco"]),
      smoking: "no",
      kids: "any",
      intent: "any",
      niceToHaves: "",
      locked: false,
      onboarding: "{}",
    })
    .run();
  ensureRealMemberNumbers(ctx);
  return { userId: id, locked: false, connectSeen: false };
}
