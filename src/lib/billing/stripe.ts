import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { users } from "../db/schema";
import { getMember } from "../domain";
import { trialDays } from "../stripe/config";

export type StripeEvent = {
  type?: string;
  data?: { object?: Record<string, unknown> };
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataUserId(object: Record<string, unknown>): string | null {
  const metadata = object.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  return text(record.userId) || text(record.memberId);
}

export function setSubscription(
  ctx: BotDateDb,
  userId: string,
  input: { status: string; customerId?: string | null; subscriptionId?: string | null },
) {
  ctx.db
    .update(users)
    .set({
      stripeSubscriptionStatus: input.status,
      ...(input.customerId !== undefined ? { stripeCustomerId: input.customerId } : {}),
      ...(input.subscriptionId !== undefined ? { stripeSubscriptionId: input.subscriptionId } : {}),
    })
    .where(eq(users.id, userId))
    .run();
}

function userIdForStripe(ctx: BotDateDb, customer: string | null, subscriptionId: string | null, hinted: string | null): string | null {
  if (hinted && getMember(ctx, hinted)) return hinted;
  const rows = ctx.db.select().from(users).all();
  if (customer) {
    const match = rows.find((row) => row.stripeCustomerId === customer);
    if (match) return match.id;
  }
  if (subscriptionId) {
    const match = rows.find((row) => row.stripeSubscriptionId === subscriptionId);
    if (match) return match.id;
  }
  return null;
}

/** Apply a Stripe webhook event. Resubscribing writes active or trialing and access returns. */
export function applyStripeEvent(ctx: BotDateDb, event: StripeEvent): { updated: boolean } {
  const type = event.type ?? "";
  const object = event.data?.object ?? {};
  if (type === "checkout.session.completed") {
    const userId = text(object.client_reference_id) || metadataUserId(object);
    if (!userId || !getMember(ctx, userId)) return { updated: false };
    const member = getMember(ctx, userId);
    const current = (member?.subscriptionStatus ?? "").toLowerCase();
    const status = current === "active" || current === "trialing" ? current : "trialing";
    setSubscription(ctx, userId, {
      status,
      customerId: text(object.customer),
      subscriptionId: text(object.subscription),
    });
    return { updated: true };
  }
  if (type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    const customer = text(object.customer);
    const subscriptionId = text(object.id);
    const userId = userIdForStripe(ctx, customer, subscriptionId, metadataUserId(object));
    if (!userId) return { updated: false };
    const status = type === "customer.subscription.deleted" ? "canceled" : text(object.status) || "canceled";
    setSubscription(ctx, userId, { status, customerId: customer, subscriptionId });
    return { updated: true };
  }
  return { updated: false };
}

export function verifyStripeSignature(payload: string, header: string | null, secret: string, nowMs = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(nowMs / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((signature) => {
    const actual = Buffer.from(signature);
    return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
  });
}

function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!key) throw new Error("Stripe is not configured.");
  return key;
}

async function stripeForm(path: string, fields: Record<string, string>): Promise<{ url?: string }> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
  const payload = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || "Stripe did not return a URL.");
  }
  return payload;
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string;
  customerId: string | null;
  origin: string;
}): Promise<string> {
  const price = process.env.STRIPE_PRICE_ID?.trim() ?? "";
  if (!price) throw new Error("Stripe is not configured.");
  const trialLength = String(trialDays());
  const fields: Record<string, string> = {
    mode: "subscription",
    success_url: `${input.origin}/onboarding?notice=subscribed`,
    cancel_url: `${input.origin}/subscribe?error=${encodeURIComponent("Checkout canceled.")}`,
    client_reference_id: input.userId,
    "metadata[userId]": input.userId,
    "metadata[memberId]": input.userId,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][userId]": input.userId,
    "subscription_data[metadata][memberId]": input.userId,
  };
  if (input.customerId) fields.customer = input.customerId;
  else {
    fields.customer_email = input.email;
    fields["subscription_data[trial_period_days]"] = trialLength;
  }
  const session = await stripeForm("checkout/sessions", fields);
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createBillingPortalSession(customerId: string, origin: string): Promise<string> {
  const session = await stripeForm("billing_portal/sessions", {
    customer: customerId,
    return_url: `${origin}/onboarding`,
  });
  if (!session.url) throw new Error("Stripe did not return a billing portal URL.");
  return session.url;
}
