export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  FREE_X_HANDLES?: string;
  [key: string]: string | undefined;
};

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
};

/** Paid membership stays off until all three Stripe variables are set. */
export function stripeConfig(env: StripeEnv = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const priceId = env.STRIPE_PRICE_ID?.trim() ?? "";
  if (!secretKey || !webhookSecret || !priceId) return null;
  return { secretKey, webhookSecret, priceId };
}
