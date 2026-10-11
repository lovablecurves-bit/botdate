export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
};

function trimmed(env: NodeJS.ProcessEnv, name: string): string {
  return env[name]?.trim() ?? "";
}

/**
 * Membership billing is optional. Missing any of the three variables hides the paywall.
 * Checkout, the webhook, and the billing portal all stay quiet until the set is complete.
 */
export function readStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  const secretKey = trimmed(env, "STRIPE_SECRET_KEY");
  const webhookSecret = trimmed(env, "STRIPE_WEBHOOK_SECRET");
  const priceId = trimmed(env, "STRIPE_PRICE_ID");
  if (!secretKey || !webhookSecret || !priceId) return null;
  return { secretKey, webhookSecret, priceId };
}

export function billingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readStripeConfig(env) !== null;
}
