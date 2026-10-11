import Stripe from "stripe";

/** Verifies the Stripe-Signature header against the raw request body. */
export function verifyWebhook(payload: string, signature: string, secret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}
