export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_TRIAL_DAYS?: string;
  FREE_X_HANDLES?: string;
  [key: string]: string | undefined;
};

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
};

export const DEFAULT_TRIAL_DAYS = 3;

/** Trial length for Checkout. Unset, blank, or invalid values use 3 days. */
export function trialDays(env: StripeEnv = process.env): number {
  const raw = env.STRIPE_TRIAL_DAYS?.trim() ?? "";
  if (!raw) return DEFAULT_TRIAL_DAYS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_TRIAL_DAYS;
  return parsed;
}

/** Paid membership stays off until all three Stripe variables are set. */
export function stripeConfig(env: StripeEnv = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const priceId = env.STRIPE_PRICE_ID?.trim() ?? "";
  if (!secretKey || !webhookSecret || !priceId) return null;
  return { secretKey, webhookSecret, priceId };
}
