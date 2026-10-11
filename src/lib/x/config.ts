export type XCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Sign in with X is optional. Missing any of the three variables keeps the demo login. */
export function xCredentials(): XCredentials | null {
  const clientId = process.env.X_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.X_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.X_REDIRECT_URI?.trim() ?? "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function xAuthConfigured(): boolean {
  return xCredentials() !== null;
}

/** Demo roster, switcher, and seed exist only while Sign in with X is unset. */
export function demoMode(): boolean {
  return !xAuthConfigured();
}

/**
 * On Vercel the database is memory unless Turso is set, so a cold start drops members.
 * Local dev still keeps data/botdate.sqlite, and this note stays quiet there.
 */
export function coldStartNote(): string | null {
  if (demoMode()) return null;
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const token = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (url && token) return null;
  if (!process.env.VERCEL) return null;
  return "Member data won't survive cold starts without Turso.";
}
