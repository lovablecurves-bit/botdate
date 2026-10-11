import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMcp } from "./agent/mcp";
import { issueAgentToken } from "./agent/tokens";
import { callTool } from "./agent/tools";
import { openDatabase } from "./db/open";
import { demoMember } from "./demo/members";
import { getMember } from "./domain";
import { mergeOnboarding, onboardingBlock, onboardingView, parseLookingFor, phraseHits, profileComplete } from "./onboarding";
import { upsertXMember } from "./x/account";

const FULL = {
  datingGoal: "marriage",
  lookingFor: ["love", "friends"],
  mustHaves: ["kind"],
  dealbreakers: ["smokes"],
  ageMin: 28,
  ageMax: 40,
  location: "Oakland",
  maxDistanceMiles: 20,
  gender: "woman",
  orientation: "bisexual",
  seeking: "women and men",
  kidsHave: "no",
  kidsWant: "open",
  drinking: "socially",
  smoking: "no",
  faith: "secular",
  fitness: "runs",
  pets: "has a dog",
  valuesPolitics: "very important",
  loveLanguage: "words of affirmation",
  communicationStyle: "texts back the same day",
  funFacts: ["Knows every bakery in Oakland.", "Sings in the car."],
};

function toolText(body: unknown): string {
  return (body as { result: { content: { text: string }[]; isError?: boolean } }).result.content[0]?.text ?? "";
}

test("the interview lists every required topic and accepts a partial answer", () => {
  const empty = onboardingView({});
  assert.equal(empty.profile_complete, false);
  assert.match(empty.instructions, /get_onboarding first/);
  assert.match(empty.instructions, /one or two questions at a time/);
  assert.match(empty.instructions, /in your own words/);
  assert.deepEqual(empty.missing, [
    "dating goal",
    "looking for",
    "must-haves",
    "dealbreakers",
    "age range wanted",
    "location and max distance",
    "gender, orientation, and who they want to meet",
    "kids",
    "lifestyle",
    "values and politics",
    "love language and communication style",
    "fun facts",
  ]);

  const partial = mergeOnboarding({}, { datingGoal: "serious", funFacts: ["One bakery."] });
  assert.ok(!("error" in partial));
  if ("error" in partial) return;
  const view = onboardingView(partial.answers);
  assert.equal(view.profile_complete, false);
  assert.equal(view.answered.includes("dating goal"), true);
  assert.equal(view.missing.includes("dating goal"), false);
  assert.equal(view.missing.includes("fun facts"), true);
  assert.deepEqual(view.questions.find((question) => question.id === "funFacts")?.answer, ["One bakery."]);
  assert.deepEqual(partial.saved, ["datingGoal", "funFacts"]);
});

test("a bad answer is rejected and a finished interview is profile_complete", () => {
  const bad = mergeOnboarding({}, { datingGoal: "maybe" });
  assert.deepEqual(bad, { error: "datingGoal must be serious, marriage, or casual." });
  const done = mergeOnboarding({}, FULL);
  assert.ok(!("error" in done));
  if ("error" in done) return;
  assert.equal(profileComplete(done.answers), true);
  assert.equal(done.answers.datingGoal, "marriage");
  assert.equal(done.answers.valuesPolitics, "high");
  assert.equal(onboardingBlock(done.answers), null);
  const block = onboardingBlock({});
  assert.equal(block?.error, "onboarding incomplete");
  assert.equal(block?.missing.includes("must-haves"), true);
  assert.match(block?.message ?? "", /Missing: dating goal, looking for, must-haves/);
});

test("looking for accepts the badge names and rejects an unknown choice", () => {
  assert.deepEqual(parseLookingFor("Love, hookup, friends"), ["love", "casual", "friends"]);
  assert.equal(parseLookingFor("marriage"), null);
  const saved = mergeOnboarding({}, { lookingFor: ["friends"] });
  assert.ok(!("error" in saved));
  if ("error" in saved) return;
  assert.deepEqual(saved.answers.lookingFor, ["friends"]);
  assert.equal(onboardingView(saved.answers).missing.includes("looking for"), false);
});

test("dealbreaker phrases match a profile and miss a negation", () => {
  assert.equal(phraseHits("works in brand and smokes on long weeks", "smokes"), true);
  assert.equal(phraseHits("likes a quiet table.", "quiet table"), true);
  assert.equal(phraseHits("doesn't want kids", "wants kids"), false);
  assert.equal(phraseHits("a non-smoker who walks", "smokes"), false);
});

test("demo members are already interviewed", () => {
  assert.equal(profileComplete(demoMember("avery").onboarding), true);
  assert.equal(profileComplete(demoMember("priya").onboarding), true);
});

test("MCP initialize and get_my_profile point at get_onboarding, and gated tools list the missing fields", async () => {
  const previousKey = process.env.PREFS_KEY;
  process.env.PREFS_KEY = "ab".repeat(32);
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const created = upsertXMember(ctx, {
      xUserId: "50",
      handle: "ada",
      name: "Ada",
      bio: "Hi",
      avatarUrl: "",
    });
    const issued = issueAgentToken(ctx, created.userId);
    assert.ok(issued);
    const auth = `Bearer ${issued.token}`;

    const init = handleMcp({ ctx, authorization: null, message: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } });
    const instructions = (init.body as { result: { instructions: string } }).result.instructions;
    assert.match(instructions, /Call get_onboarding first/);
    assert.match(instructions, /one or two questions at a time/);
    assert.match(instructions, /in your own words/);

    const listed = handleMcp({ ctx, authorization: auth, message: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
    const names = (listed.body as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
    assert.equal(names.includes("get_onboarding"), true);
    assert.equal(names.includes("submit_onboarding_answers"), true);

    const profile = handleMcp({
      ctx,
      authorization: auth,
      message: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    const profileBody = JSON.parse(toolText(profile.body)) as { instructions: string; profile_complete: boolean; missing: string[] };
    assert.match(profileBody.instructions, /get_onboarding first/);
    assert.equal(profileBody.profile_complete, false);
    assert.equal(profileBody.missing.includes("dealbreakers"), true);

    const member = getMember(ctx, created.userId);
    assert.ok(member);
    for (const name of ["browse_members", "send_bot_message", "propose_date"] as const) {
      const blocked = callTool(ctx, member, name, { memberId: "someone", body: "Hello", local: "2026-10-17T11:00", place: "Tartine" });
      assert.ok(blocked);
      assert.equal(blocked.status, 400);
      const body = blocked.body as { error: string; missing: string[] };
      assert.equal(body.error, "onboarding incomplete");
      assert.equal(body.missing.includes("fun facts"), true);
      assert.match(JSON.stringify(body), /onboarding incomplete/);
    }

    const partial = handleMcp({
      ctx,
      authorization: auth,
      message: { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "submit_onboarding_answers", arguments: { datingGoal: "serious" } } },
    });
    const partialBody = JSON.parse(toolText(partial.body)) as { profile_complete: boolean; missing: string[]; saved: string[] };
    assert.equal(partialBody.profile_complete, false);
    assert.deepEqual(partialBody.saved, ["datingGoal"]);
    assert.equal(partialBody.missing.includes("dating goal"), false);
    assert.equal(partialBody.missing.includes("must-haves"), true);

    const still = callTool(ctx, getMember(ctx, created.userId)!, "browse_members", {});
    assert.equal((still?.body as { error: string }).error, "onboarding incomplete");

    const finished = handleMcp({
      ctx,
      authorization: auth,
      message: { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "submit_onboarding_answers", arguments: FULL } },
    });
    const finishedBody = JSON.parse(toolText(finished.body)) as { profile_complete: boolean; isError?: boolean };
    assert.equal((finished.body as { result: { isError: boolean } }).result.isError, false);
    assert.equal(finishedBody.profile_complete, true);

    const updated = getMember(ctx, created.userId);
    assert.equal(updated?.profile.intent, "serious");
    assert.equal(updated?.profile.city, "Oakland");
    assert.equal(updated?.prefs.ageMin, 28);
    assert.equal(updated?.prefs.ageMax, 40);
    assert.equal(updated?.profile.smoking, false);
    assert.equal(updated?.profile.kids, "open");

    const open = callTool(ctx, updated!, "browse_members", {});
    assert.equal(open?.status, 200);
    assert.ok(!("error" in (open?.body as object)));
    assert.equal(finishedBody.profile_complete, true);
    assert.equal(toolText(finished.body).includes("Knows every bakery"), false);
    const questions = (finishedBody as { questions?: { answer: unknown }[] }).questions ?? [];
    assert.ok(questions.length > 0);
    assert.ok(questions.every((question) => question.answer == null));
  } finally {
    ctx.close();
    if (previousKey === undefined) delete process.env.PREFS_KEY;
    else process.env.PREFS_KEY = previousKey;
  }
});
