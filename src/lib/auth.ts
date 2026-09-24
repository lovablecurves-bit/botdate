import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db/open";
import { getMember } from "./domain";
import type { Member } from "./types";

const COOKIE = "botdate_uid";

export async function requireUser(): Promise<Member> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) redirect("/login");
  const member = getMember(getDb(), id);
  if (!member) {
    jar.set(COOKIE, "", { path: "/", maxAge: 0 });
    redirect("/login");
  }
  return member;
}

export async function requireOnboarded(): Promise<Member> {
  const member = await requireUser();
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
