import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { openDatabase } from "../db/open";
import { getMember } from "../domain";
import type { Member } from "../types";
import { upsertXMember } from "../x/account";
import { FOUNDING_PITCH, foundingSpotCopy, foundingSpotsLeft, isFoundingMember } from "../founding";
import { isComplimentary, MEMBERSHIP_LABEL, needsPaywall, foundingPitch } from "./access";
import { billingPortalParams, checkoutSessionParams } from "./checkout";
import { trialDays, type StripeEnv } from "./config";
import { applyMembership, membershipWriteFromEvent } from "./membership";
import { verifyWebhook } from "./webhook";

const BILLING: StripeEnv = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_420",
};

function member(overrides: Partial<Member> = {}): Member {
  return {
    id: "x_2",
    email: "x_2@x.botdate",
    displayName: "Ada",
    botPaused: false,
    profile: {
      age: null,
      city: null,
      occupation: "",
      bio: "Hi",
      gender: null,
      smoking: false,
      kids: "open",
      intent: "serious",
      interests: [],
      accent: "#ff2d92",
      voice: { subject: "they", object: "them", possessive: "their" },
    },
    prefs: {
      ageMin: null,
      ageMax: null,
      cities: null,
      smoking: "any",
      kids: "any",
      intent: "any",
      niceToHaves: "",
      locked: true,
    },
    xAccount: { userId: "2", handle: "ada", avatarUrl: "" },
    founder: false,
    memberNumber: 1001,
    connectSeen: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    ...overrides,
  };
}

test("checkout is skipped without Stripe, for demo members, founding members, complimentary handles, and an active subscription", () => {
  assert.equal(MEMBERSHIP_LABEL, "Join BotDate, $4.20/mo");
  assert.equal(foundingPitch(), FOUNDING_PITCH);
  assert.equal(FOUNDING_PITCH, "Free for the first 1,000 members");
  assert.equal(foundingSpotCopy(1000), "Free founding spot: 1,000 of 1,000 left");
  assert.equal(foundingSpotCopy(963), "Free founding spot: 963 of 1,000 left");
  assert.equal(foundingSpotCopy(0), "Free founding spot: 0 of 1,000 left");
  assert.equal(foundingSpotsLeft(0), 1000);
  assert.equal(foundingSpotsLeft(37), 963);
  assert.equal(foundingSpotsLeft(1000), 0);
  assert.equal(foundingSpotsLeft(1001), 0);
  assert.throws(() => foundingSpotsLeft(-1));
  assert.throws(() => foundingSpotCopy(-1));
  assert.equal(isFoundingMember({ memberNumber: 1 }), true);
  assert.equal(isFoundingMember({ memberNumber: 1000 }), true);
  assert.equal(isFoundingMember({ memberNumber: 1001 }), false);
  assert.equal(isFoundingMember({ memberNumber: null }), false);
  assert.equal(trialDays({}), 3);
  assert.equal(trialDays({ STRIPE_TRIAL_DAYS: "3" }), 3);
  assert.equal(trialDays({ STRIPE_TRIAL_DAYS: " 14 " }), 14);
  assert.equal(trialDays({ STRIPE_TRIAL_DAYS: "0" }), 3);
  assert.equal(trialDays({ STRIPE_TRIAL_DAYS: "nope" }), 3);
  assert.equal(needsPaywall(member(), {}), false);
  assert.equal(needsPaywall(member(), { STRIPE_SECRET_KEY: " sk ", STRIPE_WEBHOOK_SECRET: "", STRIPE_PRICE_ID: "price_420" }), false);
  assert.equal(needsPaywall(member({ xAccount: null }), BILLING), false);
  assert.equal(needsPaywall(member(), BILLING), true);
  assert.equal(needsPaywall(member({ founder: true, memberNumber: 8 }), BILLING), false);
  assert.equal(needsPaywall(member({ founder: false, memberNumber: 1 }), BILLING), false);
  assert.equal(needsPaywall(member({ founder: false, memberNumber: 1000 }), BILLING), false);
  assert.equal(needsPaywall(member({ founder: false, memberNumber: 2, subscriptionStatus: "canceled" }), BILLING), false);
  assert.equal(isComplimentary(member({ founder: false, memberNumber: 1 })), true);
  assert.equal(isComplimentary(member({ founder: false, memberNumber: 1000 })), true);
  assert.equal(isComplimentary(member({ founder: false, memberNumber: 1001 })), false);
  assert.equal(
    needsPaywall(member({ xAccount: { userId: "9", handle: "@LovableCurves", avatarUrl: "" } }), BILLING),
    false,
  );
  assert.equal(
    needsPaywall(
      member({ xAccount: { userId: "9", handle: "Ada_Bot", avatarUrl: "" } }),
      { ...BILLING, FREE_X_HANDLES: " @Ada_Bot , other " },
    ),
    false,
  );
  assert.equal(needsPaywall(member(), { ...BILLING, FREE_X_HANDLES: " , ," }), true);
  assert.equal(needsPaywall(member({ subscriptionStatus: "active" }), BILLING), false);
  assert.equal(needsPaywall(member({ subscriptionStatus: "trialing" }), BILLING), false);
  assert.equal(needsPaywall(member({ subscriptionStatus: "Active" }), BILLING), false);
  assert.equal(needsPaywall(member({ subscriptionStatus: "past_due" }), BILLING), true);
  assert.equal(needsPaywall(member({ subscriptionStatus: "canceled" }), BILLING), true);
});

test("checkout is a subscription tied to the member, and the portal returns to the app", () => {
  const params = checkoutSessionParams({
    memberId: "x_2",
    priceId: "price_420",
    customerId: null,
    origin: "https://botdate.vercel.app/",
    trialPeriodDays: 3,
  });
  assert.equal(params.mode, "subscription");
  assert.equal(params.client_reference_id, "x_2");
  assert.deepEqual(params.metadata, { memberId: "x_2" });
  assert.deepEqual(params.subscription_data?.metadata, { memberId: "x_2" });
  assert.equal(params.subscription_data?.trial_period_days, 3);
  assert.deepEqual(params.line_items, [{ price: "price_420", quantity: 1 }]);
  assert.equal(params.success_url, "https://botdate.vercel.app/join?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(params.cancel_url, "https://botdate.vercel.app/join?checkout=cancel");
  assert.equal(params.customer, undefined);

  const returning = checkoutSessionParams({
    memberId: "x_2",
    priceId: "price_420",
    customerId: "cus_9",
    origin: "https://botdate.vercel.app",
    trialPeriodDays: trialDays({ STRIPE_TRIAL_DAYS: "14" }),
  });
  assert.equal(returning.customer, "cus_9");
  assert.equal(returning.subscription_data?.trial_period_days, 14);
  assert.deepEqual(billingPortalParams("cus_9", "https://botdate.vercel.app/onboarding"), {
    customer: "cus_9",
    return_url: "https://botdate.vercel.app/onboarding",
  });
});

test("registered Stripe events map onto a membership write", () => {
  const checkout = membershipWriteFromEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "x_2",
        metadata: { memberId: "other" },
        customer: "cus_1",
        subscription: "sub_1",
        payment_status: "paid",
        status: "complete",
      },
    },
  });
  assert.deepEqual(checkout, {
    memberId: "x_2",
    customerId: "cus_1",
    subscriptionId: "sub_1",
    status: "active",
  });

  const fromMetadata = membershipWriteFromEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "",
        metadata: { memberId: "x_2" },
        customer: { id: "cus_1" },
        subscription: { id: "sub_1", status: "trialing" },
        status: "complete",
      },
    },
  });
  assert.equal(fromMetadata?.memberId, "x_2");
  assert.equal(fromMetadata?.customerId, "cus_1");
  assert.equal(fromMetadata?.status, "trialing");

  const trialCheckout = membershipWriteFromEvent({
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "x_2",
        customer: "cus_1",
        subscription: "sub_trial",
        payment_status: "no_payment_required",
        status: "complete",
      },
    },
  });
  assert.equal(trialCheckout?.status, "trialing");
  assert.equal(needsPaywall(member({ subscriptionStatus: trialCheckout?.status }), BILLING), false);

  const updated = membershipWriteFromEvent({
    type: "customer.subscription.updated",
    data: { object: { id: "sub_1", customer: "cus_1", status: "past_due", metadata: { memberId: "x_2" } } },
  });
  assert.equal(updated?.status, "past_due");

  const deleted = membershipWriteFromEvent({
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_1", customer: "cus_1", status: "active", metadata: {} } },
  });
  assert.equal(deleted?.status, "canceled");
  assert.equal(membershipWriteFromEvent({ type: "invoice.paid", data: { object: {} } }), null);
});

test("a signed webhook stores the customer and subscription, and an older cancellation does not clear a newer one", async () => {
  const ctx = await openDatabase(":memory:");
  const founder = upsertXMember(ctx, { xUserId: "1", handle: "lovablecurves", name: "Lisa", bio: "", avatarUrl: "" });
  const second = upsertXMember(ctx, { xUserId: "2", handle: "ada", name: "Ada", bio: "", avatarUrl: "" });
  assert.equal(getMember(ctx, founder.userId)?.founder, true);
  assert.equal(getMember(ctx, founder.userId)?.memberNumber, 1);
  assert.equal(needsPaywall(getMember(ctx, founder.userId)!, BILLING), false);
  assert.equal(needsPaywall(getMember(ctx, second.userId)!, BILLING), false);
  const { users } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  ctx.db.update(users).set({ memberNumber: 1001 }).where(eq(users.id, second.userId)).run();
  assert.equal(needsPaywall(getMember(ctx, second.userId)!, BILLING), true);

  const secret = "whsec_test_secret";
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test",
        object: "checkout.session",
        client_reference_id: second.userId,
        customer: "cus_ada",
        subscription: "sub_new",
        payment_status: "paid",
        status: "complete",
        metadata: { memberId: second.userId },
        mode: "subscription",
      },
    },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const event = verifyWebhook(payload, header, secret);
  assert.throws(() => verifyWebhook(payload, header, "whsec_other"));
  assert.throws(() => verifyWebhook(`${payload} `, header, secret));

  const write = membershipWriteFromEvent(event);
  assert.ok(write);
  assert.equal(applyMembership(ctx, write).updated, true);
  const paid = getMember(ctx, second.userId);
  assert.equal(paid?.stripeCustomerId, "cus_ada");
  assert.equal(paid?.stripeSubscriptionId, "sub_new");
  assert.equal(paid?.subscriptionStatus, "active");
  assert.equal(needsPaywall(paid!, BILLING), false);

  assert.equal(
    applyMembership(ctx, {
      memberId: null,
      customerId: "cus_ada",
      subscriptionId: "sub_new",
      status: "past_due",
    }).updated,
    true,
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "past_due");

  assert.equal(
    applyMembership(ctx, {
      memberId: second.userId,
      customerId: "cus_ada",
      subscriptionId: "sub_old",
      status: "canceled",
    }).updated,
    true,
  );
  const kept = getMember(ctx, second.userId);
  assert.equal(kept?.stripeSubscriptionId, "sub_new");
  assert.equal(kept?.subscriptionStatus, "past_due");

  assert.equal(
    applyMembership(ctx, {
      memberId: second.userId,
      customerId: "cus_ada",
      subscriptionId: "sub_new",
      status: "canceled",
    }).updated,
    true,
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "canceled");
  assert.equal(needsPaywall(getMember(ctx, second.userId)!, BILLING), true);
  assert.equal(applyMembership(ctx, { memberId: "missing", customerId: null, subscriptionId: null, status: "active" }).updated, false);
  ctx.close();
});
