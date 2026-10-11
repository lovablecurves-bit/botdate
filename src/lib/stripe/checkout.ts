import type Stripe from "stripe";

export function checkoutSessionParams(input: {
  memberId: string;
  priceId: string;
  customerId: string | null;
  origin: string;
}): Stripe.Checkout.SessionCreateParams {
  const origin = input.origin.replace(/\/$/, "");
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    client_reference_id: input.memberId,
    metadata: { memberId: input.memberId },
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${origin}/join?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/join?checkout=cancel`,
    subscription_data: {
      metadata: { memberId: input.memberId },
    },
  };
  if (input.customerId) params.customer = input.customerId;
  return params;
}

export function billingPortalParams(customerId: string, returnUrl: string): Stripe.BillingPortal.SessionCreateParams {
  return {
    customer: customerId,
    return_url: returnUrl,
  };
}
