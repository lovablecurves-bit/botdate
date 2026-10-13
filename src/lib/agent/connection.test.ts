import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { openDatabase } from "../db/open";
import { agentTokens, oauthClients, oauthRefreshTokens, users } from "../db/schema";
import { grokBotConnectLink } from "./connect-link";
import { botConnection } from "./connection";
import { issueAgentToken, revokeAgentTokens } from "./tokens";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const FUTURE = new Date(NOW + 60 * 60 * 1000).toISOString();
const PAST = new Date(NOW - 60 * 1000).toISOString();

async function fresh() {
  return openDatabase(":memory:");
}

function rememberClient(ctx: Awaited<ReturnType<typeof fresh>>) {
  ctx.db
    .insert(oauthClients)
    .values({
      clientId: "mcp_test",
      clientName: "Grok",
      redirectUris: JSON.stringify(["https://grok.example/cb"]),
      createdAt: new Date(NOW).toISOString(),
    })
    .run();
}

function rememberRefresh(
  ctx: Awaited<ReturnType<typeof fresh>>,
  userId: string,
  expiresAt: string,
  revokedAt: string | null = null,
) {
  ctx.db
    .insert(oauthRefreshTokens)
    .values({
      id: `ort_${userId}_${expiresAt}_${revokedAt ?? "live"}`,
      tokenHash: `hash_${userId}_${expiresAt}_${revokedAt ?? "live"}`,
      clientId: "mcp_test",
      userId,
      accessTokenId: `access_${userId}`,
      expiresAt,
      revokedAt,
      createdAt: new Date(NOW).toISOString(),
    })
    .run();
}

test("a member with no token, no grant, and connect_seen set is not connected", async () => {
  const ctx = await fresh();
  ctx.db.update(users).set({ connectSeen: true }).where(eq(users.id, "jordan")).run();
  assert.deepEqual(botConnection(ctx, "jordan", NOW), { connected: false, reason: null });
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: false, reason: null });
  ctx.close();
});

test("another member's agent token or refresh grant does not mark this member connected", async () => {
  const ctx = await fresh();
  rememberClient(ctx);
  assert.ok(issueAgentToken(ctx, "avery"));
  rememberRefresh(ctx, "avery", FUTURE);
  ctx.db.update(users).set({ connectSeen: true }).where(eq(users.id, "jordan")).run();
  assert.equal(botConnection(ctx, "avery", NOW).connected, true);
  assert.deepEqual(botConnection(ctx, "jordan", NOW), { connected: false, reason: null });
  ctx.close();
});

test("a live agent token, a live refresh token, or a seen MCP call counts, and a revoked or unused expired token does not", async () => {
  const ctx = await fresh();
  rememberClient(ctx);

  const issued = issueAgentToken(ctx, "avery");
  assert.ok(issued);
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: true, reason: "agent_token" });

  revokeAgentTokens(ctx, "avery");
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: false, reason: null });

  ctx.db
    .update(agentTokens)
    .set({ revokedAt: null, expiresAt: PAST, lastUsedAt: new Date(NOW).toISOString() })
    .where(eq(agentTokens.id, issued.id))
    .run();
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: true, reason: "mcp_call" });

  ctx.db.update(agentTokens).set({ lastUsedAt: null }).where(eq(agentTokens.id, issued.id)).run();
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: false, reason: null });

  ctx.db.update(agentTokens).set({ revokedAt: new Date(NOW).toISOString(), lastUsedAt: new Date(NOW).toISOString(), expiresAt: null }).where(eq(agentTokens.id, issued.id)).run();
  rememberRefresh(ctx, "avery", PAST);
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: false, reason: null });

  rememberRefresh(ctx, "avery", FUTURE, new Date(NOW).toISOString());
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: false, reason: null });

  rememberRefresh(ctx, "avery", FUTURE);
  assert.deepEqual(botConnection(ctx, "avery", NOW), { connected: true, reason: "refresh_token" });
  ctx.close();
});

test("the post-login button reveals the MCP URL and does not treat a tap as connected", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const profile = fs.readFileSync(path.join(root, "src/app/profile/page.tsx"), "utf8");
  const button = fs.readFileSync(path.join(root, "src/components/connect-grok-button.tsx"), "utf8");
  const link = grokBotConnectLink("https://botdate.vercel.app/api/mcp");

  assert.equal(link, "grokbot://connect?url=https%3A%2F%2Fbotdate.vercel.app%2Fapi%2Fmcp");
  assert.match(profile, /isBotConnected/);
  assert.match(profile, /Not connected yet/);
  assert.match(profile, /Bot connected/);
  assert.match(profile, /ConnectGrokButton/);
  assert.equal(profile.includes("issueAgentTokenAction"), false);
  assert.equal(profile.includes("status.active"), false);
  assert.equal(profile.includes("connectSeen"), false);

  assert.match(button, /Connect your Grok Bot/);
  assert.match(button, /Paste this into your Grok Bot to connect\./);
  assert.match(button, /Copied!/);
  assert.match(button, /data-testid="mcp-url"/);
  assert.match(button, /data-testid="copy-mcp-url"/);
  assert.match(button, /readOnly/);
  assert.match(button, /<details/);
  assert.match(button, /grokBotConnectLink/);
  assert.match(button, /iframe/);
  assert.equal(button.includes("location.href"), false);
  assert.equal(button.includes("location.assign"), false);
  assert.equal(button.includes("window.open"), false);
  assert.equal(button.includes("issueAgentTokenAction"), false);
  assert.equal(button.includes("Bot connected"), false);
});
