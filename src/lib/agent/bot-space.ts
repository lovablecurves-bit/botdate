import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { availability, matches, memberPhotos, users } from "../db/schema";

export const MAX_PHOTOS = 6;
export const BOT_SPACE_CONSENT =
  "I agree that my Grok Bot may talk with other members' bots in BotDate's shared space.";
export const BOT_SPACE_CONSENT_HELP =
  "The other member agrees to the same thing when they connect. Until both have agreed, the bots cannot talk there.";
export const BOT_SPACE_CONSENT_ERROR =
  "Agree that your bot can talk with other members' bots in BotDate's shared space.";
export const BOT_SPACE_SELF_BLOCK =
  "Agree on the connect step before your bot can talk in BotDate's shared space.";
export const BOT_SPACE_OTHER_BLOCK =
  "The other member has not agreed yet that their bot can talk in BotDate's shared space.";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_URL = /^https:\/\/\S+$/i;

export type AvailabilityWindow = {
  weekday?: (typeof WEEKDAYS)[number];
  date?: string;
  start: string;
  end: string;
};

export type MemberAvailability = {
  timezone: string;
  windows: AvailabilityWindow[];
};

export type MemberPhoto = { url: string; order: number };

function flagged(value: unknown): boolean {
  return value === true || value === 1;
}

/** The stored checkbox, not the demo shortcut. */
export function storedBotSpaceConsent(ctx: BotDateDb, userId: string): boolean {
  const row = ctx.db.select({ botSpaceConsent: users.botSpaceConsent }).from(users).where(eq(users.id, userId)).get();
  return flagged(row?.botSpaceConsent);
}

export function recordBotSpaceConsent(ctx: BotDateDb, userId: string) {
  ctx.db.update(users).set({ botSpaceConsent: true }).where(eq(users.id, userId)).run();
}

/**
 * Real X members must consent at connect. Demo rows have no X id and stay in the
 * shared space so the sample desk keeps working.
 */
export function botSpaceAllows(ctx: BotDateDb, userId: string): boolean {
  const row = ctx.db
    .select({ xUserId: users.xUserId, botSpaceConsent: users.botSpaceConsent })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) return false;
  if (!row.xUserId) return true;
  return flagged(row.botSpaceConsent);
}

export function botSpaceBlock(ctx: BotDateDb, selfId: string, otherId: string): string | null {
  if (!botSpaceAllows(ctx, selfId)) return BOT_SPACE_SELF_BLOCK;
  if (!botSpaceAllows(ctx, otherId)) return BOT_SPACE_OTHER_BLOCK;
  return null;
}

export function otherMemberOnMatch(ctx: BotDateDb, selfId: string, matchId: string): string | null {
  const row = ctx.db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!row) return null;
  if (row.userAId === selfId) return row.userBId;
  if (row.userBId === selfId) return row.userAId;
  return null;
}

export function listMemberPhotos(ctx: BotDateDb, userId: string): MemberPhoto[] {
  return ctx.db
    .select()
    .from(memberPhotos)
    .where(eq(memberPhotos.userId, userId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((row) => ({ url: row.url, order: row.sortOrder }));
}

export function setMemberPhotos(
  ctx: BotDateDb,
  userId: string,
  input: unknown,
): { ok: true; photos: MemberPhoto[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Send photos as a list of https URLs." };
  if (input.length > MAX_PHOTOS) return { ok: false, error: "Send at most 6 photos." };
  const urls: string[] = [];
  for (const item of input) {
    const url = typeof item === "string" ? item : item && typeof item === "object" && "url" in item ? (item as { url: unknown }).url : undefined;
    if (typeof url !== "string") return { ok: false, error: "Each photo must be an https URL." };
    const trimmed = url.trim();
    if (!PHOTO_URL.test(trimmed) || trimmed.length > 500) return { ok: false, error: "Each photo must be an https URL." };
    urls.push(trimmed);
  }
  const now = new Date().toISOString();
  ctx.sqlite.exec("BEGIN");
  try {
    ctx.db.delete(memberPhotos).where(eq(memberPhotos.userId, userId)).run();
    urls.forEach((url, index) => {
      ctx.db
        .insert(memberPhotos)
        .values({ id: `photo_${crypto.randomUUID()}`, userId, url, sortOrder: index, createdAt: now })
        .run();
    });
    ctx.sqlite.exec("COMMIT");
  } catch (error) {
    ctx.sqlite.exec("ROLLBACK");
    throw error;
  }
  return { ok: true, photos: urls.map((url, order) => ({ url, order })) };
}

function minutes(clock: string): number {
  const [hour, minute] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
}

function parseWindow(value: unknown): AvailabilityWindow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as { weekday?: unknown; date?: unknown; start?: unknown; end?: unknown };
  const start = typeof row.start === "string" ? row.start.trim() : "";
  const end = typeof row.end === "string" ? row.end.trim() : "";
  if (!CLOCK.test(start) || !CLOCK.test(end) || minutes(end) <= minutes(start)) return null;
  const hasWeekday = row.weekday !== undefined;
  const hasDate = row.date !== undefined;
  if (hasWeekday === hasDate) return null;
  if (hasWeekday) {
    const weekday = typeof row.weekday === "string" ? row.weekday.trim().toLowerCase() : "";
    if (!(WEEKDAYS as readonly string[]).includes(weekday)) return null;
    return { weekday: weekday as AvailabilityWindow["weekday"], start, end };
  }
  const date = typeof row.date === "string" ? row.date.trim() : "";
  if (!DAY.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  return { date, start, end };
}

export function readAvailability(ctx: BotDateDb, userId: string): MemberAvailability | null {
  const row = ctx.db.select().from(availability).where(eq(availability.userId, userId)).get();
  if (!row) return null;
  try {
    const windows = JSON.parse(row.windows) as AvailabilityWindow[];
    if (!Array.isArray(windows)) return null;
    return { timezone: row.timezone, windows };
  } catch {
    return null;
  }
}

export function setAvailability(
  ctx: BotDateDb,
  userId: string,
  input: unknown,
): { ok: true; availability: MemberAvailability } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Send a timezone and a list of windows." };
  }
  const body = input as { timezone?: unknown; windows?: unknown };
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  if (!timezone || timezone.length > 64) return { ok: false, error: "Send an IANA timezone, such as America/Chicago." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return { ok: false, error: "Send an IANA timezone, such as America/Chicago." };
  }
  if (!Array.isArray(body.windows) || body.windows.length > 21) {
    return { ok: false, error: "Send up to 21 windows. Each one is a weekday or a date, with a start and end." };
  }
  const windows: AvailabilityWindow[] = [];
  for (const item of body.windows) {
    const window = parseWindow(item);
    if (!window) {
      return { ok: false, error: "Each window needs a weekday or a date, plus a start and a later end, as HH:mm." };
    }
    windows.push(window);
  }
  const updatedAt = new Date().toISOString();
  const stored = JSON.stringify(windows);
  const existing = ctx.db.select({ userId: availability.userId }).from(availability).where(eq(availability.userId, userId)).get();
  if (existing) {
    ctx.db.update(availability).set({ timezone, windows: stored, updatedAt }).where(eq(availability.userId, userId)).run();
  } else {
    ctx.db.insert(availability).values({ userId, timezone, windows: stored, updatedAt }).run();
  }
  return { ok: true, availability: { timezone, windows } };
}

export function memberBotSpace(ctx: BotDateDb, userId: string) {
  return {
    botSpaceConsent: botSpaceAllows(ctx, userId),
    photos: listMemberPhotos(ctx, userId),
    availability: readAvailability(ctx, userId),
  };
}
