import { eq } from "drizzle-orm";
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

export function upsertXMember(ctx: BotDateDb, profile: XProfile): { userId: string; locked: boolean } {
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
        ...(locked ? {} : { displayName: name }),
      })
      .where(eq(users.id, existing.id))
      .run();
    if (member && !locked && bio) {
      ctx.db.update(profiles).set({ bio }).where(eq(profiles.userId, existing.id)).run();
    }
    return { userId: existing.id, locked };
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
    })
    .run();
  return { userId: id, locked: false };
}
