import { NextResponse } from "next/server";
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, requestIsSecureSync, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Drop a session cookie that no longer verifies, then return to login. */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  const secure = requestIsSecureSync(request.url, request.headers.get("x-forwarded-proto"));
  const expired = { ...sessionCookieOptions(secure), maxAge: 0 };
  response.cookies.set(SESSION_COOKIE, "", expired);
  response.cookies.set(LEGACY_SESSION_COOKIE, "", expired);
  return response;
}
