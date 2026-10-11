import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { SCHEMA_SQL, users } from "../db/schema";
import { missingColumnStatements } from "../db/migrate";
import { SYNCED_TABLES, openDatabase } from "../db/open";
import { resetDatabase } from "../db/seed";
import { upsertXMember } from "../x/account";
import { handleMcp } from "./mcp";
import { grokMatchmakerPrompt } from "./prompt";
import { issueAgentToken } from "./tokens";
import { BOT_SPACE_CONSENT, BOT_SPACE_OTHER_BLOCK, BOT_SPACE_SELF_BLOCK, recordBotSpaceConsent } from "./bot-space";

function auth(token: string) {
  return `Bearer ${token}`;
}

function call(ctx: Awaited<ReturnType<typeof openDatabase>>, token: string, name: string, args: Record<string, unknown>) {
  const response = handleMcp({
    ctx,
    authorization: auth(token),
    message: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  const text = (response.body as { result: { content: { text: string }[]; isError: boolean } }).result.content[0]?.text ?? "{}";
  return { status: response.status, isError: (response.body as { result: { isError: boolean } }).result.isError, body: JSON.parse(text) as Record<string, unknown> };
}

test("photos, availability, and bot-space consent live in the schema and the connect step", () => {
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS member_photos/);
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS availability/);
  assert.match(SCHEMA_SQL, /bot_space_consent INTEGER NOT NULL DEFAULT 0/);
  assert.equal(SYNCED_TABLES.includes("member_photos"), true);
  assert.equal(SYNCED_TABLES.includes("availability"), true);
  assert.equal(missingColumnStatements({ users: ["id"] }).some((sql) => sql.includes("bot_space_consent")), true);
  const connect = fs.readFileSync(new URL("../../app/(app)/connect/page.tsx", import.meta.url), "utf8");
  assert.match(connect, /data-testid="bot-space-consent"/);
  assert.match(connect, /BOT_SPACE_CONSENT/);
  assert.equal(connect.includes("upload"), false);
  const prompt = grokMatchmakerPrompt("https://botdate.example/api/agent/v1");
  assert.match(prompt, /upload_photos/);
  assert.match(prompt, /set_availability/);
  const doc = fs.readFileSync(new URL("../../../docs/GROK_BOT_INTEGRATION.md", import.meta.url), "utf8");
  assert.match(doc, /upload_photos/);
  assert.match(doc, /set_availability/);
});

test("upload_photos and set_availability replace bot-owned data and reject bad input", async () => {
  const ctx = await openDatabase(":memory:");
  const issued = issueAgentToken(ctx, "avery");
  assert.ok(issued);
  const badPhoto = call(ctx, issued.token, "upload_photos", { photos: [{ url: "http://example.com/a.jpg" }] });
  assert.equal(badPhoto.isError, true);
  const photos = call(ctx, issued.token, "upload_photos", {
    photos: [{ url: "https://cdn.example/one.jpg" }, { url: "https://cdn.example/two.jpg" }],
  });
  assert.equal(photos.isError, false);
  assert.deepEqual(photos.body.photos, [
    { url: "https://cdn.example/one.jpg", order: 0 },
    { url: "https://cdn.example/two.jpg", order: 1 },
  ]);
  const replaced = call(ctx, issued.token, "upload_photos", { photos: [] });
  assert.deepEqual(replaced.body.photos, []);

  const badWindow = call(ctx, issued.token, "set_availability", {
    timezone: "Not/AZone",
    windows: [{ weekday: "fri", start: "18:00", end: "21:00" }],
  });
  assert.equal(badWindow.isError, true);
  const saved = call(ctx, issued.token, "set_availability", {
    timezone: "America/Chicago",
    windows: [
      { weekday: "fri", start: "18:00", end: "21:00" },
      { date: "2026-10-18", start: "12:00", end: "15:00" },
    ],
  });
  assert.equal(saved.isError, false);
  const profile = call(ctx, issued.token, "get_my_profile", {});
  const member = profile.body.member as { photos: unknown; availability: { timezone: string; windows: unknown[] }; botSpaceConsent: boolean };
  assert.deepEqual(member.photos, []);
  assert.equal(member.availability.timezone, "America/Chicago");
  assert.equal(member.availability.windows.length, 2);
  assert.equal(member.botSpaceConsent, true);

  const other = issueAgentToken(ctx, "jordan");
  assert.ok(other);
  call(ctx, issued.token, "upload_photos", { photos: [{ url: "https://cdn.example/avery.jpg" }] });
  const seen = call(ctx, other.token, "get_member", { memberId: "avery" });
  const card = seen.body.member as { photos: { url: string }[]; availability: { timezone: string } };
  assert.equal(card.photos[0]?.url, "https://cdn.example/avery.jpg");
  assert.equal(card.availability.timezone, "America/Chicago");

  resetDatabase(ctx);
  const after = handleMcp({
    ctx,
    authorization: auth(issued.token),
    message: { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
  });
  assert.equal(after.status, 401);
  const reissued = issueAgentToken(ctx, "avery");
  assert.ok(reissued);
  const cleared = call(ctx, reissued.token, "get_my_profile", {});
  const clearedMember = cleared.body.member as { photos: unknown[]; availability: unknown };
  assert.deepEqual(clearedMember.photos, []);
  assert.equal(clearedMember.availability, null);
  ctx.close();
});

test("two X members cannot talk until both consent at connect", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  const ada = upsertXMember(ctx, { xUserId: "42", handle: "ada", name: "Ada", bio: "", avatarUrl: "" });
  const grace = upsertXMember(ctx, { xUserId: "77", handle: "grace", name: "Grace", bio: "", avatarUrl: "" });
  const adaToken = issueAgentToken(ctx, ada.userId);
  assert.ok(adaToken);
  const blocked = call(ctx, adaToken.token, "send_bot_message", { memberId: grace.userId, body: "Hello from Ada's bot." });
  assert.equal(blocked.isError, true);
  assert.equal(blocked.body.error, BOT_SPACE_SELF_BLOCK);
  ctx.db.update(users).set({ botSpaceConsent: true }).where(eq(users.id, ada.userId)).run();
  const waiting = call(ctx, adaToken.token, "send_bot_message", { memberId: grace.userId, body: "Hello from Ada's bot." });
  assert.equal(waiting.body.error, BOT_SPACE_OTHER_BLOCK);
  recordBotSpaceConsent(ctx, grace.userId);
  const allowed = call(ctx, adaToken.token, "send_bot_message", { memberId: grace.userId, body: "Hello from Ada's bot." });
  assert.notEqual(allowed.body.error, BOT_SPACE_SELF_BLOCK);
  assert.notEqual(allowed.body.error, BOT_SPACE_OTHER_BLOCK);
  const listed = handleMcp({
    ctx,
    authorization: auth(adaToken.token),
    message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
  });
  const names = ((listed.body as { result: { tools: { name: string }[] } }).result.tools).map((tool) => tool.name);
  assert.equal(names.includes("upload_photos"), true);
  assert.equal(names.includes("set_availability"), true);
  assert.match(BOT_SPACE_CONSENT, /shared space/);
  ctx.close();
});
