import { NextResponse } from "next/server";
import { OAUTH_LEARN_COOKIE, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, SESSION_COOKIE, oauthCookieOptions, readRequestCookie, requestIsSecureSync, verifySession } from "@/lib/session";
import { xCredentials } from "@/lib/x/config";
import { X_LEARN_SCOPES, authorizeUrl, randomState, randomVerifier } from "@/lib/x/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const back = new URL("/onboarding", request.url);
  const credentials = xCredentials();
  if (!credentials) {
    back.searchParams.set("error", "Sign in with X is not configured yet.");
    return NextResponse.redirect(back);
  }
  const session = verifySession(readRequestCookie(request, SESSION_COOKIE));
  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "Sign in with X to let your bot learn from your posts.");
    return NextResponse.redirect(login);
  }
  if (!session.xUserId) {
    back.searchParams.set("error", "Sign in with X to let your bot learn from your posts.");
    return NextResponse.redirect(back);
  }
  const state = randomState();
  const verifier = randomVerifier();
  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: credentials.clientId,
      redirectUri: credentials.redirectUri,
      state,
      verifier,
      scopes: X_LEARN_SCOPES,
    }),
  );
  const cookie = oauthCookieOptions(secure);
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookie);
  response.cookies.set(OAUTH_LEARN_COOKIE, "1", cookie);
  return response;
}
