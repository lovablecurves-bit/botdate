import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { openDatabase } from "../db/open";
import { getMember } from "../domain";
import { isOpenPath } from "../http/public";
import { upsertXMember } from "../x/account";
import { MEMBERSHIP_BUTTON, MEMBERSHIP_PRICE, hasActiveSubscription, isComplimentary, needsPaywall, normalizeXHandle, parseFreeHandles } from "./access";
import { readStripeConfig } from "./config";
import {
  applyCheckoutSession,
  applyStripeEvent,
  billingPortalParams,
  checkoutSessionParams,
  readVerifiedEvent,
  safeReturnPath,
} from "./stripe";
import type { Member } from "../types";

const CONFIG = {
  secretKey: "sk_test_123",
  webhookSecret: "whsec_test_secret",
  priceId: "price_420",
};

const ada = {
  xUserId: "100",
  handle: "ada_bot",
  name: "Ada Lovelace",
  bio: "Analytical.",
  avatarUrl: "https://pbs.twimg.com/profile_images/a/ada_400x400.jpg",
};

const grace = {
  xUserId: "200",
  handle: "grace",
  name: "Grace Hopper",
  bio: "Compiles the evening.",
  avatarUrl: "https://pbs.twimg.com/profile_images/a/grace_400x400.jpg",
};

function payingMember(overrides: Partial<Member> = {}): Member {
  const profile = {
    age: 30,
    city: "San Francisco",
    occupation: "New here",
    bio: "Signed in with X.",
    pronouns: "they/them",
    smoking: false,
    kids: "open" as const,
    intent: "serious" as const,
    interests: [] as string[],
    accent: "#ff2d92",
    voice: { subject: "they" as const, object: "them" as const, possessive: "their" as const },
  };
  return {
    id: "x_200",
    email: "x_200@x.botdate",
    displayName: "Grace Hopper",
    botPaused: false,
    profile,
    prefs: {
      ageMin: 25,
      ageMax: 45,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "any",
      intent: "any",
      niceToHaves: "",
      locked: true,
    },
    xAccount: { userId: "200", handle: "grace", avatarUrl: "" },
    founder: false,
    memberNumber: 2,
    connectSeen: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    ...overrides,
  };
}

const closed = { config: CONFIG, freeHandles: "" };

test("Stripe billing stays off unless the secret, webhook secret, and price are all set", () => {
  assert.equal(readStripeConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(readStripeConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_PRICE_ID: "price" } as NodeJS.ProcessEnv), null);
  assert.equal(readStripeConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "whsec" } as NodeJS.ProcessEnv), null);
  assert.equal(readStripeConfig({ STRIPE_WEBHOOK_SECRET: "whsec", STRIPE_PRICE_ID: "price" } as NodeJS.ProcessEnv), null);
  assert.equal(
    readStripeConfig({ STRIPE_SECRET_KEY: "  ", STRIPE_WEBHOOK_SECRET: "whsec", STRIPE_PRICE_ID: "price" } as NodeJS.ProcessEnv),
    null,
  );
  assert.deepEqual(
    readStripeConfig({ STRIPE_SECRET_KEY: " sk ", STRIPE_WEBHOOK_SECRET: " whsec ", STRIPE_PRICE_ID: " price " } as NodeJS.ProcessEnv),
    { secretKey: "sk", webhookSecret: "whsec", priceId: "price" },
  );
});

test("the paywall is the Join BotDate price, and missing Stripe config skips it", () => {
  assert.equal(MEMBERSHIP_BUTTON, "Join BotDate, $4.20/mo");
  assert.equal(MEMBERSHIP_PRICE, "$4.20/mo");
  const member = payingMember();
  assert.equal(needsPaywall(member, { config: readStripeConfig({} as NodeJS.ProcessEnv), freeHandles: "" }), false);
  assert.equal(needsPaywall(member, { config: null, freeHandles: "" }), false);
  assert.equal(needsPaywall(member, closed), true);
  assert.equal(needsPaywall(payingMember({ xAccount: null }), closed), false);
  assert.equal(needsPaywall(payingMember({ subscriptionStatus: "active" }), closed), false);
  assert.equal(needsPaywall(payingMember({ subscriptionStatus: "trialing" }), closed), false);
  assert.equal(needsPaywall(payingMember({ subscriptionStatus: "past_due" }), closed), true);
  assert.equal(needsPaywall(payingMember({ subscriptionStatus: "canceled" }), closed), true);
  assert.equal(hasActiveSubscription("active"), true);
  assert.equal(hasActiveSubscription(null), false);
});

test("the founder, member #1, @lovablecurves, and FREE_X_HANDLES skip the paywall", () => {
  assert.equal(normalizeXHandle("  @LovableCurves "), "lovablecurves");
  assert.deepEqual(parseFreeHandles(" @Ada , ,grace ,"), ["ada", "grace"]);
  assert.deepEqual(parseFreeHandles(" , , "), []);
  assert.equal(needsPaywall(payingMember({ founder: true }), closed), false);
  assert.equal(needsPaywall(payingMember({ founder: false, memberNumber: 1 }), closed), false);
  assert.equal(needsPaywall(payingMember({ xAccount: { userId: "9", handle: "@LovableCurves", avatarUrl: "" } }), closed), false);
  assert.equal(needsPaywall(payingMember({ xAccount: { userId: "9", handle: "LOVABLECURVES", avatarUrl: "" } }), closed), false);
  assert.equal(isComplimentary(payingMember(), ["grace"]), true);
  assert.equal(needsPaywall(payingMember(), { config: CONFIG, freeHandles: " @Grace , other " }), false);
  assert.equal(needsPaywall(payingMember(), { config: CONFIG, freeHandles: "ada" }), true);
});

test("checkout is a subscription session and the billing portal returns to the app", () => {
  const params = checkoutSessionParams({
    memberId: "x_200",
    priceId: "price_420",
    customerId: null,
    origin: "https://botdate.vercel.app/",
  });
  assert.equal(params.mode, "subscription");
  assert.equal(params.client_reference_id, "x_200");
  assert.equal(params.metadata?.memberId, "x_200");
  assert.equal(params.subscription_data?.metadata?.memberId, "x_200");
  assert.deepEqual(params.line_items, [{ price: "price_420", quantity: 1 }]);
  assert.equal(params.success_url, "https://botdate.vercel.app/join?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(params.cancel_url, "https://botdate.vercel.app/join?checkout=cancel");
  assert.equal(params.customer, undefined);
  assert.equal(
    checkoutSessionParams({ memberId: "x_200", priceId: "price_420", customerId: "cus_9", origin: "https://botdate.vercel.app" }).customer,
    "cus_9",
  );
  assert.deepEqual(billingPortalParams("cus_9", "https://botdate.vercel.app/onboarding"), {
    customer: "cus_9",
    return_url: "https://botdate.vercel.app/onboarding",
  });
  assert.equal(safeReturnPath("/onboarding"), "/onboarding");
  assert.equal(safeReturnPath("/join"), "/join");
  assert.equal(safeReturnPath("https://evil.example"), "/onboarding");
  assert.equal(safeReturnPath("//evil.example"), "/onboarding");
});

test("the Stripe webhook is public and the billing portal is not", () => {
  assert.equal(isOpenPath("/api/stripe/webhook"), true);
  assert.equal(isOpenPath("/api/stripe/webhook/"), true);
  assert.equal(isOpenPath("/api/stripe/portal"), false);
  assert.equal(isOpenPath("/join"), false);
});

test("a signed webhook stores the customer and subscription, and a bad signature is rejected", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  upsertXMember(ctx, ada);
  const second = upsertXMember(ctx, grace);
  const payload = JSON.stringify({
    id: "evt_checkout",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_12345678",
        object: "checkout.session",
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        client_reference_id: second.userId,
        customer: "cus_grace",
        subscription: "sub_new",
        metadata: { memberId: second.userId },
      },
    },
  });
  const stripe = new Stripe(CONFIG.secretKey);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: CONFIG.webhookSecret });
  const event = readVerifiedEvent(payload, signature, CONFIG);
  assert.equal(applyStripeEvent(ctx, event), "updated");
  const joined = getMember(ctx, second.userId);
  assert.equal(joined?.stripeCustomerId, "cus_grace");
  assert.equal(joined?.stripeSubscriptionId, "sub_new");
  assert.equal(joined?.subscriptionStatus, "active");
  assert.equal(needsPaywall(joined!, closed), false);
  assert.throws(() => readVerifiedEvent(payload, "t=1,v1=nope", CONFIG));
  assert.throws(() => readVerifiedEvent(payload, null, CONFIG));

  assert.equal(
    applyStripeEvent(ctx, {
      type: "customer.subscription.updated",
      data: { object: { id: "sub_new", customer: "cus_grace", status: "past_due", metadata: { memberId: second.userId } } },
    }),
    "updated",
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "past_due");
  assert.equal(needsPaywall(getMember(ctx, second.userId)!, closed), true);

  assert.equal(
    applyStripeEvent(ctx, {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_old", customer: { id: "cus_grace" }, status: "canceled", metadata: {} } },
    }),
    "unmatched",
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "past_due");

  assert.equal(
    applyStripeEvent(ctx, {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_new", customer: "cus_grace", status: "canceled" } },
    }),
    "updated",
  );
  const canceled = getMember(ctx, second.userId);
  assert.equal(canceled?.subscriptionStatus, "canceled");
  assert.equal(canceled?.stripeCustomerId, "cus_grace");

  assert.equal(
    applyCheckoutSession(ctx, {
      mode: "subscription",
      status: "complete",
      payment_status: "paid",
      client_reference_id: null,
      customer: { id: "cus_grace" },
      subscription: { id: "sub_newer" },
      metadata: { memberId: second.userId },
    }),
    true,
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "active");
  assert.equal(getMember(ctx, second.userId)?.stripeSubscriptionId, "sub_newer");

  assert.equal(
    applyStripeEvent(ctx, {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_new", customer: "cus_grace", status: "canceled", metadata: { memberId: second.userId } } },
    }),
    "unmatched",
  );
  assert.equal(getMember(ctx, second.userId)?.subscriptionStatus, "active");

  assert.equal(applyStripeEvent(ctx, { type: "invoice.paid", data: { object: { id: "in_1" } } }), "ignored");
  assert.equal(
    applyCheckoutSession(ctx, {
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      client_reference_id: second.userId,
      customer: "cus_other",
      metadata: { memberId: second.userId },
    }),
    false,
  );
  assert.equal(getMember(ctx, second.userId)?.stripeCustomerId, "cus_grace");
  assert.equal(
    applyCheckoutSession(
      ctx,
      {
        mode: "subscription",
        status: "complete",
        payment_status: "paid",
        client_reference_id: "x_100",
        customer: "cus_ada",
        subscription: "sub_ada",
        metadata: { memberId: "x_100" },
      },
      second.userId,
    ),
    false,
  );
  assert.equal(getMember(ctx, "x_100")?.stripeCustomerId, null);
  ctx.close();
});
