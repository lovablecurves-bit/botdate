import { NextResponse } from "next/server";
import { prepareMcpAuthorize, requestOrigin, signPendingMcpOauth, MCP_OAUTH_COOKIE } from "@/lib/agent/oauth";
import { withDb } from "@/lib/db/open";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, oauthCookieOptions, requestIsSecureSync } from "@/lib/session";
import { xCredentials } from "@/lib/x/config";
import { authorizeUrl, randomState, randomVerifier } from "@/lib/x/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The browser step is Sign in with X. Grok returns here only after X redirects back. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const prepared = await withDb((ctx) => prepareMcpAuthorize(ctx, url.searchParams, origin));
  if (!prepared.ok) {
    if (prepared.redirect) return NextResponse.redirect(prepared.redirect);
    return Response.json({ error: prepared.error, error_description: prepared.description }, { status: prepared.status });
  }
  const credentials = xCredentials();
  if (!credentials) {
    const dest = new URL(prepared.pending.redirectUri);
    dest.searchParams.set("error", "server_error");
    dest.searchParams.set("error_description", "Sign in with X is not configured.");
    if (prepared.pending.state) dest.searchParams.set("state", prepared.pending.state);
    return NextResponse.redirect(dest);
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
  response.cookies.set(MCP_OAUTH_COOKIE, signPendingMcpOauth(prepared.pending), cookie);
  return response;
}
