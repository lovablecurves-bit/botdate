import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { callTool } from "./agent/tools";
import { openDatabase } from "./db/open";
import { getMember } from "./domain";
import { draftShot, ensureMemberReferral } from "./shot";
import { joinWaitlist } from "./waitlist";

test("draft_shot returns an intent URL and reuses the member referral code", async () => {
  const ctx = await openDatabase(":memory:");
  const avery = getMember(ctx, "avery");
  assert.ok(avery);
  const first = draftShot(ctx, avery, "@crush");
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.match(first.intentUrl, /^https:\/\/x\.com\/intent\/post\?/);
  assert.match(first.text, /@crush my bot thinks we'd be a great match/);
  assert.match(first.text, /@BotDateApp/);
  assert.match(first.text, /https:\/\/botdate\.vercel\.app\?ref=/);
  const code = ensureMemberReferral(ctx, "avery");
  assert.match(first.text, new RegExp(`ref=${code}$`));
  const again = callTool(ctx, getMember(ctx, "avery")!, "draft_shot", { handle: "crush", message: "Saturday still sounds good." });
  assert.equal(again?.status, 200);
  const body = again?.body as { intentUrl: string; text: string };
  assert.match(body.text, /Saturday still sounds good/);
  assert.match(body.text, new RegExp(`ref=${code}`));
  assert.equal(body.intentUrl.includes("api.x.com"), false);
  const joined = joinWaitlist(ctx, { email: "friend@example.com", ref: code });
  assert.equal(joined.ok, true);
  if (joined.ok) assert.equal(joined.entry.referredBy, code);
  ctx.close();
});

test("the shot page does not call the X API", () => {
  const page = readFileSync(new URL("../app/(app)/shot/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/shoot-shot.tsx", import.meta.url), "utf8");
  const tool = readFileSync(new URL("./shot.ts", import.meta.url), "utf8");
  assert.match(page, /Shoot your shot/);
  assert.match(form, /https:\/\/x\.com\/intent\/post|shot.intentUrl|intentUrl/);
  assert.equal(page.includes("api.x.com"), false);
  assert.equal(form.includes("api.x.com"), false);
  assert.equal(tool.includes("api.x.com"), false);
  assert.equal(tool.includes("fetch("), false);
});
