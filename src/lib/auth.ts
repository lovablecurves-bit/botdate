import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { needsPaywall } from "./billing/access";
import { withDb } from "./db/open";
import { getMember } from "./domain";
import type { Member } from "./types";

const COOKIE = "botdate_uid";

/** Real X members see Connect your Grok Bot once, on the first login. */
export function needsConnectPrompt(member: Pick<Member, "xAccount" | "connectSeen">): boolean {
  return member.xAccount !== null && !member.connectSeen;
}

/** Where a signed-in member goes once the paywall, if any, is cleared. */
export function postLoginPath(member: Pick<Member, "xAccount" | "connectSeen" | "prefs">): string {
  if (needsConnectPrompt(member)) return "/connect";
  if (!member.prefs.locked) return "/onboarding";
  return "/shortlist";
}

export async function requireUser(): Promise<Member> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) redirect("/login");
  const member = await withDb((db) => getMember(db, id));
  if (!member) redirect("/api/auth/clear");
  return member;
}

/** Signed-in member with an active membership, or a complimentary pass. */
export async function requireSubscriber(): Promise<Member> {
  const member = await requireUser();
  if (needsPaywall(member)) redirect("/join");
  return member;
}

export async function requireOnboarded(): Promise<Member> {
  const member = await requireSubscriber();
  if (needsConnectPrompt(member)) redirect("/connect");
  if (!member.prefs.locked) redirect("/onboarding");
  return member;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, userId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE, "", { path: "/", maxAge: 0 });
}
