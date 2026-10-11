import { NextResponse, type NextRequest } from "next/server";
import { guestLoginUrl, isOpenPath, referralCode } from "@/lib/http/public";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/waitlist" || pathname === "/waitlist/") {
    const dest = new URL("/", request.url);
    const ref = referralCode(request.nextUrl.searchParams.get("ref"));
    if (ref) dest.searchParams.set("ref", ref);
    return NextResponse.redirect(dest);
  }
  // Leave the raw body untouched so Stripe can verify the signature.
  if (pathname === "/api/stripe/webhook") return NextResponse.next();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const loggedIn = Boolean(request.cookies.get("botdate_session")?.value);
  if (isOpenPath(pathname)) return NextResponse.next({ request: { headers: requestHeaders } });
  if (!loggedIn && pathname !== "/login") {
    return NextResponse.redirect(guestLoginUrl(request.url));
  }
  if (loggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/profile", request.url));
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.svg|apple-icon.png|opengraph-image.png|manifest.webmanifest|robots.txt|sitemap.xml).*)",
  ],
};
