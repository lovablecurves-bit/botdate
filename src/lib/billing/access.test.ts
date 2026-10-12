import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import { handleMcp } from "../agent/mcp";
import { issueAgentToken } from "../agent/tokens";
import { callTool } from "../agent/tools";
import { openDatabase } from "../db/open";
import { users } from "../db/schema";
import { listDirectory } from "../directory";
import { getMember } from "../domain";
import { upsertXMember } from "../x/account";
import { isFoundingMember } from "../founding";
import { checkoutAllowed, isFounderAccount, needsPaywall, subscriptionBlocks } from "./access";
import { applyStripeEvent, setSubscription, verifyStripeSignature } from "./stripe";

const previousFounders = process.env.FOUNDER_X_IDS;

function person(xUserId: string, handle: string, name: string) {
  return {
    xUserId,
    handle,
    name,
    bio: `${name} likes long walks.`,
    avatarUrl: `https://pbs.twimg.com/profile_images/a/${handle}_400x400.jpg`,
  };
}

test("founder is the X id in FOUNDER_X_IDS, then the founder flag, and never hits checkout or a paywall", async () => {
  process.env.FOUNDER_X_IDS = "999, 1000";
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const first = upsertXMember(ctx, person("111", "ada", "Ada"));
    const lisa = upsertXMember(ctx, person("999", "lisa", "Lisa"));
    const later = upsertXMember(ctx, person("300", "grace", "Grace"));
    assert.equal(getMember(ctx, first.userId)?.founder, true);
    assert.equal(getMember(ctx, lisa.userId)?.founder, true);
    assert.equal(isFounderAccount(getMember(ctx, lisa.userId)!), true);
    assert.equal(checkoutAllowed(getMember(ctx, lisa.userId)!), false);
    assert.equal(needsPaywall(getMember(ctx, lisa.userId)!), false);

    ctx.db.update(users).set({ founder: false }).where(eq(users.id, lisa.userId)).run();
    const cleared = getMember(ctx, lisa.userId)!;
    assert.equal(cleared.founder, false);
    assert.equal(isFounderAccount(cleared), true);
    setSubscription(ctx, lisa.userId, { status: "canceled", customerId: "cus_lisa" });
    assert.equal(subscriptionBlocks(getMember(ctx, lisa.userId)!), false);
    assert.equal(needsPaywall(getMember(ctx, lisa.userId)!), false);

    assert.equal(isFounderAccount(getMember(ctx, first.userId)!), true);
    assert.equal(isFoundingMember(getMember(ctx, later.userId)!), true);
    assert.equal(checkoutAllowed(getMember(ctx, later.userId)!), false);
    ctx.db.update(users).set({ memberNumber: 1001 }).where(eq(users.id, later.userId)).run();
    assert.equal(isFoundingMember(getMember(ctx, later.userId)!), false);
    assert.equal(checkoutAllowed(getMember(ctx, later.userId)!), true);
  } finally {
    ctx.close();
    if (previousFounders === undefined) delete process.env.FOUNDER_X_IDS;
    else process.env.FOUNDER_X_IDS = previousFounders;
  }
});

test("canceled, past_due, and unpaid hide a member and return 402 until they resubscribe", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    const avery = issueAgentToken(ctx, "avery");
    const jordan = issueAgentToken(ctx, "jordan");
    assert.ok(avery && jordan);

    for (const status of ["canceled", "past_due", "unpaid"] as const) {
      setSubscription(ctx, "jordan", { status, customerId: "cus_jordan", subscriptionId: "sub_jordan" });
      const blocked = handleMcp({
        ctx,
        authorization: `Bearer ${jordan.token}`,
        message: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
      });
      assert.equal(blocked.status, 402, status);
      assert.match(JSON.stringify(blocked.body), /subscription inactive/);
      const hidden = callTool(ctx, getMember(ctx, "avery")!, "browse_members", { query: "Jordan" });
      assert.ok(hidden);
      const members = (hidden.body as { members: { displayName: string }[] }).members;
      assert.equal(members.some((member) => member.displayName.startsWith("Jordan")), false, status);
      const message = callTool(ctx, getMember(ctx, "avery")!, "send_bot_message", { memberId: "jordan", body: "Saturday still works." });
      assert.ok(message);
      assert.equal(message.status, 400, status);
      assert.match(JSON.stringify(message.body), /isn't available/);
    }

    setSubscription(ctx, "jordan", { status: "active", customerId: "cus_jordan", subscriptionId: "sub_jordan" });
    const live = handleMcp({
      ctx,
      authorization: `Bearer ${jordan.token}`,
      message: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    assert.equal(live.status, 200);
    const visible = callTool(ctx, getMember(ctx, "avery")!, "browse_members", { query: "Jordan" });
    assert.ok(visible);
    assert.equal((visible.body as { members: { id: string }[] }).members.some((member) => member.id === "jordan"), true);
    const sent = callTool(ctx, getMember(ctx, "avery")!, "send_bot_message", { memberId: "jordan", body: "Saturday still works." });
    assert.ok(sent);
    assert.equal(sent.status, 201);

    ctx.db.update(users).set({ founder: true, stripeSubscriptionStatus: "unpaid" }).where(eq(users.id, "avery")).run();
    const founderCall = handleMcp({
      ctx,
      authorization: `Bearer ${avery.token}`,
      message: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    assert.equal(founderCall.status, 200);
    assert.equal(needsPaywall(getMember(ctx, "avery")!), false);
  } finally {
    ctx.close();
  }
});

test("stripe webhooks store status and a resubscribe reactivates", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    upsertXMember(ctx, person("42", "ada", "Ada"));
    const created = upsertXMember(ctx, person("77", "grace", "Grace"));
    assert.equal(getMember(ctx, created.userId)?.founder, false);
    ctx.db.update(users).set({ memberNumber: 1001 }).where(eq(users.id, created.userId)).run();
    assert.equal(isFoundingMember(getMember(ctx, created.userId)!), false);
    assert.equal(
      applyStripeEvent(ctx, {
        type: "checkout.session.completed",
        data: { object: { client_reference_id: created.userId, customer: "cus_grace", subscription: "sub_grace" } },
      }).updated,
      true,
    );
    assert.equal(getMember(ctx, created.userId)?.subscriptionStatus, "trialing");
    assert.equal(getMember(ctx, created.userId)?.stripeCustomerId, "cus_grace");

    for (const status of ["active", "past_due", "unpaid", "canceled"] as const) {
      assert.equal(
        applyStripeEvent(ctx, {
          type: "customer.subscription.updated",
          data: { object: { id: "sub_grace", customer: "cus_grace", status, metadata: { userId: created.userId } } },
        }).updated,
        true,
      );
      assert.equal(getMember(ctx, created.userId)?.subscriptionStatus, status);
    }
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), false);

    applyStripeEvent(ctx, {
      type: "customer.subscription.updated",
      data: { object: { id: "sub_grace", customer: "cus_grace", status: "active", metadata: { userId: created.userId } } },
    });
    assert.equal(getMember(ctx, created.userId)?.subscriptionStatus, "active");
    assert.equal(subscriptionBlocks(getMember(ctx, created.userId)!), false);
    assert.equal(listDirectory(ctx).some((card) => card.id === created.userId), true);

    applyStripeEvent(ctx, {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_grace", customer: "cus_grace", status: "canceled", metadata: { userId: created.userId } } },
    });
    assert.equal(getMember(ctx, created.userId)?.subscriptionStatus, "canceled");
  } finally {
    ctx.close();
  }
});

test("stripe signatures reject a stale or altered payload", () => {
  const payload = JSON.stringify({ type: "customer.subscription.updated" });
  const secret = "whsec_test";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret), true);
  assert.equal(verifyStripeSignature(`${payload} `, `t=${timestamp},v1=${signature}`, secret), false);
  assert.equal(verifyStripeSignature(payload, `t=${timestamp - 1000},v1=${signature}`, secret), false);
  assert.equal(verifyStripeSignature(payload, null, secret), false);
});
