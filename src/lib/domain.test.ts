import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, type BotDateDb } from "./db/open";
import {
  approveDraft,
  chooseChannel,
  createDraft,
  editDraft,
  getDate,
  getDesk,
  getIntro,
  getMember,
  killDraft,
  listShortlist,
  memberToInput,
  optIn,
  proposeDate,
  respondToDate,
  saveMember,
  sendHuman,
  setPaused,
  wipeMemory,
} from "./domain";
import { upcomingSaturdayLocal } from "./time";

function fresh(): BotDateDb {
  return openDatabase(":memory:");
}

test("Avery's shortlist hides dealbreaker misses and ranks the rest", () => {
  const ctx = fresh();
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

test("unapproved drafts stay invisible to the other person", () => {
  const ctx = fresh();
  const avery = getDesk(ctx, "avery", "match_avery_riley");
  const riley = getDesk(ctx, "riley", "match_avery_riley");
  assert.ok(avery && riley?.draft);
  assert.equal(avery.draft, null);
  assert.equal(avery.heldCount, 1);
  assert.equal(JSON.stringify(avery).includes("solitude"), false);
  assert.match(riley.draft.body, /solitude/);
  ctx.close();
});

test("approve, edit, and kill only work on your own draft", () => {
  const ctx = fresh();
  const samDesk = getDesk(ctx, "avery", "match_avery_sam");
  assert.ok(samDesk?.draft);
  const draftId = samDesk.draft.id;
  assert.match(samDesk.draft.body, /library job/);

  const edited = editDraft(ctx, "avery", draftId, "Avery would like a weeknight table, nothing performative.");
  assert.equal(edited.ok, true);
  const afterEdit = getDesk(ctx, "avery", "match_avery_sam");
  assert.match(afterEdit?.draft?.body ?? "", /weeknight table/);
  assert.equal(afterEdit?.items.some((item) => item.body.includes("weeknight")), false);

  const killed = killDraft(ctx, "avery", draftId);
  assert.equal(killed.ok, true);
  const afterKill = getDesk(ctx, "avery", "match_avery_sam");
  assert.equal(afterKill?.draft, null);
  assert.equal(afterKill?.killed.length, 1);
  const samView = getDesk(ctx, "sam", "match_avery_sam");
  assert.equal(JSON.stringify(samView).includes("weeknight"), false);
  assert.equal(JSON.stringify(samView).includes("library job"), false);

  const redraft = createDraft(ctx, "avery", "match_avery_sam");
  assert.equal(redraft.ok, true);
  const freshDraft = getDesk(ctx, "avery", "match_avery_sam")?.draft;
  assert.ok(freshDraft);
  const sentBody = "Avery is free after six on a weeknight if the room is quiet.";
  const approved = approveDraft(ctx, "avery", freshDraft.id, sentBody);
  assert.equal(approved.ok, true);
  const sent = getDesk(ctx, "avery", "match_avery_sam");
  assert.equal(sent?.items.some((item) => item.body === sentBody), true);
  const samAfter = getDesk(ctx, "sam", "match_avery_sam");
  assert.ok(samAfter?.draft);
  assert.equal(JSON.stringify(sent).includes(samAfter.draft.body), false);

  const rileyDraft = getDesk(ctx, "riley", "match_avery_riley")?.draft;
  assert.ok(rileyDraft);
  const sneak = approveDraft(ctx, "avery", rileyDraft.id, rileyDraft.body);
  assert.equal(sneak.ok, false);
  ctx.close();
});

test("a paused matchmaker cannot send", () => {
  const ctx = fresh();
  const draft = getDesk(ctx, "riley", "match_avery_riley")?.draft;
  assert.ok(draft);
  assert.equal(setPaused(ctx, "riley", true).ok, true);
  assert.equal(approveDraft(ctx, "riley", draft.id).ok, false);
  assert.equal(setPaused(ctx, "riley", false).ok, true);
  assert.equal(approveDraft(ctx, "riley", draft.id).ok, true);
  const avery = getDesk(ctx, "avery", "match_avery_riley");
  assert.equal(avery?.items.some((item) => item.body.includes("solitude")), true);
  ctx.close();
});

test("intro opt-in opens human chat only after both people agree", () => {
  const ctx = fresh();
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

test("the other person confirms a date and the proposer cannot", () => {
  const ctx = fresh();
  const date = getDate(ctx, "avery", "match_avery_jordan");
  const open = date?.proposals.find((item) => item.status === "proposed");
  assert.ok(open);
  assert.equal(open.mine, false);
  assert.equal(respondToDate(ctx, "jordan", open.id, "confirm").ok, false);
  assert.equal(
    proposeDate(ctx, "avery", "match_avery_jordan", {
      local: upcomingSaturdayLocal(),
      place: "Somewhere else",
      note: "",
    }).ok,
    false,
  );
  assert.equal(respondToDate(ctx, "avery", open.id, "confirm").ok, true);
  const after = getDate(ctx, "jordan", "match_avery_jordan");
  assert.equal(after?.proposals.some((item) => item.status === "confirmed"), true);
  assert.equal(after?.canPropose, false);
  ctx.close();
});

test("loosening a kids dealbreaker surfaces Noah and tightening hides a desk", () => {
  const ctx = fresh();
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

test("wiping bot memory keeps human chat", () => {
  const ctx = fresh();
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
