import { readStripeConfig, type StripeConfig } from "./config";
import type { Member } from "../types";

/** Shown on the paywall button. The Stripe price itself comes from STRIPE_PRICE_ID. */
export const MEMBERSHIP_PRICE = "$4.20/mo";
export const MEMBERSHIP_BUTTON = "Join BotDate, $4.20/mo";

const FOUNDER_HANDLE = "lovablecurves";
const ENTITLED = new Set(["active", "trialing"]);

export function normalizeXHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

/** Comma-separated handles. Blank entries and a leading @ are ignored. Matching is case-insensitive. */
export function parseFreeHandles(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw.split(",").map(normalizeXHandle).filter(Boolean);
}

export function hasActiveSubscription(status: string | null | undefined): boolean {
  return status != null && ENTITLED.has(status);
}

/**
 * Founder stays free: the founder flag, member #1, @lovablecurves, or FREE_X_HANDLES.
 * Handle checks are case-insensitive and accept a leading @.
 */
export function isComplimentary(
  member: Pick<Member, "founder" | "memberNumber" | "xAccount">,
  freeHandleList: readonly string[] = parseFreeHandles(process.env.FREE_X_HANDLES),
): boolean {
  if (member.founder || member.memberNumber === 1) return true;
  const handle = member.xAccount ? normalizeXHandle(member.xAccount.handle) : "";
  if (!handle) return false;
  if (handle === FOUNDER_HANDLE) return true;
  return freeHandleList.map(normalizeXHandle).includes(handle);
}

type PaywallOptions = {
  config?: StripeConfig | null;
  freeHandles?: string;
};

/**
 * Paywall only for an X member with billing configured, no complimentary pass,
 * and no active or trialing subscription. Missing Stripe env vars skip it.
 */
export function needsPaywall(
  member: Pick<Member, "founder" | "memberNumber" | "xAccount" | "subscriptionStatus">,
  options?: PaywallOptions,
): boolean {
  const config = options && "config" in options ? (options.config ?? null) : readStripeConfig();
  if (!config) return false;
  const handles = options && "freeHandles" in options ? parseFreeHandles(options.freeHandles) : parseFreeHandles(process.env.FREE_X_HANDLES);
  if (isComplimentary(member, handles)) return false;
  if (!member.xAccount) return false;
  return !hasActiveSubscription(member.subscriptionStatus);
}
