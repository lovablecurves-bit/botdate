import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { openDatabase, type BotDateDb } from "./db/open";
import { messages } from "./db/schema";
import {
  advanceBotTalk,
  approveOffer,
  chooseChannel,
  getDate,
  getDesk,
  getIntro,
  getMember,
  listShortlist,
  memberToInput,
  optIn,
  passOffer,
  proposeDate,
  saveMember,
  sendHuman,
  setPaused,
  tweakOffer,
  wipeMemory,
} from "./domain";
import { upcomingSaturdayLocal } from "./time";

async function fresh(): Promise<BotDateDb> {
  return openDatabase(":memory:");
}

test("a file database reopens with Avery Chen still seeded", async () => {
  const file = path.join(os.tmpdir(), `botdate-${process.pid}-${Date.now()}.sqlite`);
  const first = await openDatabase(file);
  assert.equal(getMember(first, "avery")?.displayName, "Avery Chen");
  first.close();
  const second = await openDatabase(file);
  assert.equal(getMember(second, "avery")?.displayName, "Avery Chen");
  assert.equal(listShortlist(second, "avery").cards.map((card) => card.person.id).join(","), "jordan,riley,sam");
  second.close();
  fs.unlinkSync(file);
});

test("Avery's shortlist hides dealbreaker misses and ranks the rest", async () => {
  const ctx = await fresh();
  const list = listShortlist(ctx, "avery");
  assert.deepEqual(
    list.cards.map((card) => card.person.id),
    ["jordan", "riley", "sam"],
  );
  assert.equal(list.inactive, 1);
  assert.equal(
    list.heldBack.reduce((sum, row) => sum + row.count, 0),
    5,
  );
  assert.equal(list.cards[0]?.why.some((line) => line.includes("Clears their dealbreakers")), true);
  ctx.close();
});

test("bot notes are sent without a human and both people can read them", async () => {
  const ctx = await fresh();
  const avery = getDesk(ctx, "avery", "match_avery_riley");
  const riley = getDesk(ctx, "riley", "match_avery_riley");
  assert.equal(avery?.draft, null);
  assert.equal(riley?.draft, null);
  assert.equal(avery?.items.some((item) => item.body.includes("solitude")), true);
  assert.equal(riley?.items.some((item) => item.body.includes("solitude")), true);
  const list = listShortlist(ctx, "avery");
  assert.equal(list.cards.find((card) => card.person.id === "jordan")?.offerWaiting, true);
  assert.equal(list.cards.find((card) => card.person.id === "sam")?.offerWaiting, false);
  assert.equal(list.cards.every((card) => card.draftWaiting === false), true);
  ctx.close();
});

test("matchmakers send the next note unless they are paused", async () => {
  const ctx = await fresh();
  assert.equal(getDesk(ctx, "avery", "match_avery_sam")?.items.some((item) => item.body.includes("Sunday table")), false);
  assert.equal(setPaused(ctx, "avery", true).ok, true);
  assert.equal(advanceBotTalk(ctx, "match_avery_sam").ok, false);
  assert.equal(getDesk(ctx, "sam", "match_avery_sam")?.items.some((item) => item.body.includes("Sunday table")), false);
  assert.equal(setPaused(ctx, "avery", false).ok, true);
  assert.equal(advanceBotTalk(ctx, "match_avery_sam").ok, true);
  const after = getDesk(ctx, "sam", "match_avery_sam");
  assert.equal(after?.items.some((item) => item.body.includes("Sunday table")), true);
  assert.equal(after?.draft, null);
  ctx.close();
});

test("intro opt-in opens human chat only after both people agree", async () => {
  const ctx = await fresh();
  const local = upcomingSaturdayLocal();
  assert.equal(
    proposeDate(ctx, "avery", "match_avery_sam", { local, place: "A quiet table", note: "" }).ok,
    false,
  );
  assert.equal(optIn(ctx, "avery", "match_avery_sam").ok, true);
  assert.equal(chooseChannel(ctx, "avery", "match_avery_sam", "human").ok, false);
  assert.equal(optIn(ctx, "sam", "match_avery_sam").ok, true);
  assert.equal(chooseChannel(ctx, "sam", "match_avery_sam", "human").ok, true);
  assert.equal(sendHuman(ctx, "avery", "match_avery_sam", "Hello from Avery.").ok, true);
  const intro = getIntro(ctx, "sam", "match_avery_sam");
  assert.equal(intro?.humanMessages.some((message) => message.body === "Hello from Avery."), true);
  assert.equal(chooseChannel(ctx, "avery", "match_avery_sam", "bot").ok, true);
  assert.equal(sendHuman(ctx, "avery", "match_avery_sam", "This should stay closed.").ok, false);
  ctx.close();
});

test("a date offer is approved by both people, and tweak or pass closes the ask", async () => {
  const ctx = await fresh();
  const open = getDate(ctx, "avery", "match_avery_jordan")?.proposals.find((item) => item.status === "proposed");
  assert.ok(open);
  assert.equal(open.myDecision, "pending");
  assert.equal(approveOffer(ctx, "avery", open.id).ok, true);
  assert.equal(getDate(ctx, "avery", "match_avery_jordan")?.proposals[0]?.status, "proposed");
  assert.equal(getDate(ctx, "avery", "match_avery_jordan")?.proposals[0]?.myDecision, "approved");
  assert.equal(getDate(ctx, "jordan", "match_avery_jordan")?.proposals[0]?.myDecision, "pending");
  assert.equal(approveOffer(ctx, "jordan", open.id).ok, true);
  const confirmed = getDate(ctx, "jordan", "match_avery_jordan");
  assert.equal(confirmed?.proposals.some((item) => item.status === "confirmed"), true);
  assert.equal(confirmed?.canPropose, false);
  ctx.close();

  const passed = await fresh();
  const offer = getDate(passed, "avery", "match_avery_jordan")?.proposals[0];
  assert.ok(offer);
  assert.equal(passOffer(passed, "avery", offer.id).ok, true);
  assert.equal(getDate(passed, "jordan", "match_avery_jordan")?.proposals[0]?.status, "declined");
  assert.equal(approveOffer(passed, "jordan", offer.id).ok, false);
  passed.close();

  const tweaked = await fresh();
  const target = getDate(tweaked, "avery", "match_avery_jordan")?.proposals[0];
  assert.ok(target);
  assert.equal(
    tweakOffer(tweaked, "avery", target.id, {
      local: target.local,
      place: "Ferry Building",
      note: "A short walk if the weather holds.",
    }).ok,
    true,
  );
  const jordanView = getDate(tweaked, "jordan", "match_avery_jordan")?.proposals[0];
  assert.equal(jordanView?.place, "Ferry Building");
  assert.equal(jordanView?.myDecision, "pending");
  assert.equal(getDate(tweaked, "avery", "match_avery_jordan")?.proposals[0]?.myDecision, "approved");
  tweaked.close();
});

test("loosening a kids dealbreaker surfaces Noah and tightening hides a desk", async () => {
  const ctx = await fresh();
  const avery = getMember(ctx, "avery");
  assert.ok(avery);
  const opened = saveMember(ctx, "avery", { ...memberToInput(avery), kidsFilter: "any" });
  assert.equal(opened.ok, true);
  assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === "noah"), true);
  assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === "morgan"), false);

  const restored = saveMember(ctx, "avery", memberToInput(getMember(ctx, "avery")!));
  assert.equal(restored.ok, true);
  const tightened = saveMember(ctx, "avery", { ...memberToInput(getMember(ctx, "avery")!), ageMax: 30 });
  assert.equal(tightened.ok, true);
  assert.equal(getDesk(ctx, "avery", "match_avery_jordan"), null);
  assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === "jordan"), false);

  assert.equal(saveMember(ctx, "avery", { ...memberToInput(getMember(ctx, "avery")!), ageMax: 38 }).ok, true);
  const desk = getDesk(ctx, "avery", "match_avery_jordan");
  assert.equal(desk?.items.some((item) => item.kind === "bot"), true);
  ctx.close();
});

test("wiping bot memory keeps human chat", async () => {
  const ctx = await fresh();
  ctx.db
    .insert(messages)
    .values({
      id: "msg_human_keep",
      matchId: "match_avery_jordan",
      channel: "human",
      authorUserId: "avery",
      authorKind: "human",
      body: "The walking question was the right one.",
      approvalStatus: "sent",
      scriptStep: null,
      edited: false,
      createdAt: "2026-09-21T15:00:00.000Z",
    })
    .run();
  assert.equal(wipeMemory(ctx, "avery").ok, true);
  const desk = getDesk(ctx, "avery", "match_avery_jordan");
  assert.equal(desk?.items.some((item) => item.kind === "bot"), false);
  assert.equal(desk?.items.some((item) => item.kind === "system"), true);
  const intro = getIntro(ctx, "avery", "match_avery_jordan");
  assert.equal(intro?.humanMessages.some((message) => message.body.includes("walking question")), true);
  const jordan = getDesk(ctx, "jordan", "match_avery_jordan");
  assert.equal(jordan?.items.some((item) => item.kind === "bot"), false);
  ctx.close();
});
