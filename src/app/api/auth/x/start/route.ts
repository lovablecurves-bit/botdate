import { NextResponse } from "next/server";
import { xCredentials } from "@/lib/x/config";
import { authorizeUrl, randomState, randomVerifier } from "@/lib/x/pkce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE = "botdate_x_state";
const VERIFIER = "botdate_x_verifier";

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
  const secure = new URL(request.url).protocol === "https:";
  const cookie = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure };
  response.cookies.set(STATE, state, cookie);
  response.cookies.set(VERIFIER, verifier, cookie);
  return response;
}
