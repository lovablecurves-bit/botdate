import { NextResponse, type NextRequest } from "next/server";
import { isOpenPath } from "@/lib/http/public";

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  const loggedIn = Boolean(request.cookies.get("botdate_uid")?.value);
  const { pathname } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next({ request: { headers: requestHeaders } });
  if (!loggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/shortlist", request.url));
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
