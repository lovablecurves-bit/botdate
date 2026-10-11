const OPEN = [
  /^\/api\/auth\/x(?:\/|$)/,
  /^\/api\/agent(?:\/|$)/,
  /^\/api\/mcp(?:\/|$)/,
  /^\/api\/waitlist\/count\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
];

/** Routes that authenticate themselves, or do not use the demo session cookie. */
export function isOpenPath(pathname: string): boolean {
  return OPEN.some((pattern) => pattern.test(pathname));
}

/** Keep a waitlist ?ref= when an unsigned visitor is sent to the login screen. */
export function guestLoginUrl(requestUrl: string): string {
  const current = new URL(requestUrl);
  const dest = new URL("/login", current);
  const ref = current.searchParams.get("ref")?.trim().toLowerCase() ?? "";
  if (/^[a-z0-9]{6,16}$/.test(ref)) dest.searchParams.set("ref", ref);
  return dest.toString();
}
