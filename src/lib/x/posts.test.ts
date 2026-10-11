import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { dispatchAgent } from "../agent/dispatch";
import { handleMcp } from "../agent/mcp";
import { issueAgentToken } from "../agent/tokens";
import { SYNCED_TABLES, openDatabase } from "../db/open";
import { SCHEMA_SQL, users, xPostLearning } from "../db/schema";
import { resetDatabase } from "../db/seed";
import { X_LEARN_SCOPES, X_SCOPES, authorizeUrl } from "./pkce";
import { openSecret } from "./seal";
import {
  EMPTY_X_POST_SUMMARY,
  MAX_POST_CALLS,
  POSTS_TARGET,
  SUMMARY_WEEK_MS,
  X_POSTS_HINT,
  fetchRecentPosts,
  learnFromGrant,
  learnsFromXPosts,
  memberTweetsUrl,
  optOutOfXPosts,
  postIsSensitive,
  refreshXPostSummaryIfDue,
  storedXPostSummary,
  summarizePosts,
} from "./posts";

const SECRET = "test-session-secret-for-x-posts";
const ACCESS = "member-access-token-do-not-store-raw";
const REFRESH = "member-refresh-token-do-not-store-raw";
const TWEET = "I spend Sunday on pottery with my kids lol and I send short texts.";

function tweetResponse(texts: string[], next?: string): Response {
  return new Response(
    JSON.stringify({
      data: texts.map((text, index) => ({ id: String(index + 1), text })),
      meta: { result_count: texts.length, ...(next ? { next_token: next } : {}) },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("the summary stays inside the five allowed topics and drops sensitive posts", () => {
  assert.equal(X_POSTS_HINT, "Let my bot learn from my X posts");
  const summary = summarizePosts([
    "I love cooking, travel, and coffee.",
    "My humor is dry and full of puns.",
    "I send short texts and voice notes.",
    TWEET,
    "Sunday family dinner with my parents.",
    "I vote Democrat and go to church. I was diagnosed with diabetes. I am gay.",
  ]);
  assert.match(summary.interests, /cooking/);
  assert.match(summary.interests, /travel/);
  assert.match(summary.humor, /dry/);
  assert.match(summary.humor, /puns/);
  assert.match(summary.communicationStyle, /short texts/);
  assert.match(summary.communicationStyle, /voice notes/);
  assert.match(summary.hobbies, /pottery/);
  assert.match(summary.familyLife, /kids/);
  assert.match(summary.familyLife, /parents/);
  const blob = JSON.stringify(summary).toLowerCase();
  for (const word of ["democrat", "church", "diabetes", "gay", "vote", "diagnosed", "religion", "politics"]) {
    assert.equal(blob.includes(word), false, word);
  }
  assert.equal(blob.includes(TWEET.toLowerCase()), false);
  assert.equal(Object.keys(summary).join(","), "interests,humor,communicationStyle,hobbies,familyLife");

  const mixed = summarizePosts(["I love hiking and I vote Democrat."]);
  assert.deepEqual(mixed, EMPTY_X_POST_SUMMARY);
  assert.equal(postIsSensitive("Thank God I made it to yoga"), true);
  assert.equal(summarizePosts(["Thank God I made it to yoga"]).hobbies, "");
});

test("users/:id/tweets uses max_results=100 and stops after two calls", async () => {
  const url = new URL(memberTweetsUrl("4242"));
  assert.equal(url.origin + url.pathname, "https://api.x.com/2/users/4242/tweets");
  assert.equal(url.searchParams.get("max_results"), "100");
  assert.equal(MAX_POST_CALLS, 2);
  assert.equal(POSTS_TARGET, 100);

  let fullCalls = 0;
  const full = await fetchRecentPosts("4242", ACCESS, async (input) => {
    fullCalls += 1;
    const parsed = new URL(String(input));
    assert.equal(parsed.searchParams.get("max_results"), "100");
    assert.equal(parsed.searchParams.get("pagination_token"), null);
    return tweetResponse(Array.from({ length: 100 }, () => "hiking"));
  });
  assert.equal(fullCalls, 1);
  assert.equal(full.length, 100);

  const seen: string[] = [];
  const paged = await fetchRecentPosts("4242", ACCESS, async (input) => {
    const parsed = new URL(String(input));
    seen.push(parsed.searchParams.get("pagination_token") ?? "");
    assert.equal(parsed.searchParams.get("max_results"), "100");
    if (!parsed.searchParams.get("pagination_token")) return tweetResponse(Array.from({ length: 40 }, () => "yoga"), "page-2");
    return tweetResponse(Array.from({ length: 80 }, () => "camping"), "page-3");
  });
  assert.deepEqual(seen, ["", "page-2"]);
  assert.equal(paged.length, 100);
  assert.equal(paged.filter((text) => text === "yoga").length, 40);
  assert.equal(paged.filter((text) => text === "camping").length, 60);
});

test("opt-in stores a summary and a sealed refresh token, and opt-out deletes both", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    assert.equal(learnsFromXPosts(ctx, "jordan"), false);
    assert.equal(storedXPostSummary(ctx, "jordan"), null);
    assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS x_post_learning/);
    assert.equal(SYNCED_TABLES.includes("x_post_learning"), true);
    assert.equal(X_SCOPES.includes("offline.access"), false);
    const learnUrl = authorizeUrl({
      clientId: "client",
      redirectUri: "http://localhost:3000/api/auth/x/callback",
      state: "state",
      verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      scopes: X_LEARN_SCOPES,
    });
    assert.match(learnUrl, /offline\.access/);
    assert.equal(learnUrl.includes("tweet.write"), false);

    let calls = 0;
    const summary = await learnFromGrant(ctx, {
      memberId: "jordan",
      xUserId: "4242",
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresIn: 7200,
      secret: SECRET,
      now: 1_700_000_000_000,
      fetchImpl: async () => {
        calls += 1;
        return tweetResponse([TWEET, "I vote Democrat"]);
      },
    });
    assert.equal(calls, 1);
    assert.match(summary.hobbies, /pottery/);
    assert.equal(JSON.stringify(summary).toLowerCase().includes("democrat"), false);
    const row = ctx.db.select().from(xPostLearning).where(eq(xPostLearning.memberId, "jordan")).get();
    assert.ok(row);
    const stored = JSON.stringify(row);
    assert.equal(stored.includes(ACCESS), false);
    assert.equal(stored.includes(REFRESH), false);
    assert.equal(stored.includes(TWEET), false);
    assert.equal(openSecret(row.refreshTokenCiphertext, SECRET), REFRESH);
    assert.equal(learnsFromXPosts(ctx, "jordan"), true);

    optOutOfXPosts(ctx, "jordan");
    assert.equal(learnsFromXPosts(ctx, "jordan"), false);
    assert.equal(storedXPostSummary(ctx, "jordan"), null);
    assert.equal(ctx.db.select().from(xPostLearning).all().length, 0);
  } finally {
    ctx.close();
  }
});

test("a summary refreshes at most weekly, including after a failed fetch", async () => {
  const ctx = await openDatabase(":memory:");
  const previous = {
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
  };
  process.env.X_CLIENT_ID = "client";
  process.env.X_CLIENT_SECRET = "secret";
  process.env.X_REDIRECT_URI = "http://localhost:3000/api/auth/x/callback";
  try {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    await learnFromGrant(ctx, {
      memberId: "jordan",
      xUserId: "4242",
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresIn: 7200,
      secret: SECRET,
      now: start,
      fetchImpl: async () => tweetResponse(["hiking and pottery"]),
    });
    ctx.db.update(users).set({ xUserId: "4242" }).where(eq(users.id, "jordan")).run();
    ctx.db
      .update(xPostLearning)
      .set({ tokenExpiresAt: new Date(start + SUMMARY_WEEK_MS * 4).toISOString() })
      .where(eq(xPostLearning.memberId, "jordan"))
      .run();

    let early = 0;
    await refreshXPostSummaryIfDue(ctx, "jordan", {
      now: start + SUMMARY_WEEK_MS - 1,
      secret: SECRET,
      fetchImpl: async () => {
        early += 1;
        return tweetResponse(["yoga"]);
      },
    });
    assert.equal(early, 0);
    assert.match(storedXPostSummary(ctx, "jordan")?.hobbies ?? "", /pottery/);

    let pages = 0;
    await refreshXPostSummaryIfDue(ctx, "jordan", {
      now: start + SUMMARY_WEEK_MS,
      secret: SECRET,
      fetchImpl: async (input) => {
        pages += 1;
        const parsed = new URL(String(input));
        assert.equal(parsed.pathname, "/2/users/4242/tweets");
        if (pages === 1) return tweetResponse(Array.from({ length: 10 }, () => "yoga"), "next");
        return tweetResponse(["camping"]);
      },
    });
    assert.equal(pages, 2);
    assert.match(storedXPostSummary(ctx, "jordan")?.hobbies ?? "", /yoga/);
    assert.match(storedXPostSummary(ctx, "jordan")?.hobbies ?? "", /camping/);

    const failedAt = start + SUMMARY_WEEK_MS * 2;
    let failures = 0;
    await refreshXPostSummaryIfDue(ctx, "jordan", {
      now: failedAt,
      secret: SECRET,
      fetchImpl: async () => {
        failures += 1;
        return new Response("nope", { status: 503 });
      },
    });
    assert.equal(failures, 1);
    assert.match(storedXPostSummary(ctx, "jordan")?.hobbies ?? "", /yoga/);
    await refreshXPostSummaryIfDue(ctx, "jordan", {
      now: failedAt + 1000,
      secret: SECRET,
      fetchImpl: async () => {
        failures += 1;
        return tweetResponse(["knitting"]);
      },
    });
    assert.equal(failures, 1);
    assert.equal((storedXPostSummary(ctx, "jordan")?.hobbies ?? "").includes("knitting"), false);

    ctx.db.update(xPostLearning).set({ tokenExpiresAt: new Date(failedAt).toISOString(), summaryAt: new Date(failedAt - SUMMARY_WEEK_MS).toISOString() }).where(eq(xPostLearning.memberId, "jordan")).run();
    const calls: string[] = [];
    await refreshXPostSummaryIfDue(ctx, "jordan", {
      now: failedAt,
      secret: SECRET,
      fetchImpl: async (input, init) => {
        const target = String(input);
        calls.push(new URL(target).pathname);
        if (target.includes("/oauth2/token")) {
          const body = String(init?.body ?? "");
          assert.match(body, /grant_type=refresh_token/);
          assert.match(body, new RegExp(`refresh_token=${REFRESH}`));
          return new Response(JSON.stringify({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_in: 7200 }), { status: 200 });
        }
        const header = new Headers(init?.headers).get("authorization");
        assert.equal(header, "Bearer rotated-access");
        return tweetResponse(["surfing"]);
      },
    });
    assert.deepEqual(calls, ["/2/oauth2/token", "/2/users/4242/tweets"]);
    const row = ctx.db.select().from(xPostLearning).where(eq(xPostLearning.memberId, "jordan")).get();
    assert.ok(row);
    assert.equal(openSecret(row.refreshTokenCiphertext, SECRET), "rotated-refresh");
    assert.equal(JSON.stringify(row).includes("rotated-refresh"), false);
    assert.match(storedXPostSummary(ctx, "jordan")?.hobbies ?? "", /surfing/);

    await learnFromGrant(ctx, {
      memberId: "riley",
      xUserId: "7777",
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresIn: 60,
      secret: SECRET,
      now: start,
      fetchImpl: async () => tweetResponse(["baking"]),
    });
    resetDatabase(ctx);
    assert.equal(learnsFromXPosts(ctx, "riley"), false);
    assert.equal(learnsFromXPosts(ctx, "jordan"), false);
  } finally {
    ctx.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("bots see xPosts only on the anonymized shortlist card", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    await learnFromGrant(ctx, {
      memberId: "jordan",
      xUserId: "4242",
      accessToken: ACCESS,
      refreshToken: REFRESH,
      expiresIn: 7200,
      secret: SECRET,
      now: Date.now(),
      fetchImpl: async () => tweetResponse([TWEET]),
    });
    const issued = issueAgentToken(ctx, "avery");
    assert.ok(issued);
    const listed = await handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    const tools = ((listed.body as { result: { tools: { name: string; description: string }[] } }).result.tools);
    assert.equal(tools.some((tool) => tool.name === "get_shortlist"), true);
    assert.match(tools.find((tool) => tool.name === "get_shortlist")?.description ?? "", /religion, politics, health, sexual orientation/);

    let refreshes = 0;
    const called = await handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_shortlist", arguments: {} } },
      fetchImpl: async () => {
        refreshes += 1;
        return tweetResponse(["knitting"]);
      },
    });
    assert.equal(refreshes, 0);
    const text = (called.body as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "";
    const payload = JSON.parse(text) as {
      members: { displayName: string; anonymized: { label: string; xPosts: { hobbies: string } | null } }[];
    };
    const jordan = payload.members.find((member) => member.displayName === "Jordan Hale");
    assert.ok(jordan);
    assert.equal(jordan.anonymized.label, "Man, 34, San Francisco");
    assert.equal(JSON.stringify(jordan.anonymized).includes("Jordan"), false);
    assert.equal(JSON.stringify(jordan.anonymized).includes("Hale"), false);
    assert.equal("displayName" in jordan.anonymized, false);
    assert.match(jordan.anonymized.xPosts?.hobbies ?? "", /pottery/);
    const riley = payload.members.find((member) => member.displayName.startsWith("Riley"));
    assert.ok(riley);
    assert.equal(riley.anonymized.xPosts, null);

    for (const name of ["browse_members", "get_member", "get_my_profile"] as const) {
      const response = await handleMcp({
        ctx,
        authorization: `Bearer ${issued.token}`,
        message: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name, arguments: name === "get_member" ? { memberId: "jordan" } : {} },
        },
      });
      const body = (response.body as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "";
      assert.equal(body.includes("xPosts"), false, name);
      assert.equal(body.includes("pottery"), false, name);
    }

    const rest = dispatchAgent({
      ctx,
      authorization: `Bearer ${issued.token}`,
      method: "GET",
      pathname: "/api/agent/v1/shortlist",
      body: null,
    });
    const restBody = JSON.stringify(rest.body);
    assert.equal(restBody.includes("xPosts"), false);
    assert.equal(restBody.includes("pottery"), false);
  } finally {
    ctx.close();
  }
});
