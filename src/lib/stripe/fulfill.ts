import { withDb } from "../db/open";
import { getStripe } from "./client";
import { stripeConfig } from "./config";
import { applyMembership, membershipWriteFromEvent, type MembershipWrite } from "./membership";

function customerIdOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
    const id = (value as { id: string }).id;
    return id.length > 0 ? id : null;
  }
  return null;
}

/** Pulls a returned Checkout Session onto the member so the paywall can open before the webhook lands. */
export async function fulfillCheckoutSession(sessionId: string, memberId: string): Promise<boolean> {
  const config = stripeConfig();
  if (!config) return false;
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  try {
    const stripe = getStripe(config.secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const write = membershipWriteFromEvent({ type: "checkout.session.completed", data: { object: session } });
    if (!write || write.memberId !== memberId) return false;
    if (write.subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(write.subscriptionId);
        write.status = subscription.status;
        write.customerId = write.customerId ?? customerIdOf(subscription.customer);
        if (!write.memberId && subscription.metadata?.memberId) write.memberId = subscription.metadata.memberId;
      } catch {
        // The session's payment status is enough until the webhook arrives.
      }
    }
    const saved = await withDb((db) => applyMembership(db, write));
    return saved.updated;
  } catch {
    return false;
  }
}

export async function enrichCheckoutWrite(write: MembershipWrite, secretKey: string): Promise<MembershipWrite> {
  if (!write.subscriptionId) return write;
  try {
    const subscription = await getStripe(secretKey).subscriptions.retrieve(write.subscriptionId);
    return {
      ...write,
      status: subscription.status,
      customerId: write.customerId ?? customerIdOf(subscription.customer),
      memberId: write.memberId ?? (subscription.metadata?.memberId || null),
    };
  } catch {
    return write;
  }
}
