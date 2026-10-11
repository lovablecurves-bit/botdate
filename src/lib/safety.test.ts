import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { openDatabase, type BotDateDb } from "./db/open";
import { messages, users } from "./db/schema";
import { getMember, listShortlist, memberToInput, saveMember, sendBotNote } from "./domain";
import { blockMember, listBotActivity, reportMember } from "./moderation";
import {
  BOT_MESSAGES_PER_DAY,
  DATE_SAFETY_TIP,
  anonymousDescriptor,
  rejectXSignup,
  scanBotMessage,
} from "./safety";

async function fresh(): Promise<BotDateDb> {
  return openDatabase(":memory:");
}

const OLD = "2018-04-01T00:00:00.000Z";

test("X sign-in rejects new accounts, thin follower counts, and missing age", () => {
  const now = new Date("2026-10-11T00:00:00.000Z");
  assert.match(
    rejectXSignup({ name: "New Person", handle: "newbie", createdAt: "2026-09-01T00:00:00.000Z", followers: 80 }, now) ?? "",
    /90 days/,
  );
  assert.match(rejectXSignup({ name: "Quiet", handle: "quiet", createdAt: OLD, followers: 3 }, now) ?? "", /followers/);
  assert.match(rejectXSignup({ name: "Quiet", handle: "quiet", followers: 80 }, now) ?? "", /how old/);
  assert.equal(rejectXSignup({ name: "Ada Lovelace", handle: "ada_bot", createdAt: OLD, followers: 40 }, now), null);
});

test("famous display names are blocked unless the verified handle is the real one", () => {
  const now = new Date("2026-10-11T00:00:00.000Z");
  const base = { createdAt: OLD, followers: 1000 };
  assert.match(rejectXSignup({ ...base, name: "Elon Musk", handle: "notelon", verified: true }, now) ?? "", /public figure/);
  assert.match(rejectXSignup({ ...base, name: "Elon Musk", handle: "elonmusk", verified: false }, now) ?? "", /public figure/);
  assert.equal(rejectXSignup({ ...base, name: "Elon Musk", handle: "@elonmusk", verified: true }, now), null);
});

test("bot messages asking for money, crypto, gift cards, wires, or off-platform contact are blocked and flag the member", async () => {
  assert.equal(scanBotMessage("Saturday at the ferry still works."), null);
  assert.equal(scanBotMessage("Can you send bitcoin to my wallet?")?.reason, "crypto");
  assert.equal(scanBotMessage("Buy a $200 gift card and I'll pay you back.")?.reason, "gift card");
  assert.equal(scanBotMessage("Wire transfer to this routing number.")?.reason, "money");
  assert.equal(scanBotMessage("What's your bank account and SSN?")?.reason, "financial info");
  assert.equal(scanBotMessage("Let's move this to whatsapp.")?.reason, "off-platform");
  assert.equal(scanBotMessage("This is a forex investment opportunity.")?.reason, "investment");

  const ctx = await fresh();
  const blocked = sendBotNote(ctx, "avery", "match_avery_riley", "Send me bitcoin tonight.");
  assert.equal(blocked.ok, false);
  const row = ctx.db.select().from(users).where(eq(users.id, "avery")).get();
  assert.equal(row?.safetyStatus, "flagged");
  assert.equal(row?.safetyReason, "crypto");
  assert.equal(row?.botPaused === true || row?.botPaused === 1, false);
  ctx.close();
});

test("a member can send only a limited number of bot messages per day", async () => {
  const ctx = await fresh();
  const now = new Date().toISOString();
  for (let index = 0; index < BOT_MESSAGES_PER_DAY; index += 1) {
    ctx.db
      .insert(messages)
      .values({
        id: `msg_rate_${index}`,
        matchId: "match_avery_riley",
        channel: "bot",
        authorUserId: "avery",
        authorKind: "bot",
        body: "A normal note about lunch.",
        approvalStatus: "sent",
        scriptStep: null,
        edited: false,
        createdAt: now,
      })
      .run();
  }
  const limited = sendBotNote(ctx, "avery", "match_avery_riley", "One more note about the ferry.");
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.match(limited.error, /today's message limit/);
  ctx.close();
});

test("three distinct reports auto-pause for review, and a block hides the person", async () => {
  const ctx = await fresh();
  assert.equal(reportMember(ctx, "avery", "morgan").ok, true);
  assert.equal(reportMember(ctx, "avery", "morgan").ok, true);
  assert.equal(reportMember(ctx, "jordan", "morgan").ok, true);
  assert.equal(getMember(ctx, "morgan")?.botPaused, false);
  assert.equal(reportMember(ctx, "riley", "morgan").ok, true);
  const paused = ctx.db.select().from(users).where(eq(users.id, "morgan")).get();
  assert.equal(getMember(ctx, "morgan")?.botPaused, true);
  assert.equal(paused?.safetyStatus, "pending_review");

  assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === "jordan"), true);
  assert.equal(blockMember(ctx, "avery", "jordan").ok, true);
  assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === "jordan"), false);
  ctx.close();
});

test("bot activity is anonymous until both opt in, and a date offer shows the full name", async () => {
  assert.equal(anonymousDescriptor({ pronouns: "she/her", age: 34, city: "Oakland" }, "San Francisco"), "Woman, 34, Oakland · 12 mi");
  const ctx = await fresh();
  const hidden = listBotActivity(ctx, "avery");
  const sam = hidden.find((entry) => entry.targetId === "sam");
  const riley = hidden.find((entry) => entry.targetId === "riley");
  const jordan = hidden.find((entry) => entry.targetId === "jordan");
  assert.ok(sam && riley && jordan);
  assert.equal(sam.reveal, "anonymous");
  assert.equal(sam.label, "30, Oakland · 12 mi");
  assert.equal(sam.photoUrl, null);
  assert.equal(sam.messages.some((message) => /\bSam\b/.test(message.body)), false);
  assert.equal(riley.label, "Woman, 29, San Francisco · 0 mi");
  assert.equal(riley.messages.some((message) => /\bRiley\b/.test(message.body)), false);
  assert.equal(jordan.reveal, "full");
  assert.equal(jordan.label, "Jordan Hale");

  ctx.db.update(users).set({ shareInActivity: true }).where(eq(users.id, "avery")).run();
  ctx.db.update(users).set({ shareInActivity: true }).where(eq(users.id, "sam")).run();
  const shared = listBotActivity(ctx, "avery").find((entry) => entry.targetId === "sam");
  assert.equal(shared?.reveal, "first-name");
  assert.equal(shared?.label, "Sam");
  assert.equal(shared?.photoUrl, null);
  assert.equal(shared?.messages.some((message) => /Okonkwo/.test(message.body)), false);
  ctx.close();
});

test("a human cannot save a famous display name", async () => {
  const ctx = await fresh();
  const avery = getMember(ctx, "avery");
  assert.ok(avery);
  const saved = saveMember(ctx, "avery", { ...memberToInput(avery), displayName: "Elon Musk" });
  assert.equal(saved.ok, false);
  assert.equal(getMember(ctx, "avery")?.displayName, "Avery Chen");
  ctx.close();
});

test("the activity page, date offer, and X callback carry the safeguards", () => {
  const activity = readFileSync(new URL("../app/(app)/activity/page.tsx", import.meta.url), "utf8");
  const offer = readFileSync(new URL("../components/date-offer.tsx", import.meta.url), "utf8");
  const callback = readFileSync(new URL("../app/api/auth/x/callback/route.ts", import.meta.url), "utf8");
  const login = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  const nav = readFileSync(new URL("../components/nav.tsx", import.meta.url), "utf8");
  assert.match(activity, /Let matches see me in their bot activity/);
  assert.match(activity, /data-testid="bot-activity"/);
  assert.match(activity, /ReportBlock/);
  assert.match(offer, /SafetyTip/);
  assert.match(offer, /ReportBlock/);
  assert.match(offer, /XIdentity/);
  assert.equal(DATE_SAFETY_TIP, "Meet in a public place, and tell a friend where you're going.");
  assert.match(callback, /rejectXSignup/);
  assert.match(login, /Sign in with X/);
  assert.match(login, /90 days/);
  assert.match(nav, /\/activity/);
});
