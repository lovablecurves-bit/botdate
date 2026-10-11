import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withDb } from "./db/open";
import { getMember } from "./domain";
import type { Member } from "./types";

const COOKIE = "botdate_uid";

/** Real X members see Connect your Grok Bot once, on the first login. */
export function needsConnectPrompt(member: Member): boolean {
  return member.xAccount !== null && !member.connectSeen;
}

export async function requireUser(): Promise<Member> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) redirect("/login");
  const member = await withDb((db) => getMember(db, id));
  if (!member) redirect("/api/auth/clear");
  return member;
}

export async function requireOnboarded(): Promise<Member> {
  const member = await requireUser();
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
