import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { agentTokens } from "../db/schema";
import { getMember } from "../domain";
import type { Member } from "../types";

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type IssuedToken = {
  id: string;
  token: string;
  prefix: string;
  createdAt: string;
};

export type TokenStatus = {
  active: boolean;
  prefix: string | null;
  createdAt: string | null;
};

export function issueAgentToken(ctx: BotDateDb, userId: string): IssuedToken | null {
  if (!getMember(ctx, userId)) return null;
  const now = new Date().toISOString();
  ctx.db.update(agentTokens).set({ revokedAt: now }).where(and(eq(agentTokens.userId, userId), isNull(agentTokens.revokedAt))).run();
  const token = `bd_${randomBytes(32).toString("base64url")}`;
  const prefix = `${token.slice(0, 11)}…`;
  const id = `tok_${crypto.randomUUID()}`;
  ctx.db
    .insert(agentTokens)
    .values({
      id,
      userId,
      tokenHash: hashAgentToken(token),
      tokenPrefix: prefix,
      createdAt: now,
      revokedAt: null,
    })
    .run();
  return { id, token, prefix, createdAt: now };
}

export function revokeAgentTokens(ctx: BotDateDb, userId: string): boolean {
  if (!getMember(ctx, userId)) return false;
  ctx.db
    .update(agentTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(agentTokens.userId, userId), isNull(agentTokens.revokedAt)))
    .run();
  return true;
}

export function agentTokenStatus(ctx: BotDateDb, userId: string): TokenStatus {
  const row = ctx.db
    .select()
    .from(agentTokens)
    .where(and(eq(agentTokens.userId, userId), isNull(agentTokens.revokedAt)))
    .get();
  if (!row) return { active: false, prefix: null, createdAt: null };
  return { active: true, prefix: row.tokenPrefix, createdAt: row.createdAt };
}

export function memberForAgentToken(ctx: BotDateDb, token: string): Member | null {
  if (!token.startsWith("bd_") || token.length < 20) return null;
  const row = ctx.db.select().from(agentTokens).where(eq(agentTokens.tokenHash, hashAgentToken(token))).get();
  if (!row || row.revokedAt) return null;
  if (!hashesEqual(row.tokenHash, hashAgentToken(token))) return null;
  return getMember(ctx, row.userId);
}
