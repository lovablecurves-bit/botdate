const OPEN = [
  /^\/api\/auth\/x(?:\/|$)/,
  /^\/api\/admin\/x(?:\/|$)/,
  /^\/api\/admin\/signups\/?$/,
  /^\/admin\/x\/connected\/?$/,
  /^\/api\/agent(?:\/|$)/,
  /^\/api\/mcp(?:\/|$)/,
  /^\/api\/stripe\/webhook\/?$/,
  /^\/api\/health\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
  /^\/video\/?$/,
  /^\/video\/embed\/?$/,
  /^\/video\/botdate-how-it-works\.(?:mp4|png)$/,
  /^\/preview\/[a-z0-9-]+\.png$/,
  /^\/demo\/?$/,
];

/** Icons, manifest, and Next static files. Middleware must not send these to login. */
const STATIC =
  /^\/(?:_next(?:\/.*)?|favicon\.ico|robots\.txt|sitemap\.xml|manifest\.(?:webmanifest|json)|icon(?:\.[a-z0-9]+)?|apple-icon(?:\.[a-z0-9]+)?|opengraph-image(?:\.[a-z0-9]+)?|twitter-image(?:\.[a-z0-9]+)?|logo(?:\.[a-z0-9]+)?)$/;

/** Routes that authenticate themselves, or do not use the demo session cookie. */
export function isOpenPath(pathname: string): boolean {
  if (pathname === "/") return true;
  // MCP OAuth discovery and the authorize/token/register endpoints. A dot in
  // /.well-known must not fall through to the login redirect.
  if (pathname === "/.well-known" || pathname.startsWith("/.well-known/")) return true;
  if (pathname === "/oauth" || pathname.startsWith("/oauth/")) return true;
  if (STATIC.test(pathname)) return true;
  return OPEN.some((pattern) => pattern.test(pathname));
}

/** A signup invite code. Anything else is dropped. */
export function referralCode(value: string | null | undefined): string | null {
  const ref = (value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]{6,16}$/.test(ref)) return null;
  return ref;
}

/** Keep a signup ?ref= when an unsigned visitor is sent to the login screen. */
export function guestLoginUrl(requestUrl: string): string {
  const current = new URL(requestUrl);
  const dest = new URL("/login", current);
  const ref = referralCode(current.searchParams.get("ref"));
  if (ref) dest.searchParams.set("ref", ref);
  return dest.toString();
}
