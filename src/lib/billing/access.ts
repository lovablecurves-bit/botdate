import type { Member } from "../types";

const ACTIVE = new Set(["active", "trialing"]);
const BLOCKING = new Set(["canceled", "past_due", "unpaid", "incomplete", "incomplete_expired", "paused"]);

/** Comma- or whitespace-separated X user ids. Lisa's id belongs here in production. */
export function founderXIds(): string[] {
  return (process.env.FOUNDER_X_IDS ?? "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Founder if their X user id is listed in FOUNDER_X_IDS.
 * Otherwise fall back to the stored founder flag (first real member).
 */
export function isFounderAccount(member: { founder: boolean; xAccount: { userId: string } | null }): boolean {
  const id = member.xAccount?.userId ?? "";
  if (id && founderXIds().includes(id)) return true;
  return member.founder;
}

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim());
}

export function normalizeSubscriptionStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/**
 * Active and trialing subscriptions can use the bot API and be discovered.
 * The founder is always exempt. A recorded inactive status blocks even the demo roster.
 * A real X member with no subscription is blocked only once Stripe is configured.
 */
export function subscriptionBlocks(member: Member): boolean {
  if (isFounderAccount(member)) return false;
  const status = normalizeSubscriptionStatus(member.subscriptionStatus);
  if (ACTIVE.has(status)) return false;
  if (BLOCKING.has(status)) return true;
  if (!member.xAccount) return false;
  return billingConfigured();
}

export function needsPaywall(member: Member): boolean {
  return subscriptionBlocks(member);
}

/** Founder accounts never start Checkout. */
export function checkoutAllowed(member: Member): boolean {
  return !isFounderAccount(member);
}
