import { NextResponse } from "next/server";
import { adminKeyAuthorized } from "@/lib/x/admin-auth";
import { signBotOAuthState } from "@/lib/x/bot-state";
import { xCredentials } from "@/lib/x/config";
import { X_BOT_SCOPES, authorizeUrl, randomVerifier } from "@/lib/x/pkce";
import { readSessionSecret } from "@/lib/x/seal";
import { BOT_OAUTH_STATE_COOKIE, BOT_OAUTH_VERIFIER_COOKIE, oauthCookieOptions, requestIsSecureSync } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  if (!adminKeyAuthorized(url.searchParams.get("key"))) return jsonError("unauthorized", 401);

  const credentials = xCredentials();
  if (!credentials) return jsonError("Sign in with X is not configured.", 503);
  const secret = readSessionSecret();
  if (!secret) return jsonError("SESSION_SECRET is required.", 503);

  const state = signBotOAuthState(secret);
  const verifier = randomVerifier();
  const response = NextResponse.redirect(
    authorizeUrl({
      clientId: credentials.clientId,
      redirectUri: credentials.redirectUri,
      state,
      verifier,
      scopes: X_BOT_SCOPES,
    }),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const cookie = oauthCookieOptions(secure);
  response.cookies.set(BOT_OAUTH_STATE_COOKIE, state, cookie);
  response.cookies.set(BOT_OAUTH_VERIFIER_COOKIE, verifier, cookie);
  return response;
}
