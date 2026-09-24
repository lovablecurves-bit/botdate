import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const loggedIn = Boolean(request.cookies.get("botdate_uid")?.value);
  const { pathname } = request.nextUrl;
  if (!loggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/shortlist", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
