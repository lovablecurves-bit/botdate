import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "./db/open";
import { displayAvatarUrl, includeViewer, listDirectory, memberProfile, profileView } from "./directory";
import { applyBotProfile, getMember } from "./domain";
import { markConnectSeen, upsertXMember } from "./x/account";

const ada = {
  xUserId: "100",
  handle: "ada_bot",
  name: "Ada Lovelace",
  bio: "Analytical engines and long walks.",
  avatarUrl: "https://pbs.twimg.com/profile_images/a/ada_400x400.jpg",
};

function fillProfile(ctx: Awaited<ReturnType<typeof openDatabase>>, userId: string, city: string) {
  const result = applyBotProfile(ctx, userId, {
    age: 36,
    city,
    gender: "woman",
    occupation: "Engineer",
    ageMin: 28,
    ageMax: 45,
    cities: [city],
  });
  assert.equal(result.ok, true);
}

const grace = {
  xUserId: "200",
  handle: "grace",
  name: "Grace Hopper",
  bio: "Compiles the evening.",
  avatarUrl: "https://pbs.twimg.com/profile_images/a/grace_400x400.jpg",
};

test("directory lists real members from the database and skips the demo roster", async () => {
  const ctx = await openDatabase(":memory:");
  assert.equal(listDirectory(ctx).length, 0);
  assert.equal(memberProfile(ctx, "avery", "avery"), null);

  const first = upsertXMember(ctx, ada);
  const second = upsertXMember(ctx, grace);
  assert.equal(listDirectory(ctx).length, 0);
  assert.equal(memberProfile(ctx, first.userId, second.userId), null);
  fillProfile(ctx, first.userId, "Austin");
  fillProfile(ctx, second.userId, "Austin");
  const cards = listDirectory(ctx);
  assert.deepEqual(
    cards.map((card) => card.handle),
    ["ada_bot", "grace"],
  );
  assert.equal(cards[0]?.founder, true);
  assert.equal(cards[0]?.memberNumber, 1);
  assert.equal(cards[1]?.founder, false);
  assert.equal(cards[1]?.memberNumber, 2);
  assert.equal(getMember(ctx, "avery")?.founder, false);

  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("profile view must not call X");
  };
  try {
    const profile = memberProfile(ctx, first.userId, second.userId);
    assert.ok(profile);
    assert.equal(profile.handle, "grace");
    assert.equal(profile.bio, "Compiles the evening.");
    assert.match(profile.avatarUrl, /grace_400x400/);
    assert.match(profile.summary, /Grace's matchmaker/);
    assert.match(profile.summary, /Compiles the evening/);
    assert.equal(profile.self, false);
    assert.ok(profile.cues.includes("Same city"));
    assert.ok(profile.cues.some((cue) => cue.includes("seriously")));
    const own = memberProfile(ctx, first.userId, first.userId);
    assert.equal(own?.founder, true);
    assert.equal(own?.memberNumber, 1);
    assert.equal(own?.self, true);
    assert.match(own?.summary ?? "", /Analytical engines/);
    assert.ok(own?.cues.includes("This is your profile."));
  } finally {
    globalThis.fetch = previous;
  }
  assert.equal(calls, 0);

  markConnectSeen(ctx, first.userId);
  upsertXMember(ctx, { ...ada, name: "Ada", bio: "Still analytical." });
  const again = getMember(ctx, first.userId);
  assert.equal(again?.connectSeen, true);
  assert.equal(again?.memberNumber, 1);
  assert.equal(again?.founder, true);
  assert.equal(again?.displayName, "Ada");
  assert.equal(listDirectory(ctx).length, 2);
  ctx.close();
});

test("profile avatars render from the stored URL and never from a script URL", () => {
  assert.equal(
    displayAvatarUrl("https://pbs.twimg.com/profile_images/a/b_400x400.jpg"),
    "https://pbs.twimg.com/profile_images/a/b_400x400.jpg",
  );
  assert.equal(displayAvatarUrl("javascript:alert(1)"), null);
  assert.equal(displayAvatarUrl("http://pbs.twimg.com/a.jpg"), null);
  assert.equal(displayAvatarUrl("/avatars/ada.png"), "/avatars/ada.png");
});

test("the first real sign-in on an empty database is member #1", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  const first = upsertXMember(ctx, ada);
  const member = getMember(ctx, first.userId);
  assert.equal(member?.founder, true);
  assert.equal(member?.memberNumber, 1);
  assert.equal(member?.connectSeen, false);
  assert.equal(member?.profile.age, null);
  assert.equal(member?.profile.city, null);
  assert.equal(member?.profile.gender, null);
  assert.deepEqual(listDirectory(ctx).map((card) => card.id), []);
  fillProfile(ctx, first.userId, "Bastrop");
  assert.deepEqual(listDirectory(ctx).map((card) => card.id), [first.userId]);
  const second = upsertXMember(ctx, grace);
  assert.equal(getMember(ctx, second.userId)?.founder, false);
  assert.equal(getMember(ctx, second.userId)?.memberNumber, 2);
  ctx.close();
});

test("a signed-in member stays in the directory when this instance has no row", async () => {
  const full = await openDatabase(":memory:", { seed: false });
  const created = upsertXMember(full, ada);
  const member = getMember(full, created.userId);
  assert.ok(member);
  const empty = await openDatabase(":memory:", { seed: false });
  assert.equal(listDirectory(empty).length, 0);
  const shown = includeViewer(listDirectory(empty), member);
  assert.equal(shown[0]?.handle, "ada_bot");
  assert.equal(shown[0]?.founder, true);
  const profile = profileView(member, member);
  assert.equal(profile?.bio, ada.bio);
  assert.equal(profile?.self, true);
  assert.match(profile?.avatarUrl ?? "", /ada_400x400/);
  full.close();
  empty.close();
});
