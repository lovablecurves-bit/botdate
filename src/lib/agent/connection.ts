import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { agentTokens, oauthRefreshTokens } from "../db/schema";

export type BotConnectionReason = "refresh_token" | "agent_token" | "mcp_call";

export type BotConnection = {
  connected: boolean;
  reason: BotConnectionReason | null;
};

function unexpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed > now;
}

/**
 * A real Grok Bot link for this member.
 * A valid OAuth refresh token, a live agent token, or an MCP call on a token
 * that was not revoked. connect_seen and a button tap are not a connection.
 */
export function botConnection(ctx: BotDateDb, userId: string, now = Date.now()): BotConnection {
  const refresh = ctx.db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.userId, userId)).all();
  if (refresh.some((row) => !row.revokedAt && unexpired(row.expiresAt, now))) {
    return { connected: true, reason: "refresh_token" };
  }

  const live = ctx.db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .all()
    .filter((row) => !row.revokedAt);
  if (live.some((row) => unexpired(row.expiresAt, now))) {
    return { connected: true, reason: "agent_token" };
  }
  if (live.some((row) => Boolean(row.lastUsedAt))) {
    return { connected: true, reason: "mcp_call" };
  }
  return { connected: false, reason: null };
}

export function isBotConnected(ctx: BotDateDb, userId: string, now = Date.now()): boolean {
  return botConnection(ctx, userId, now).connected;
}
