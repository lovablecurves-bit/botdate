import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { withDb } from "./db/open";
import { getMember } from "./domain";
import { needsPaywall } from "./stripe/access";
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  claimsFromMember,
  memberFromClaims,
  requestIsSecureSync,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionClaims,
} from "./session";
import type { Member } from "./types";

/** Real X members see Connect your Grok Bot once, on the first login. */
export function needsConnectPrompt(member: Member): boolean {
  return member.xAccount !== null && !member.connectSeen;
}

/**
 * Where a signed-in member goes after X, checkout, or the home page.
 * Connect your Grok Bot, then the profile form, then the shortlist.
 * Never the logged-out home.
 */
export function memberHome(member: Member): string {
  if (needsPaywall(member)) return "/join";
  if (needsConnectPrompt(member)) return "/connect";
  if (!member.prefs.locked) return "/onboarding";
  return "/shortlist";
}

/** Refuse a post-login redirect that would dump the member on the signed-out home. */
export function safePostLoginPath(path: string): string {
  if (path === "/join" || path === "/connect" || path === "/onboarding" || path === "/shortlist") return path;
  if (/^\/members\/[A-Za-z0-9_-]+$/.test(path)) return path;
  return "/connect";
}

async function requestIsSecure(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  return requestIsSecureSync(`${proto ?? "http"}://${host}`, proto);
}

async function memberForClaims(claims: SessionClaims): Promise<Member> {
  try {
    const stored = await withDb((db) => getMember(db, claims.id));
    if (stored) return stored;
  } catch (error) {
    console.error("Member lookup failed; using the signed X profile snapshot.", error);
  }
  return memberFromClaims(claims);
}

export async function currentMember(): Promise<Member | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!token) return null;
  const claims = verifySession(token);
  if (!claims) return null;
  return memberForClaims(claims);
}

export async function requireUser(): Promise<Member> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  if (!token) redirect("/login");
  const claims = verifySession(token);
  if (!claims) redirect("/api/auth/clear");
  return memberForClaims(claims);
}

export async function requireOnboarded(): Promise<Member> {
  const member = await requireUser();
  if (needsConnectPrompt(member)) redirect("/connect");
  if (!member.prefs.locked) redirect("/onboarding");
  return member;
}

export async function setSession(member: Member) {
  const jar = await cookies();
  const secure = await requestIsSecure();
  jar.set(SESSION_COOKIE, signSession(claimsFromMember(member)), sessionCookieOptions(secure));
}

export async function clearSession() {
  const jar = await cookies();
  const secure = await requestIsSecure();
  const expired = { ...sessionCookieOptions(secure), maxAge: 0 };
  jar.set(SESSION_COOKIE, "", expired);
  jar.set(LEGACY_SESSION_COOKIE, "", expired);
}
