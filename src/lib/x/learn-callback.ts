import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withDb } from "../db/open";
import {
  OAUTH_LEARN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  SESSION_COOKIE,
  oauthCookieOptions,
  readRequestCookie,
  requestIsSecureSync,
  verifySession,
} from "../session";
import { xCredentials } from "./config";
import { XAuthError, exchangeBotAuthorizationCode, fetchXProfile, logOAuthCallbackError, readOAuthCallbackError } from "./oauth";
import { learnFromGrant } from "./posts";
import { readSessionSecret } from "./seal";

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clearLearnOauth(response: NextResponse, secure: boolean) {
  const expired = { ...oauthCookieOptions(secure), maxAge: 0 };
  response.cookies.set(OAUTH_STATE_COOKIE, "", expired);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, "", expired);
  response.cookies.set(OAUTH_LEARN_COOKIE, "", expired);
  return response;
}

export function isLearnOAuthCallback(request: Request): boolean {
  return readRequestCookie(request, OAUTH_LEARN_COOKIE) === "1";
}

/** Opt-in return from X. Stores a refresh token and a short summary, never the posts. */
export async function finishLearnOAuthCallback(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const back = new URL("/onboarding", request.url);
  const fail = (message: string) => {
    back.searchParams.set("error", message.slice(0, 180));
    return clearLearnOauth(NextResponse.redirect(back), secure);
  };

  const credentials = xCredentials();
  if (!credentials) return fail("Sign in with X is not configured yet.");
  const oauthError = readOAuthCallbackError(url.searchParams);
  if (oauthError) {
    logOAuthCallbackError(oauthError);
    return fail(oauthError.error_description ? `${oauthError.error}: ${oauthError.error_description}` : oauthError.error);
  }

  const session = verifySession(readRequestCookie(request, SESSION_COOKIE));
  if (!session?.xUserId) return fail("Sign in with X to let your bot learn from your posts.");

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const expected = readRequestCookie(request, OAUTH_STATE_COOKIE);
  const verifier = readRequestCookie(request, OAUTH_VERIFIER_COOKIE);
  if (!code || !state || !expected || !verifier || !same(state, expected)) {
    return fail("That X connection expired. Try again.");
  }

  const secret = readSessionSecret();
  if (!secret) return fail("SESSION_SECRET is required to store your X token.");

  try {
    const grant = await exchangeBotAuthorizationCode(credentials, code, verifier);
    const profile = await fetchXProfile(grant.accessToken);
    if (profile.xUserId !== session.xUserId) return fail("Use the same X account you signed in with.");
    await withDb((db) =>
      learnFromGrant(db, {
        memberId: session.id,
        xUserId: profile.xUserId,
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken,
        expiresIn: grant.expiresIn,
        secret,
      }),
    );
    back.searchParams.set("notice", "posts");
    return clearLearnOauth(NextResponse.redirect(back), secure);
  } catch (error) {
    const message = error instanceof XAuthError ? error.message : "X did not share your posts. Try again.";
    return fail(message);
  }
}
