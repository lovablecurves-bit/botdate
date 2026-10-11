import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { users } from "../db/schema";
import { hasActiveSubscription } from "./access";

export type MembershipWrite = {
  memberId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  status: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function stripeId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  const record = asRecord(value);
  if (record && typeof record.id === "string" && record.id.length > 0) return record.id;
  return null;
}

function metadataMemberId(record: Record<string, unknown>): string | null {
  const meta = asRecord(record.metadata);
  const id = meta?.memberId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function inferredCheckoutStatus(record: Record<string, unknown>): string | null {
  const subscription = asRecord(record.subscription);
  if (subscription && typeof subscription.status === "string" && subscription.status.length > 0) return subscription.status;
  if (record.status === "complete" && record.payment_status === "no_payment_required") return "trialing";
  if (record.status === "complete" && record.payment_status === "paid") return "active";
  return null;
}

/** Maps the three registered Stripe events onto a membership write. Other events are ignored. */
export function membershipWriteFromEvent(event: { type: string; data: { object: unknown } }): MembershipWrite | null {
  const record = asRecord(event.data.object);
  if (!record) return null;

  if (event.type === "checkout.session.completed") {
    const clientReference = typeof record.client_reference_id === "string" ? record.client_reference_id : "";
    return {
      memberId: clientReference || metadataMemberId(record),
      customerId: stripeId(record.customer),
      subscriptionId: stripeId(record.subscription),
      status: inferredCheckoutStatus(record),
    };
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const status =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : typeof record.status === "string" && record.status.length > 0
          ? record.status
          : null;
    return {
      memberId: metadataMemberId(record),
      customerId: stripeId(record.customer),
      subscriptionId: stripeId(record.id),
      status,
    };
  }

  return null;
}

function findUser(ctx: BotDateDb, write: MembershipWrite) {
  if (write.memberId) {
    const byId = ctx.db.select().from(users).where(eq(users.id, write.memberId)).get();
    if (byId) return byId;
  }
  if (write.customerId) {
    const byCustomer = ctx.db.select().from(users).where(eq(users.stripeCustomerId, write.customerId)).get();
    if (byCustomer) return byCustomer;
  }
  if (write.subscriptionId) {
    const bySubscription = ctx.db.select().from(users).where(eq(users.stripeSubscriptionId, write.subscriptionId)).get();
    if (bySubscription) return bySubscription;
  }
  return null;
}

/**
 * Stores the Stripe customer id and subscription status on the member.
 * A canceled event for an older subscription does not clear a newer active one.
 */
export function applyMembership(ctx: BotDateDb, write: MembershipWrite): { updated: boolean } {
  const existing = findUser(ctx, write);
  if (!existing) return { updated: false };

  const sameSub =
    !existing.stripeSubscriptionId || !write.subscriptionId || existing.stripeSubscriptionId === write.subscriptionId;
  const replaceSub = sameSub || hasActiveSubscription(write.status);

  const patch: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeSubscriptionStatus?: string;
  } = {};
  if (write.customerId) patch.stripeCustomerId = write.customerId;
  if (replaceSub && write.subscriptionId) patch.stripeSubscriptionId = write.subscriptionId;
  if (replaceSub && write.status) patch.stripeSubscriptionStatus = write.status;
  if (Object.keys(patch).length === 0) return { updated: false };

  ctx.db.update(users).set(patch).where(eq(users.id, existing.id)).run();
  return { updated: true };
}
