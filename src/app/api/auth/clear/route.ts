import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION = "botdate_uid";

/** Drop a session whose member is no longer in the database, then return to login. */
export function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION, "", { path: "/", maxAge: 0 });
  return response;
}
