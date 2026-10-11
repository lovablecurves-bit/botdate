import { and, eq, or } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { blocks, dateProposals, matches, messages, profiles, reports, users } from "./db/schema";
import { fail, ok, type ActionResult } from "./result";
import {
  REPORTS_BEFORE_PAUSE,
  anonymousDescriptor,
  redactTranscript,
} from "./safety";

export type ActivityReveal = "anonymous" | "first-name" | "full";

export type ActivityMessage = {
  id: string;
  mine: boolean;
  authorLabel: string;
  body: string;
  at: string;
};

export type ActivityEntry = {
  matchId: string;
  targetId: string;
  reveal: ActivityReveal;
  label: string;
  photoUrl: string | null;
  accent: string;
  xHandle: string | null;
  xVerified: boolean;
  blocked: boolean;
  messages: ActivityMessage[];
};

export type ReviewRow = {
  userId: string;
  displayName: string;
  handle: string | null;
  paused: boolean;
  status: string;
  reason: string;
  reports: number;
};

function asBool(value: unknown): boolean {
  return value === true || value === 1;
}

export function botMessagesSentToday(ctx: BotDateDb, userId: string, now = new Date()): number {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  return ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.authorUserId, userId), eq(messages.channel, "bot"), eq(messages.approvalStatus, "sent")))
    .all()
    .filter((row) => row.createdAt >= start).length;
}

export function flagMember(ctx: BotDateDb, userId: string, reason: string): void {
  const row = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return;
  const status = row.safetyStatus === "pending_review" ? "pending_review" : "flagged";
  ctx.db
    .update(users)
    .set({ safetyStatus: status, safetyReason: reason.slice(0, 200) })
    .where(eq(users.id, userId))
    .run();
}

export function pairBlocked(ctx: BotDateDb, a: string, b: string): boolean {
  const row = ctx.db
    .select()
    .from(blocks)
    .where(
      or(and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)), and(eq(blocks.blockerId, b), eq(blocks.blockedId, a))),
    )
    .get();
  return Boolean(row);
}

export function reportMember(ctx: BotDateDb, reporterId: string, targetId: string, matchId = ""): ActionResult {
  if (!reporterId || !targetId || reporterId === targetId) return fail("You can't report yourself.");
  const target = ctx.db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) return fail("That member is not on file.");
  const existing = ctx.db
    .select()
    .from(reports)
    .where(and(eq(reports.reporterId, reporterId), eq(reports.targetId, targetId)))
    .get();
  if (!existing) {
    ctx.db
      .insert(reports)
      .values({
        id: `report_${crypto.randomUUID()}`,
        reporterId,
        targetId,
        matchId,
        reason: "",
        createdAt: new Date().toISOString(),
      })
      .run();
  }
  const count = ctx.db.select().from(reports).where(eq(reports.targetId, targetId)).all().length;
  if (count >= REPORTS_BEFORE_PAUSE) {
    ctx.db
      .update(users)
      .set({
        botPaused: true,
        safetyStatus: "pending_review",
        safetyReason: `${count} reports`,
      })
      .where(eq(users.id, targetId))
      .run();
    return ok();
  }
  return ok();
}

export function blockMember(ctx: BotDateDb, blockerId: string, blockedId: string): ActionResult {
  if (!blockerId || !blockedId || blockerId === blockedId) return fail("You can't block yourself.");
  const target = ctx.db.select().from(users).where(eq(users.id, blockedId)).get();
  if (!target) return fail("That member is not on file.");
  const existing = ctx.db
    .select()
    .from(blocks)
    .where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))
    .get();
  if (existing) return ok();
  ctx.db
    .insert(blocks)
    .values({
      id: `block_${crypto.randomUUID()}`,
      blockerId,
      blockedId,
      createdAt: new Date().toISOString(),
    })
    .run();
  return ok();
}

export function setShareInActivity(ctx: BotDateDb, userId: string, enabled: boolean): ActionResult {
  const row = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return fail("Member not found.");
  ctx.db.update(users).set({ shareInActivity: enabled }).where(eq(users.id, userId)).run();
  return ok();
}

export function clearSafety(ctx: BotDateDb, userId: string): ActionResult {
  const row = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return fail("Member not found.");
  ctx.db.update(users).set({ safetyStatus: "", safetyReason: "", botPaused: false }).where(eq(users.id, userId)).run();
  return ok();
}

export function keepPaused(ctx: BotDateDb, userId: string): ActionResult {
  const row = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return fail("Member not found.");
  ctx.db
    .update(users)
    .set({ botPaused: true, safetyStatus: "reviewed", safetyReason: row.safetyReason || "Kept paused by founder" })
    .where(eq(users.id, userId))
    .run();
  return ok();
}

export function listSafetyReview(ctx: BotDateDb): ReviewRow[] {
  const reportRows = ctx.db.select().from(reports).all();
  const counts = new Map<string, number>();
  for (const row of reportRows) counts.set(row.targetId, (counts.get(row.targetId) ?? 0) + 1);
  return ctx.db
    .select()
    .from(users)
    .all()
    .filter((row) => row.safetyStatus || (counts.get(row.id) ?? 0) > 0)
    .map((row) => ({
      userId: row.id,
      displayName: row.displayName,
      handle: row.xHandle,
      paused: asBool(row.botPaused),
      status: row.safetyStatus || "reported",
      reason: row.safetyReason,
      reports: counts.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.reports - a.reports || a.displayName.localeCompare(b.displayName));
}

function offerVisible(
  row: { released: boolean | number | null; proposedByUserId: string; status: string },
  userId: string,
): boolean {
  if (asBool(row.released) || row.status === "confirmed") return true;
  return row.proposedByUserId === userId;
}

export function listBotActivity(ctx: BotDateDb, userId: string): ActivityEntry[] {
  const viewer = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  const viewerProfile = ctx.db.select().from(profiles).where(eq(profiles.userId, userId)).get();
  if (!viewer || !viewerProfile) return [];
  const people = new Map(ctx.db.select().from(users).all().map((row) => [row.id, row]));
  const profileById = new Map(ctx.db.select().from(profiles).all().map((row) => [row.userId, row]));
  const entries: ActivityEntry[] = [];
  const matchRows = ctx.db
    .select()
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)))
    .all();
  for (const match of matchRows) {
    const otherId = match.userAId === userId ? match.userBId : match.userAId;
    const other = people.get(otherId);
    const otherProfile = profileById.get(otherId);
    if (!other || !otherProfile) continue;
    const thread = ctx.db
      .select()
      .from(messages)
      .where(eq(messages.matchId, match.id))
      .all()
      .filter((row) => row.approvalStatus === "sent" && (row.channel === "bot" || row.channel === "system"))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (thread.length === 0) continue;
    const proposals = ctx.db.select().from(dateProposals).where(eq(dateProposals.matchId, match.id)).all();
    const hasOffer = proposals.some((row) => offerVisible(row, userId));
    const bothShare = asBool(viewer.shareInActivity) && asBool(other.shareInActivity);
    const reveal: ActivityReveal = hasOffer ? "full" : bothShare ? "first-name" : "anonymous";
    const first = other.displayName.split(" ")[0] || other.displayName;
    const photo = other.xAvatarUrl || null;
    const label =
      reveal === "full"
        ? other.displayName
        : reveal === "first-name"
          ? first
          : anonymousDescriptor(
              { pronouns: otherProfile.pronouns, age: otherProfile.age, city: otherProfile.city },
              viewerProfile.city,
            );
    entries.push({
      matchId: match.id,
      targetId: otherId,
      reveal,
      label,
      photoUrl: reveal === "anonymous" ? null : photo,
      accent: otherProfile.accent,
      xHandle: reveal === "full" ? other.xHandle : null,
      xVerified: reveal === "full" && asBool(other.xVerified),
      blocked: pairBlocked(ctx, userId, otherId),
      messages: thread.map((row) => ({
        id: row.id,
        mine: row.authorUserId === userId,
        authorLabel:
          row.channel === "system" ? "Desk" : row.authorUserId === userId ? "Your bot" : reveal === "anonymous" ? "Their bot" : `${reveal === "full" ? other.displayName : first}'s bot`,
        body: redactTranscript(row.body, other.displayName, reveal),
        at: row.createdAt,
      })),
    });
  }
  entries.sort((a, b) => {
    const aAt = a.messages[a.messages.length - 1]?.at ?? "";
    const bAt = b.messages[b.messages.length - 1]?.at ?? "";
    return bAt.localeCompare(aAt);
  });
  return entries;
}
