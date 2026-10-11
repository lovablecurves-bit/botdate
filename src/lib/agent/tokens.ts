import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { subscriptionBlocks } from "../billing/access";
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
  lastUsedAt: string | null;
  connected: boolean;
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
  if (!row) return { active: false, prefix: null, createdAt: null, lastUsedAt: null, connected: false };
  return {
    active: true,
    prefix: row.tokenPrefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    connected: Boolean(row.lastUsedAt),
  };
}

function bearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/** Authenticate a bot key, record first use, and reject an inactive subscription. Founders pass. */
export function authenticateAgent(
  ctx: BotDateDb,
  authorization: string | null,
): { ok: true; member: Member } | { ok: false; status: number; body: { error: string } } {
  const token = bearer(authorization);
  if (!token) return { ok: false, status: 401, body: { error: "Send the agent token as Authorization: Bearer." } };
  const member = memberForAgentToken(ctx, token);
  if (!member) return { ok: false, status: 401, body: { error: "That agent token is not active." } };
  if (subscriptionBlocks(member)) return { ok: false, status: 402, body: { error: "subscription inactive" } };
  return { ok: true, member };
}

export function memberForAgentToken(ctx: BotDateDb, token: string): Member | null {
  if (!token.startsWith("bd_") || token.length < 20) return null;
  const row = ctx.db.select().from(agentTokens).where(eq(agentTokens.tokenHash, hashAgentToken(token))).get();
  if (!row || row.revokedAt) return null;
  if (!hashesEqual(row.tokenHash, hashAgentToken(token))) return null;
  ctx.db.update(agentTokens).set({ lastUsedAt: new Date().toISOString() }).where(eq(agentTokens.id, row.id)).run();
  return getMember(ctx, row.userId);
}
