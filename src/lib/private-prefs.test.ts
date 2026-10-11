import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { handleMcp } from "./agent/mcp";
import { callTool } from "./agent/tools";
import { issueAgentToken } from "./agent/tokens";
import { openDatabase } from "./db/open";
import { matchCheckHits, privatePrefs } from "./db/schema";
import { getMember, listShortlist, saveOnboardingAnswers } from "./domain";
import { isOpenPath } from "./http/public";
import { checkMatch, MATCH_CHECKS_PER_DAY, MATCH_CHECKS_PER_MINUTE, type MatchLogEvent } from "./match-check";
import { PREFS_KEY_INVALID, PREFS_KEY_MISSING, readPrefsKey, readPrivatePrefs, writePrivatePrefs } from "./private-prefs";
import { eq } from "drizzle-orm";

const HEX_KEY = "ab".repeat(32);

function withKey(key: string | undefined) {
  const previous = process.env.PREFS_KEY;
  if (key === undefined) delete process.env.PREFS_KEY;
  else process.env.PREFS_KEY = key;
  return () => {
    if (previous === undefined) delete process.env.PREFS_KEY;
    else process.env.PREFS_KEY = previous;
  };
}

test("private preference routes authenticate themselves and a profile path stays gated", () => {
  assert.equal(isOpenPath("/api/me/private-prefs"), true);
  assert.equal(isOpenPath("/api/match/check"), true);
  assert.equal(isOpenPath("/api/me/profile"), false);
});

test("PREFS_KEY is required, accepts hex or base64, and never uses a default", () => {
  const restore = withKey(undefined);
  try {
    assert.deepEqual(readPrefsKey(), { ok: false, error: PREFS_KEY_MISSING });
  } finally {
    restore();
  }
  const bad = withKey("not-a-key");
  try {
    assert.deepEqual(readPrefsKey(), { ok: false, error: PREFS_KEY_INVALID });
  } finally {
    bad();
  }
  const hex = withKey(HEX_KEY);
  try {
    const read = readPrefsKey();
    assert.equal(read.ok, true);
    if (read.ok) assert.equal(read.key.length, 32);
  } finally {
    hex();
  }
  const base64 = withKey(Buffer.alloc(32, 7).toString("base64"));
  try {
    const read = readPrefsKey();
    assert.equal(read.ok, true);
  } finally {
    base64();
  }
});

test("saving an interview encrypts first and does not write plaintext when the key is missing", async () => {
  const restore = withKey(undefined);
  const ctx = await openDatabase(":memory:");
  try {
    const before = getMember(ctx, "avery");
    assert.ok(before);
    const saved = saveOnboardingAnswers(ctx, "avery", { funFacts: ["secret-bakery-token", "second fact here"] });
    assert.equal(saved.ok, false);
    if (saved.ok) return;
    assert.equal(saved.error, PREFS_KEY_MISSING);
    const after = getMember(ctx, "avery");
    assert.deepEqual(after?.onboarding.funFacts, before.onboarding.funFacts);
    assert.equal(ctx.db.select().from(privatePrefs).all().length, 0);
  } finally {
    ctx.close();
    restore();
  }
});

test("ciphertext round-trips and does not contain the answer", async () => {
  const restore = withKey(HEX_KEY);
  const ctx = await openDatabase(":memory:");
  try {
    const phrase = "secret-bakery-token";
    const written = writePrivatePrefs(ctx, "avery", { ...getMember(ctx, "avery")!.onboarding, funFacts: [phrase, "walks the long way"] });
    assert.equal(written.ok, true);
    const row = ctx.db.select().from(privatePrefs).where(eq(privatePrefs.memberId, "avery")).get();
    assert.ok(row);
    assert.equal(row.ciphertext.includes(phrase), false);
    assert.equal(row.iv.includes(phrase), false);
    assert.equal(JSON.stringify(row).includes("PREFS_KEY"), false);
    const read = readPrivatePrefs(ctx, "avery");
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.answers?.funFacts?.[0], phrase);
  } finally {
    ctx.close();
    restore();
  }
});

test("check_match returns only compatible and shared interests, and the age range comes from the encrypted answers", async () => {
  const restore = withKey(HEX_KEY);
  const ctx = await openDatabase(":memory:");
  const logs: MatchLogEvent[] = [];
  try {
    const avery = getMember(ctx, "avery");
    const jordan = getMember(ctx, "jordan");
    const morgan = getMember(ctx, "morgan");
    assert.ok(avery && jordan && morgan);
    assert.ok(jordan.profile.age > 21);
    writePrivatePrefs(ctx, avery.id, avery.onboarding);
    writePrivatePrefs(ctx, jordan.id, jordan.onboarding);
    writePrivatePrefs(ctx, morgan.id, morgan.onboarding);

    const see = (event: MatchLogEvent) => logs.push(event);
    const pass = checkMatch(ctx, avery.id, jordan.id, see);
    assert.equal(pass.status, 200);
    const passed = pass.body as { compatible: boolean; shared: string[]; error?: string };
    assert.equal(passed.compatible, true);
    assert.equal(passed.shared.includes("cooking"), true);
    assert.equal("error" in passed, false);
    assert.equal(JSON.stringify(pass.body).includes("mustHave"), false);
    assert.equal(JSON.stringify(pass.body).includes(avery.displayName), false);

    const miss = checkMatch(ctx, avery.id, morgan.id, see);
    assert.equal(miss.status, 200);
    const missed = miss.body as { compatible: boolean; shared: string[] };
    assert.equal(missed.compatible, false);
    const dumped = JSON.stringify(miss.body).toLowerCase();
    assert.equal(dumped.includes("smoking"), false);
    assert.equal(dumped.includes("dealbreaker"), false);
    assert.equal(dumped.includes("morgan"), false);

    writePrivatePrefs(ctx, avery.id, { ...avery.onboarding, ageMin: 18, ageMax: 21 });
    const aged = checkMatch(ctx, avery.id, jordan.id, see);
    assert.equal((aged.body as { compatible: boolean }).compatible, false);
    assert.equal(JSON.stringify(aged.body).includes("age"), false);
    const still = listShortlist(ctx, avery.id);
    assert.equal(still.cards.some((card) => card.person.id === jordan.id), true);

    ctx.db.update(privatePrefs).set({ ciphertext: Buffer.from("tampered").toString("base64") }).where(eq(privatePrefs.memberId, jordan.id)).run();
    const broken = checkMatch(ctx, avery.id, jordan.id, see);
    assert.equal((broken.body as { compatible: boolean }).compatible, false);

    assert.ok(logs.length >= 3);
    for (const event of logs) {
      assert.deepEqual(Object.keys(event), ["compatible"]);
      const line = JSON.stringify(event);
      assert.equal(line.includes("avery") || line.includes("jordan") || line.includes("morgan"), false);
    }
    const source = fs.readFileSync(new URL("./match-check.ts", import.meta.url), "utf8");
    assert.match(source, /console\.info\(JSON\.stringify\(event\)\)/);
  } finally {
    ctx.close();
    restore();
  }
});

test("match checks are rate limited and the hit row stores no other member and no result", async () => {
  const restore = withKey(HEX_KEY);
  const ctx = await openDatabase(":memory:");
  const logs: MatchLogEvent[] = [];
  const see = (event: MatchLogEvent) => logs.push(event);
  try {
    const avery = getMember(ctx, "avery")!;
    const jordan = getMember(ctx, "jordan")!;
    writePrivatePrefs(ctx, avery.id, avery.onboarding);
    writePrivatePrefs(ctx, jordan.id, jordan.onboarding);
    const past = new Date(Date.now() - 120_000).toISOString();
    for (let i = 0; i < MATCH_CHECKS_PER_DAY; i += 1) {
      ctx.db.insert(matchCheckHits).values({ id: `day-${i}`, memberId: jordan.id, createdAt: past }).run();
    }
    const day = checkMatch(ctx, jordan.id, avery.id, see);
    assert.equal(day.status, 429);
    for (let i = 0; i < MATCH_CHECKS_PER_MINUTE; i += 1) {
      const result = checkMatch(ctx, avery.id, jordan.id, see);
      assert.equal(result.status, 200);
    }
    const limited = checkMatch(ctx, avery.id, jordan.id, see);
    assert.equal(limited.status, 429);
    assert.equal((limited.body as { error: string }).error.includes("jordan"), false);
    const hits = ctx.db.select().from(matchCheckHits).where(eq(matchCheckHits.memberId, "avery")).all();
    assert.equal(hits.length, MATCH_CHECKS_PER_MINUTE);
    for (const hit of hits) {
      assert.equal(hit.memberId, "avery");
      assert.equal("otherMemberId" in hit, false);
      assert.equal("result" in hit, false);
      assert.equal("compatible" in hit, false);
    }
    assert.ok(logs.some((event) => "limited" in event && event.limited === true));
    assert.equal(JSON.stringify(logs).includes("avery"), false);
  } finally {
    ctx.close();
    restore();
  }
});

test("MCP draft stays free of answer text, and check_match is a tool", async () => {
  const restore = withKey(HEX_KEY);
  const ctx = await openDatabase(":memory:");
  try {
    const issued = issueAgentToken(ctx, "avery");
    assert.ok(issued);
    const listed = handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const names = (listed.body as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
    assert.equal(names.includes("set_private_prefs"), true);
    assert.equal(names.includes("check_match"), true);
    const avery = getMember(ctx, "avery")!;
    const jordan = getMember(ctx, "jordan")!;
    writePrivatePrefs(ctx, avery.id, avery.onboarding);
    writePrivatePrefs(ctx, jordan.id, jordan.onboarding);
    const checked = callTool(ctx, avery, "check_match", { other_member_id: jordan.id });
    assert.equal(checked?.status, 200);
    const body = checked?.body as { compatible: boolean; shared: string[] };
    assert.equal(body.compatible, true);
    assert.equal(JSON.stringify(body).includes("quiet"), false);
    const progress = fs.readFileSync(new URL("../components/onboarding-progress.tsx", import.meta.url), "utf8");
    assert.match(progress, /"Answered"/);
    assert.equal(progress.includes("summary("), false);
  } finally {
    ctx.close();
    restore();
  }
});
