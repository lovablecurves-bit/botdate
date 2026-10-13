import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { dispatchAgent } from "./agent/dispatch";
import { issueAgentToken } from "./agent/tokens";
import { callTool } from "./agent/tools";
import { applyProfileMigration } from "./db/migrate";
import { openDatabase } from "./db/open";
import { profiles, prefs, users } from "./db/schema";
import { listDirectory } from "./directory";
import { applyBotProfile, getMember, listShortlist, memberToInput, saveMember } from "./domain";
import { CITIES, MEMBER_AGE_ERROR } from "./types";
import { claimsFromMember, memberFromClaims } from "./session";
import { upsertXMember } from "./x/account";

const ada = { xUserId: "42", handle: "ada", name: "Ada Lovelace", bio: "Analytical.", avatarUrl: "" };
const grace = { xUserId: "77", handle: "grace", name: "Grace Hopper", bio: "Compiles.", avatarUrl: "" };

test("suggested cities start with Austin, then Bastrop", () => {
  assert.equal(CITIES[0], "Austin");
  assert.equal(CITIES[1], "Bastrop");
  assert.equal(CITIES.includes("San Francisco"), true);
  assert.equal(CITIES.includes("Los Angeles"), true);
});

test("a new X signup stores unknown age, city, gender, and preferences", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const created = upsertXMember(ctx, ada);
    const member = getMember(ctx, created.userId);
    assert.ok(member);
    assert.equal(member.profile.age, null);
    assert.equal(member.profile.city, null);
    assert.equal(member.profile.gender, null);
    assert.equal(member.profile.occupation, "");
    assert.equal(member.profile.bio, "Analytical.");
    assert.equal(member.prefs.ageMin, null);
    assert.equal(member.prefs.ageMax, null);
    assert.equal(member.prefs.cities, null);
    assert.equal(member.prefs.seeking, null);
    assert.equal(member.prefs.smoking, "any");
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), false);

    const fallback = memberFromClaims(
      claimsFromMember({
        ...member,
        profile: {
          ...member.profile,
          age: 30,
          city: "San Francisco",
          occupation: "New here",
          gender: null,
        },
        prefs: { ...member.prefs, ageMin: 25, ageMax: 45, cities: ["San Francisco"] },
      }),
    );
    assert.equal(fallback.profile.age, null);
    assert.equal(fallback.profile.city, null);
    assert.equal(fallback.profile.gender, null);
    assert.equal(fallback.profile.occupation, "");
    assert.equal(fallback.prefs.ageMin, null);
    assert.equal(fallback.prefs.cities, null);
    assert.equal(fallback.prefs.seeking, null);
    assert.equal(fallback.profile.bio, "Analytical.");
  } finally {
    ctx.close();
  }
});

test("browse, get_member, and matching skip an incomplete profile until update_my_profile fills it", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    const created = upsertXMember(ctx, grace);
    const viewer = getMember(ctx, "avery");
    assert.ok(viewer);
    const hidden = callTool(ctx, viewer, "browse_members", {});
    assert.ok(hidden);
    const before = (hidden.body as { members: { id: string }[] }).members;
    assert.equal(before.some((member) => member.id === created.userId), false);
    const missing = callTool(ctx, viewer, "get_member", { memberId: created.userId });
    assert.equal(missing?.status, 404);
    assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === created.userId), false);

    const withoutSeeking = callTool(ctx, getMember(ctx, created.userId)!, "update_my_profile", {
      age: 32,
      city: "San Francisco",
      gender: "Woman",
      occupation: "Compiler",
      ageMin: 28,
      ageMax: 40,
      cities: ["San Francisco", "Bastrop"],
      smoking: "any",
      kids: "any",
      intent: "serious",
      locked: true,
    });
    assert.equal(withoutSeeking?.status, 200);
    assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === created.userId), false);
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), false);

    const rejected = callTool(ctx, getMember(ctx, created.userId)!, "update_my_profile", { seeking: "everyone" });
    assert.equal(rejected?.status, 400);

    const filled = callTool(ctx, getMember(ctx, created.userId)!, "update_my_profile", { seeking: "Women" });
    assert.equal(filled?.status, 200);
    const body = filled?.body as { member: { profile: { gender: string; city: string; age: number }; preferences: { seeking: string } } };
    assert.equal(body.member.profile.gender, "woman");
    assert.equal(body.member.profile.city, "San Francisco");
    assert.equal(body.member.profile.age, 32);
    assert.equal(body.member.preferences.seeking, "women");

    const visible = callTool(ctx, viewer, "browse_members", { city: "San Francisco" });
    assert.equal((visible?.body as { members: { id: string }[] }).members.some((member) => member.id === created.userId), true);
    const found = callTool(ctx, viewer, "get_member", { memberId: created.userId });
    assert.equal(found?.status, 200);
    assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === created.userId), true);
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), true);
  } finally {
    ctx.close();
  }
});

test("the placeholder backfill nulls only the exact signup defaults", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const now = new Date().toISOString();
    ctx.sqlite.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE profiles;
      DROP TABLE prefs;
      CREATE TABLE profiles (
        user_id TEXT PRIMARY KEY,
        age INTEGER NOT NULL,
        city TEXT NOT NULL,
        occupation TEXT NOT NULL,
        bio TEXT NOT NULL,
        pronouns TEXT NOT NULL,
        smoking INTEGER NOT NULL,
        kids TEXT NOT NULL,
        intent TEXT NOT NULL,
        interests TEXT NOT NULL,
        accent TEXT NOT NULL,
        voice TEXT NOT NULL
      );
      CREATE TABLE prefs (
        user_id TEXT PRIMARY KEY,
        age_min INTEGER NOT NULL,
        age_max INTEGER NOT NULL,
        cities TEXT NOT NULL,
        smoking TEXT NOT NULL,
        kids TEXT NOT NULL,
        intent TEXT NOT NULL,
        nice_to_haves TEXT NOT NULL,
        locked INTEGER NOT NULL DEFAULT 0
      );
      PRAGMA foreign_keys = ON;
    `);
    ctx.db.insert(users).values({
      id: "x_2",
      email: "x_2@x.botdate",
      displayName: "Member Two",
      botPaused: false,
      createdAt: now,
      xUserId: "2",
      xHandle: "member2",
      xAvatarUrl: "",
      founder: false,
      memberNumber: 2,
      connectSeen: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      referralCode: "ref2",
      referredBy: null,
    }).run();
    ctx.db.insert(users).values({
      id: "x_real",
      email: "x_real@x.botdate",
      displayName: "Priya",
      botPaused: false,
      createdAt: now,
      xUserId: "9",
      xHandle: "priya",
      xAvatarUrl: "",
      founder: false,
      memberNumber: 9,
      connectSeen: true,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      referralCode: "ref9",
      referredBy: null,
    }).run();
    ctx.sqlite.exec(`
      INSERT INTO profiles (user_id, age, city, occupation, bio, pronouns, smoking, kids, intent, interests, accent, voice)
      VALUES
        ('x_2', 30, 'San Francisco', 'New here', 'Signed in with X.', 'they/them', 0, 'open', 'serious', '[]', '#ff2d92', '{"subject":"they","object":"them","possessive":"their"}'),
        ('x_real', 30, 'Oakland', 'Book editor', 'Edits essays.', 'she/her', 0, 'open', 'serious', '[]', '#ff47a8', '{"subject":"she","object":"her","possessive":"her"}');
      INSERT INTO prefs (user_id, age_min, age_max, cities, smoking, kids, intent, nice_to_haves, locked)
      VALUES
        ('x_2', 25, 45, '["San Francisco"]', 'no', 'any', 'any', '', 0),
        ('x_real', 28, 38, '["Oakland"]', 'no', 'any', 'serious', 'Curious', 0);
    `);
    applyProfileMigration(ctx.sqlite);
    const placeholder = ctx.db.select().from(profiles).all().find((row) => row.userId === "x_2");
    const real = ctx.db.select().from(profiles).all().find((row) => row.userId === "x_real");
    assert.equal(placeholder?.age, null);
    assert.equal(placeholder?.city, null);
    assert.equal(placeholder?.gender, null);
    assert.equal(placeholder?.occupation, "");
    assert.equal(placeholder?.bio, "");
    assert.equal(real?.age, 30);
    assert.equal(real?.city, "Oakland");
    assert.equal(real?.gender, "woman");
    assert.equal(real?.occupation, "Book editor");
    const placeholderPrefs = ctx.db.select().from(prefs).all().find((row) => row.userId === "x_2");
    const realPrefs = ctx.db.select().from(prefs).all().find((row) => row.userId === "x_real");
    assert.equal(placeholderPrefs?.ageMin, null);
    assert.equal(placeholderPrefs?.ageMax, null);
    assert.equal(placeholderPrefs?.cities, null);
    assert.equal(placeholderPrefs?.smoking, "any");
    assert.equal(realPrefs?.ageMin, 28);
    assert.equal(realPrefs?.cities, '["Oakland"]');
    assert.equal(realPrefs?.smoking, "no");
    assert.equal(realPrefs?.seeking, null);
    assert.equal(placeholderPrefs?.seeking, null);
    applyProfileMigration(ctx.sqlite);
    assert.equal(ctx.db.select().from(profiles).all().find((row) => row.userId === "x_real")?.age, 30);
  } finally {
    ctx.close();
  }
});

test("profile writes reject ages under 18 or over 99, and a stored minor stays unmatched", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    const created = upsertXMember(ctx, ada);
    const member = getMember(ctx, created.userId);
    assert.ok(member);
    for (const age of [17, 100, 0]) {
      const rejected = callTool(ctx, member, "update_my_profile", { age });
      assert.equal(rejected?.status, 400);
      assert.equal((rejected?.body as { error: string }).error, MEMBER_AGE_ERROR);
      assert.equal(getMember(ctx, created.userId)?.profile.age, null);
    }
    assert.equal(callTool(ctx, getMember(ctx, created.userId)!, "update_my_profile", { age: 18 })?.status, 200);
    assert.equal(getMember(ctx, created.userId)?.profile.age, 18);
    assert.equal(applyBotProfile(ctx, created.userId, { age: 99 }).ok, true);
    assert.equal(applyBotProfile(ctx, created.userId, { age: 17 }).ok, false);
    assert.equal(getMember(ctx, created.userId)?.profile.age, 99);
    const saved = getMember(ctx, created.userId);
    assert.ok(saved);
    assert.equal(saveMember(ctx, created.userId, { ...memberToInput(saved), age: 16 }).ok, false);
    assert.equal(getMember(ctx, created.userId)?.profile.age, 99);

    const token = issueAgentToken(ctx, "avery");
    assert.ok(token);
    const patched = dispatchAgent({
      ctx,
      authorization: `Bearer ${token.token}`,
      method: "PATCH",
      pathname: "/api/agent/v1/preferences",
      body: { age: 15 },
    });
    assert.equal(patched.status, 400);
    assert.equal((patched.body as { error: string }).error, MEMBER_AGE_ERROR);
    assert.equal(getMember(ctx, "avery")?.profile.age, 32);

    ctx.db.update(profiles).set({ age: 17 }).where(eq(profiles.userId, created.userId)).run();
    assert.equal(
      applyBotProfile(ctx, created.userId, {
        city: "Austin",
        gender: "woman",
        occupation: "Engineer",
        ageMin: 28,
        ageMax: 45,
        cities: ["Austin"],
        seeking: "either",
        locked: true,
      }).ok,
      true,
    );
    assert.equal(getMember(ctx, created.userId)?.profile.age, 17);
    const viewer = getMember(ctx, "avery");
    assert.ok(viewer);
    const hidden = callTool(ctx, viewer, "browse_members", {});
    assert.equal((hidden?.body as { members: { id: string }[] }).members.some((row) => row.id === created.userId), false);
    assert.equal(callTool(ctx, viewer, "get_member", { memberId: created.userId })?.status, 404);
    assert.equal(listShortlist(ctx, "avery").cards.some((card) => card.person.id === created.userId), false);
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), false);
  } finally {
    ctx.close();
  }
});

test("a free-text city outside the suggested list can be saved by the bot", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const created = upsertXMember(ctx, ada);
    const result = applyBotProfile(ctx, created.userId, { city: "Lisbon" });
    assert.equal(result.ok, true);
    assert.equal(getMember(ctx, created.userId)?.profile.city, "Lisbon");
  } finally {
    ctx.close();
  }
});
