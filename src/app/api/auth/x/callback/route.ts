import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { upsertXMember } from "@/lib/x/account";
import { xCredentials } from "@/lib/x/config";
import { XAuthError, exchangeAuthorizationCode, fetchXProfile } from "@/lib/x/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE = "botdate_x_state";
const VERIFIER = "botdate_x_verifier";
const SESSION = "botdate_uid";

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clearOauth(response: NextResponse) {
  response.cookies.set(STATE, "", { path: "/", maxAge: 0 });
  response.cookies.set(VERIFIER, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const login = new URL("/login", request.url);
  const fail = (message: string) => {
    login.searchParams.set("error", message);
    return clearOauth(NextResponse.redirect(login));
  };

  const credentials = xCredentials();
  if (!credentials) return fail("Sign in with X is not configured yet. Pick a demo member.");
  if (url.searchParams.get("error")) return fail("X sign-in was cancelled. Try again.");

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const expected = jar.get(STATE)?.value ?? "";
  const verifier = jar.get(VERIFIER)?.value ?? "";
  if (!code || !state || !expected || !verifier || !same(state, expected)) {
    return fail("That X sign-in expired. Try again.");
  }

  try {
    const accessToken = await exchangeAuthorizationCode(credentials, code, verifier);
    const profile = await fetchXProfile(accessToken);
    const account = await withDb((db) => upsertXMember(db, profile));
    const nextPath = account.connectSeen ? (account.locked ? "/shortlist" : "/onboarding") : "/connect";
    const dest = new URL(nextPath, request.url);
    const response = NextResponse.redirect(dest);
    response.cookies.set(SESSION, account.userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: url.protocol === "https:",
    });
    return clearOauth(response);
  } catch (error) {
    const message = error instanceof XAuthError ? error.message : "X sign-in did not finish. Try again.";
    return fail(message.slice(0, 180));
  }
}
