import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { handleMcp } from "./agent/mcp";
import { issueAgentToken } from "./agent/tokens";
import { callTool } from "./agent/tools";
import { openDatabase } from "./db/open";
import { users } from "./db/schema";
import { listDirectory } from "./directory";
import { applyBotProfile, getMember } from "./domain";
import { FOUNDING_MEMBER_LIMIT, FOUNDING_PITCH, foundingSpotCopy, foundingSpotsLeft, isFoundingMember } from "./founding";
import { subscriptionBlocks } from "./billing/access";
import { setSubscription } from "./billing/stripe";
import { countRealMembers, ensureRealMemberNumbers, upsertXMember } from "./x/account";

const previousBilling = {
  key: process.env.STRIPE_SECRET_KEY,
  price: process.env.STRIPE_PRICE_ID,
};

function restoreBilling() {
  if (previousBilling.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previousBilling.key;
  if (previousBilling.price === undefined) delete process.env.STRIPE_PRICE_ID;
  else process.env.STRIPE_PRICE_ID = previousBilling.price;
}

test("founding spots come from the real X member count and ignore the demo roster", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    assert.equal(countRealMembers(ctx), 0);
    assert.equal(foundingSpotsLeft(countRealMembers(ctx)), FOUNDING_MEMBER_LIMIT);
    assert.equal(foundingSpotCopy(foundingSpotsLeft(0)), "Free founding spot: 1,000 of 1,000 left");
    upsertXMember(ctx, { xUserId: "10", handle: "ada", name: "Ada", bio: "", avatarUrl: "" });
    upsertXMember(ctx, { xUserId: "11", handle: "grace", name: "Grace", bio: "", avatarUrl: "" });
    assert.equal(countRealMembers(ctx), 2);
    assert.equal(foundingSpotsLeft(countRealMembers(ctx)), 998);
    assert.equal(foundingSpotCopy(998), "Free founding spot: 998 of 1,000 left");
  } finally {
    ctx.close();
  }
});

test("members 1 through 1,000 stay founding forever and member 1,001 needs a subscription", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_PRICE_ID = "price_420";
  try {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let n = 1; n <= FOUNDING_MEMBER_LIMIT + 1; n += 1) {
      const id = `x_${n}`;
      ctx.db
        .insert(users)
        .values({
          id,
          email: `${id}@x.botdate`,
          displayName: `Member ${n}`,
          botPaused: false,
          createdAt: new Date(start + n).toISOString(),
          xUserId: String(n),
          xHandle: `m${n}`,
          xAvatarUrl: "",
          founder: false,
          memberNumber: null,
          connectSeen: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: null,
          referralCode: `ref${n}`,
          referredBy: null,
        })
        .run();
    }
    ensureRealMemberNumbers(ctx);
    ensureRealMemberNumbers(ctx);
    const numbered = ctx.db.select().from(users).all();
    const byNumber = new Map(numbered.map((row) => [Number(row.memberNumber), row]));
    assert.equal(byNumber.get(1)?.founder, true);
    assert.equal(byNumber.get(1)?.xUserId, "1");
    assert.equal(byNumber.get(FOUNDING_MEMBER_LIMIT)?.founder, false);
    assert.equal(byNumber.get(FOUNDING_MEMBER_LIMIT + 1)?.xUserId, String(FOUNDING_MEMBER_LIMIT + 1));
    assert.equal(countRealMembers(ctx), FOUNDING_MEMBER_LIMIT + 1);
    assert.equal(foundingSpotsLeft(countRealMembers(ctx)), 0);
    assert.equal(foundingSpotCopy(0), "Free founding spot: 0 of 1,000 left");

    assert.equal(isFoundingMember({ memberNumber: Number(byNumber.get(FOUNDING_MEMBER_LIMIT)?.memberNumber) }), true);
    assert.equal(isFoundingMember({ memberNumber: Number(byNumber.get(FOUNDING_MEMBER_LIMIT + 1)?.memberNumber) }), false);
  } finally {
    restoreBilling();
    ctx.close();
  }
});

test("a founding member keeps matching and MCP after a canceled subscription; member 1001 does not", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_PRICE_ID = "price_420";
  try {
    const first = upsertXMember(ctx, { xUserId: "10", handle: "ada", name: "Ada", bio: "First.", avatarUrl: "" });
    const second = upsertXMember(ctx, { xUserId: "11", handle: "grace", name: "Grace", bio: "Later.", avatarUrl: "" });
    ctx.db.update(users).set({ memberNumber: 1001, founder: false }).where(eq(users.id, second.userId)).run();
    assert.equal(applyBotProfile(ctx, first.userId, { age: 36, city: "Austin", gender: "woman", occupation: "Engineer", ageMin: 28, ageMax: 45, cities: ["Austin"] }).ok, true);
    assert.equal(applyBotProfile(ctx, second.userId, { age: 36, city: "Austin", gender: "woman", occupation: "Engineer", ageMin: 28, ageMax: 45, cities: ["Austin"] }).ok, true);
    const freeMember = getMember(ctx, first.userId)!;
    const paidMember = getMember(ctx, second.userId)!;
    assert.equal(isFoundingMember(freeMember), true);
    assert.equal(isFoundingMember(paidMember), false);
    setSubscription(ctx, freeMember.id, { status: "canceled", customerId: "cus_free" });
    assert.equal(subscriptionBlocks(getMember(ctx, freeMember.id)!), false);
    assert.equal(listDirectory(ctx).some((card) => card.id === freeMember.id), true);
    assert.equal(subscriptionBlocks(getMember(ctx, paidMember.id)!), true);
    assert.equal(listDirectory(ctx).some((card) => card.id === paidMember.id), false);

    const token = issueAgentToken(ctx, paidMember.id);
    assert.ok(token);
    const blocked = handleMcp({
      ctx,
      authorization: `Bearer ${token.token}`,
      message: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    assert.equal(blocked.status, 402);
    const hidden = callTool(ctx, freeMember, "browse_members", {});
    assert.ok(hidden);
    const listed = (hidden.body as { members: { id: string }[] }).members;
    assert.equal(listed.some((member) => member.id === paidMember.id), false);

    setSubscription(ctx, paidMember.id, { status: "active", customerId: "cus_paid", subscriptionId: "sub_paid" });
    assert.equal(subscriptionBlocks(getMember(ctx, paidMember.id)!), false);
    const live = handleMcp({
      ctx,
      authorization: `Bearer ${token.token}`,
      message: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    assert.equal(live.status, 200);
    assert.equal(getMember(ctx, freeMember.id)?.memberNumber, 1);
  } finally {
    restoreBilling();
    ctx.close();
  }
});

test("founding access follows member number and does not read the founder flag", () => {
  assert.equal(isFoundingMember({ memberNumber: 1 }), true);
  assert.equal(isFoundingMember({ memberNumber: 2 }), true);
  assert.equal(isFoundingMember({ memberNumber: 1000 }), true);
  assert.equal(isFoundingMember({ memberNumber: 1001 }), false);
  assert.equal(isFoundingMember({ memberNumber: null }), false);
  const source = readFileSync("src/lib/founding.ts", "utf8");
  const start = source.indexOf("export function isFoundingMember");
  const end = source.indexOf("export function foundingSpotsLeft");
  const fn = source.slice(start, end);
  assert.equal(fn.includes("founder"), false);
  assert.match(fn, /memberNumber/);
  assert.match(fn, /FOUNDING_MEMBER_LIMIT/);
});

test("sign-in, join, and metadata use the founding pitch instead of the trial line", () => {
  const files = [
    "src/components/sign-in-screen.tsx",
    "src/app/join/page.tsx",
    "src/app/layout.tsx",
    "src/app/login/page.tsx",
    "src/app/(app)/subscribe/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/terms/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("Try BotDate free for"), false, file);
    assert.equal(source.includes("Start free trial"), false, file);
    assert.equal(source.includes("Start a free trial"), false, file);
  }
  const home = readFileSync("src/components/sign-in-screen.tsx", "utf8");
  const join = readFileSync("src/app/join/page.tsx", "utf8");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(home, /FOUNDING_PITCH/);
  assert.match(home, /founding-spots/);
  assert.match(join, /FOUNDING_PITCH/);
  assert.match(join, /founding-spots/);
  assert.match(layout, /openGraph/);
  assert.equal(FOUNDING_PITCH, "Free for the first 1,000 members");
});
