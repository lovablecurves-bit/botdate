import type { Member } from "../types";
import { stripeConfig, type StripeEnv } from "./config";

/** Always complimentary, in addition to the founder flag and FREE_X_HANDLES. */
export const FOUNDER_HANDLE = "lovablecurves";

/** A subscription in one of these states unlocks the app. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export const MEMBERSHIP_LABEL = "Join BotDate, $4.20/mo";

export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

export function complimentaryHandles(env: StripeEnv = process.env): Set<string> {
  const extra = (env.FREE_X_HANDLES ?? "")
    .split(",")
    .map((part) => normalizeHandle(part))
    .filter(Boolean);
  return new Set([FOUNDER_HANDLE, ...extra]);
}

export function hasActiveSubscription(status: string | null | undefined): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has((status ?? "").trim().toLowerCase());
}

/** Founder (member #1), @lovablecurves, or a handle listed in FREE_X_HANDLES. */
export function isComplimentary(
  member: Pick<Member, "founder" | "memberNumber" | "xAccount">,
  env: StripeEnv = process.env,
): boolean {
  if (member.founder || member.memberNumber === 1) return true;
  const handle = member.xAccount?.handle ? normalizeHandle(member.xAccount.handle) : "";
  return Boolean(handle && complimentaryHandles(env).has(handle));
}

/**
 * After X sign-in, a member without a complimentary pass or an active subscription
 * sees the paywall. Demo members, and any deploy missing Stripe env vars, do not.
 */
export function needsPaywall(member: Member, env: StripeEnv = process.env): boolean {
  if (!stripeConfig(env)) return false;
  if (!member.xAccount) return false;
  if (isComplimentary(member, env)) return false;
  if (hasActiveSubscription(member.subscriptionStatus)) return false;
  return true;
}

export function canManageBilling(member: Pick<Member, "stripeCustomerId">, env: StripeEnv = process.env): boolean {
  return Boolean(stripeConfig(env) && member.stripeCustomerId);
}
