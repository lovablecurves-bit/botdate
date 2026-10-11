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
