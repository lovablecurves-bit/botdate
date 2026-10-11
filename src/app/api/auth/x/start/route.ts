import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, oauthCookieOptions, requestIsSecureSync } from "@/lib/session";
import { xCredentials } from "@/lib/x/config";
import { authorizeUrl, randomState, randomVerifier } from "@/lib/x/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const credentials = xCredentials();
  const login = new URL("/login", request.url);
  if (!credentials) {
    login.searchParams.set("error", "Sign in with X is not configured yet. Pick a demo member.");
    return NextResponse.redirect(login);
  }
  const state = randomState();
  const verifier = randomVerifier();
  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: credentials.clientId,
      redirectUri: credentials.redirectUri,
      state,
      verifier,
    }),
  );
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const cookie = oauthCookieOptions(secure);
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie);
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, cookie);
  return response;
}
