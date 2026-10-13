import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { getMember } from "@/lib/domain";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  REFERRAL_COOKIE,
  SESSION_COOKIE,
  claimsFromMember,
  memberFromClaims,
  oauthCookieOptions,
  readRequestCookie,
  requestIsSecureSync,
  sessionCookieOptions,
  signSession,
} from "@/lib/session";
import { MCP_OAUTH_COOKIE, mcpOauthCodeLocation, mcpOauthErrorLocation, storeMcpAuthorizationCode, verifyPendingMcpOauth } from "@/lib/agent/oauth";
import { checkoutDestination } from "@/lib/auth";
import { upsertXMember } from "@/lib/x/account";
import { xCredentials } from "@/lib/x/config";
import { finishBotOAuthCallback, isBotOAuthCallback } from "@/lib/x/bot-callback";
import { XAuthError, exchangeAuthorizationCode, fetchXProfile, logOAuthCallbackError, readOAuthCallbackError } from "@/lib/x/oauth";
import type { XProfile } from "@/lib/x/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function same(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clearOauth(response: NextResponse, secure: boolean) {
  const expired = { ...oauthCookieOptions(secure), maxAge: 0 };
  response.cookies.set(OAUTH_STATE_COOKIE, "", expired);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, "", expired);
  response.cookies.set(MCP_OAUTH_COOKIE, "", expired);
  return response;
}

export async function GET(request: Request) {
  if (isBotOAuthCallback(request)) return finishBotOAuthCallback(request);
  const url = new URL(request.url);
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const login = new URL("/login", request.url);
  const pending = verifyPendingMcpOauth(readRequestCookie(request, MCP_OAUTH_COOKIE));
  const fail = (message: string, oauthError = "access_denied") => {
    if (pending) return clearOauth(NextResponse.redirect(mcpOauthErrorLocation(pending, oauthError, message)), secure);
    login.searchParams.set("error", message.slice(0, 180));
    return clearOauth(NextResponse.redirect(login), secure);
  };

  const credentials = xCredentials();
  if (!credentials) return fail("Sign in with X is not configured yet. Pick a demo member.");
  const oauthError = readOAuthCallbackError(url.searchParams);
  if (oauthError) {
    logOAuthCallbackError(oauthError);
    if (pending) {
      return clearOauth(NextResponse.redirect(mcpOauthErrorLocation(pending, oauthError.error, oauthError.error_description ?? "X sign-in did not finish.")), secure);
    }
    login.searchParams.set("error", oauthError.error);
    if (oauthError.error_description) login.searchParams.set("error_description", oauthError.error_description);
    return clearOauth(NextResponse.redirect(login), secure);
  }

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const expected = readRequestCookie(request, OAUTH_STATE_COOKIE);
  const verifier = readRequestCookie(request, OAUTH_VERIFIER_COOKIE);
  if (!code || !state || !expected || !verifier || !same(state, expected)) {
    return fail("That X sign-in expired. Try again.");
  }

  try {
    const accessToken = await exchangeAuthorizationCode(credentials, code, verifier);
    const profile = await fetchXProfile(accessToken);
    const ref = readRequestCookie(request, REFERRAL_COOKIE);
    const member = await memberFromSignIn(profile, ref);
    const checkout = checkoutDestination(member);
    const mcpCode = pending && !checkout ? await withDb((db) => storeMcpAuthorizationCode(db, pending, member.id)) : null;
    if (pending && !checkout && !mcpCode) return fail("Could not finish connecting your Grok Bot.", "server_error");
    const dest = pending && mcpCode ? new URL(mcpOauthCodeLocation(pending, mcpCode)) : new URL(checkout ?? "/profile", request.url);
    const response = NextResponse.redirect(dest);
    response.cookies.set(SESSION_COOKIE, signSession(claimsFromMember(member)), sessionCookieOptions(secure));
    response.cookies.set(REFERRAL_COOKIE, "", { ...oauthCookieOptions(secure), maxAge: 0 });
    return clearOauth(response, secure);
  } catch (error) {
    const message = error instanceof XAuthError ? error.message : "X sign-in did not finish. Try again.";
    return fail(message.slice(0, 180));
  }
}

/**
 * One GET /2/users/me already happened. Upsert that snapshot and do not call X again.
 * If the database is down, the signed cookie still carries the profile.
 */
async function memberFromSignIn(profile: XProfile, ref: string | null) {
  try {
    const saved = await withDb((db) => {
      const upserted = upsertXMember(db, profile, ref);
      return getMember(db, upserted.userId);
    });
    if (saved) return saved;
  } catch (error) {
    console.error("Could not store the X member; signing in from the profile snapshot.", error);
  }
  return memberFromClaims(
    claimsFromMember({
      id: `x_${profile.xUserId}`,
      email: `x_${profile.xUserId}@x.botdate`,
      displayName: profile.name,
      botPaused: false,
      profile: {
        age: null,
        city: null,
        occupation: "",
        bio: profile.bio,
        gender: null,
        smoking: false,
        kids: "open",
        intent: "serious",
        interests: [],
        accent: "#ff2d92",
        voice: { subject: "they", object: "them", possessive: "their" },
      },
      prefs: {
        ageMin: null,
        ageMax: null,
        cities: null,
        smoking: "any",
        kids: "any",
        intent: "any",
        seeking: null,
        niceToHaves: "",
        dealbreakers: null,
        locked: false,
      },
      xAccount: { userId: profile.xUserId, handle: profile.handle, avatarUrl: profile.avatarUrl },
      founder: false,
      memberNumber: null,
      connectSeen: false,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    }),
  );
}
