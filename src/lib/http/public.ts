const OPEN = [
  /^\/api\/auth\/x(?:\/|$)/,
  /^\/api\/agent(?:\/|$)/,
  /^\/api\/mcp(?:\/|$)/,
  /^\/api\/stripe\/webhook\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
];

/** Routes that authenticate themselves, or do not use the demo session cookie. */
export function isOpenPath(pathname: string): boolean {
  return OPEN.some((pattern) => pattern.test(pathname));
}
