import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withDb } from "../db/open";
import { BOT_OAUTH_STATE_COOKIE, BOT_OAUTH_VERIFIER_COOKIE, oauthCookieOptions, readRequestCookie, requestIsSecureSync } from "../session";
import { isBotDateAppUsername, saveBotCredentials } from "./bot-credentials";
import { readBotOAuthState } from "./bot-state";
import { xCredentials } from "./config";
import { XAuthError, exchangeBotAuthorizationCode, fetchXProfile, logOAuthCallbackError, readOAuthCallbackError } from "./oauth";
import { readSessionSecret } from "./seal";

const CONNECTED_PATH = "/admin/x/connected";

function same(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function clearBotOauth(response: NextResponse, secure: boolean) {
  const expired = { ...oauthCookieOptions(secure), maxAge: 0 };
  response.cookies.set(BOT_OAUTH_STATE_COOKIE, "", expired);
  response.cookies.set(BOT_OAUTH_VERIFIER_COOKIE, "", expired);
  return response;
}

/** True only when the state signature says this callback is the BotDateApp connect flow. */
export function isBotOAuthCallback(request: Request): boolean {
  const secret = readSessionSecret();
  if (!secret) return false;
  let state = "";
  try {
    state = new URL(request.url).searchParams.get("state") ?? "";
  } catch {
    return false;
  }
  return readBotOAuthState(state, secret).trusted;
}

function logBotFailure(error: unknown): void {
  if (!(error instanceof XAuthError)) {
    console.error("BotDateApp OAuth failed.");
    return;
  }
  const safe = error.message.replace(/[A-Za-z0-9_-]{12,}/g, "[redacted]").slice(0, 180);
  console.error(`BotDateApp OAuth failed: ${safe}`);
}

export async function finishBotOAuthCallback(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const fail = (code: string) => {
    const dest = new URL(CONNECTED_PATH, request.url);
    dest.searchParams.set("error", code);
    return clearBotOauth(NextResponse.redirect(dest), secure);
  };

  const secret = readSessionSecret();
  if (!secret) return fail("config");
  const state = url.searchParams.get("state") ?? "";
  const read = readBotOAuthState(state, secret);
  if (!read.trusted) return fail("state");

  const expected = readRequestCookie(request, BOT_OAUTH_STATE_COOKIE);
  const verifier = readRequestCookie(request, BOT_OAUTH_VERIFIER_COOKIE);
  if (!expected || !verifier || !same(state, expected)) return fail("state");

  const oauthError = readOAuthCallbackError(url.searchParams);
  if (oauthError) {
    logOAuthCallbackError(oauthError);
    return fail("denied");
  }
  if (!read.fresh) return fail("expired");

  const code = url.searchParams.get("code") ?? "";
  if (!code) return fail("state");
  const credentials = xCredentials();
  if (!credentials) return fail("config");

  try {
    const grant = await exchangeBotAuthorizationCode(credentials, code, verifier);
    const profile = await fetchXProfile(grant.accessToken);
    if (!isBotDateAppUsername(profile.handle)) {
      console.error(`BotDateApp connect rejected username=${profile.handle}`);
      return fail("account");
    }
    const expiresAt = new Date(Date.now() + grant.expiresIn * 1000).toISOString();
    await withDb((db) => {
      saveBotCredentials(db, {
        xUserId: profile.xUserId,
        username: profile.handle,
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken,
        expiresAt,
        secret,
      });
    });
    return clearBotOauth(NextResponse.redirect(new URL(CONNECTED_PATH, request.url)), secure);
  } catch (error) {
    logBotFailure(error);
    return fail(error instanceof XAuthError ? "exchange" : "store");
  }
}
