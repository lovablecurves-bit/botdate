import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withDb, type BotDateDb } from "../db/open";
import { users } from "../db/schema";
import type { StripeConfig } from "./config";
import { readStripeConfig } from "./config";

const RETURN_PATHS = new Set(["/join", "/onboarding", "/shortlist", "/connect"]);
const ENTITLED = new Set(["active", "trialing"]);

export type BillingApplyResult = "updated" | "ignored" | "unmatched";

export function stripeClient(config: StripeConfig): Stripe {
  return new Stripe(config.secretKey);
}

export function safeReturnPath(value: string | null | undefined): string {
  if (value && RETURN_PATHS.has(value)) return value;
  return "/onboarding";
}

export function checkoutSessionParams(input: {
  memberId: string;
  priceId: string;
  customerId: string | null;
  origin: string;
}): Stripe.Checkout.SessionCreateParams {
  const origin = input.origin.replace(/\/$/, "");
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: input.priceId, quantity: 1 }],
    client_reference_id: input.memberId,
    metadata: { memberId: input.memberId },
    subscription_data: { metadata: { memberId: input.memberId } },
    success_url: `${origin}/join?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/join?checkout=cancel`,
  };
  if (input.customerId) params.customer = input.customerId;
  return params;
}

export function billingPortalParams(customerId: string, returnUrl: string): Stripe.BillingPortal.SessionCreateParams {
  return { customer: customerId, return_url: returnUrl };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  if (!record) return null;
  return typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
}

function metadataMemberId(metadata: unknown): string | null {
  const record = asRecord(metadata);
  if (!record) return null;
  return typeof record.memberId === "string" && record.memberId.trim() ? record.memberId.trim() : null;
}

function findMemberId(ctx: BotDateDb, memberId: string | null, customerId: string | null): string | null {
  if (memberId) {
    const row = ctx.db.select({ id: users.id }).from(users).where(eq(users.id, memberId)).get();
    if (row) return row.id;
  }
  if (customerId) {
    const row = ctx.db.select({ id: users.id }).from(users).where(eq(users.stripeCustomerId, customerId)).get();
    if (row) return row.id;
  }
  return null;
}

function writeBilling(
  ctx: BotDateDb,
  memberId: string,
  patch: { customerId: string | null; subscriptionId: string | null; status: string | null },
): boolean {
  const existing = ctx.db.select({ id: users.id }).from(users).where(eq(users.id, memberId)).get();
  if (!existing) return false;
  const next: { stripeCustomerId?: string; stripeSubscriptionId?: string; subscriptionStatus?: string } = {};
  if (patch.customerId) next.stripeCustomerId = patch.customerId;
  if (patch.subscriptionId) next.stripeSubscriptionId = patch.subscriptionId;
  if (patch.status) next.subscriptionStatus = patch.status;
  if (Object.keys(next).length === 0) return false;
  ctx.db.update(users).set(next).where(eq(users.id, memberId)).run();
  return true;
}

/** Persist a completed subscription Checkout Session onto the member it names. */
export function applyCheckoutSession(ctx: BotDateDb, session: unknown, expectedMemberId?: string): boolean {
  const object = asRecord(session);
  if (!object) return false;
  if (typeof object.mode === "string" && object.mode !== "subscription") return false;
  if (typeof object.status === "string" && object.status !== "complete") return false;
  const memberId = stringId(object.client_reference_id) ?? metadataMemberId(object.metadata);
  if (!memberId) return false;
  if (expectedMemberId && memberId !== expectedMemberId) return false;
  const payment = object.payment_status;
  const status = payment === "paid" || payment === "no_payment_required" ? "active" : "incomplete";
  return writeBilling(ctx, memberId, {
    customerId: stringId(object.customer),
    subscriptionId: stringId(object.subscription),
    status,
  });
}

function applySubscription(ctx: BotDateDb, type: string, object: Record<string, unknown>): boolean {
  const subscriptionId = stringId(object.id);
  const customerId = stringId(object.customer);
  const hinted = metadataMemberId(object.metadata);
  const memberId = findMemberId(ctx, hinted, customerId);
  if (!memberId) return false;
  const status = type === "customer.subscription.deleted" ? "canceled" : typeof object.status === "string" ? object.status : null;
  if (!status) return false;
  const existing = ctx.db
    .select({ stripeSubscriptionId: users.stripeSubscriptionId })
    .from(users)
    .where(eq(users.id, memberId))
    .get();
  // A late event for an older subscription must not revoke the one on file.
  if (
    existing?.stripeSubscriptionId &&
    subscriptionId &&
    existing.stripeSubscriptionId !== subscriptionId &&
    !ENTITLED.has(status)
  ) {
    return false;
  }
  return writeBilling(ctx, memberId, { customerId, subscriptionId, status });
}

export function applyStripeEvent(ctx: BotDateDb, event: { type: string; data: { object: unknown } }): BillingApplyResult {
  if (event.type === "checkout.session.completed") {
    return applyCheckoutSession(ctx, event.data.object) ? "updated" : "unmatched";
  }
  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const object = asRecord(event.data.object);
    if (!object) return "ignored";
    return applySubscription(ctx, event.type, object) ? "updated" : "unmatched";
  }
  return "ignored";
}

/** Verify the Stripe-Signature header against the raw request body. */
export function readVerifiedEvent(rawBody: string, signature: string | null, config: StripeConfig): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe signature.");
  return stripeClient(config).webhooks.constructEvent(rawBody, signature, config.webhookSecret);
}

/** Pull a Checkout Session the browser just returned from and store it if it belongs to this member. */
export async function fulfillCheckoutReturn(memberId: string, sessionId: string): Promise<boolean> {
  const config = readStripeConfig();
  if (!config) return false;
  if (!/^cs_[A-Za-z0-9_]{8,}$/.test(sessionId)) return false;
  const session = await stripeClient(config).checkout.sessions.retrieve(sessionId);
  return withDb((db) => applyCheckoutSession(db, session, memberId));
}
