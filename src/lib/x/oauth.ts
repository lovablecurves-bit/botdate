import { X_ME_URL, X_TOKEN_URL } from "./pkce";
import { xProfileFromPayload, type XProfile } from "./profile";
import type { XCredentials } from "./config";

type FetchLike = typeof fetch;

export class XAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XAuthError";
  }
}

export type XCallbackError = {
  error: string;
  error_description: string | null;
};

/** Exact `error` and `error_description` query params from X's authorize redirect. */
export function readOAuthCallbackError(params: URLSearchParams): XCallbackError | null {
  const error = params.get("error");
  if (!error) return null;
  return { error, error_description: params.get("error_description") };
}

export function logOAuthCallbackError(callbackError: XCallbackError): void {
  console.error(`X OAuth callback error=${callbackError.error} error_description=${callbackError.error_description ?? ""}`);
}

/** Login-page copy. Includes both X values when the callback received them. */
export function loginErrorText(error?: string | null, errorDescription?: string | null): string | null {
  if (error && errorDescription) return `${error}: ${errorDescription}`;
  return error || errorDescription || null;
}

function basicAuth(credentials: XCredentials): string {
  return `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`;
}

/** X access tokens last two hours unless the token response says otherwise. */
export const DEFAULT_ACCESS_TOKEN_SECONDS = 2 * 60 * 60;

export function normalizeExpiresIn(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return DEFAULT_ACCESS_TOKEN_SECONDS;
}

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
};

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error_description?: string;
  error?: string;
};

async function requestOAuthToken(credentials: XCredentials, body: URLSearchParams, fetchImpl: FetchLike): Promise<OAuthTokenSet> {
  const response = await fetchImpl(X_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(credentials),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const payload = (await response.json().catch(() => null)) as TokenJson | null;
  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description || payload?.error || "X did not return an access token.";
    throw new XAuthError(detail);
  }
  const refresh = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : "";
  return {
    accessToken: payload.access_token,
    refreshToken: refresh || null,
    expiresIn: normalizeExpiresIn(payload.expires_in),
  };
}

function requireRefreshToken(grant: OAuthTokenSet): { accessToken: string; refreshToken: string; expiresIn: number } {
  if (!grant.refreshToken) throw new XAuthError("X did not return a refresh token.");
  return { accessToken: grant.accessToken, refreshToken: grant.refreshToken, expiresIn: grant.expiresIn };
}

export async function exchangeAuthorizationCode(
  credentials: XCredentials,
  code: string,
  verifier: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: credentials.redirectUri,
    code_verifier: verifier,
  });
  const grant = await requestOAuthToken(credentials, body, fetchImpl);
  return grant.accessToken;
}

/** BotDateApp connect. Member sign-in keeps exchangeAuthorizationCode and ignores any refresh token. */
export async function exchangeBotAuthorizationCode(
  credentials: XCredentials,
  code: string,
  verifier: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: credentials.redirectUri,
    code_verifier: verifier,
  });
  return requireRefreshToken(await requestOAuthToken(credentials, body, fetchImpl));
}

/** Confidential-client refresh. X rotates the refresh token, so the caller must store the new one. */
export async function refreshBotAccessToken(
  credentials: XCredentials,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return requireRefreshToken(await requestOAuthToken(credentials, body, fetchImpl));
}

/** One users/me call per OAuth callback. Page loads and session checks read the stored row. */
export async function fetchXProfile(accessToken: string, fetchImpl: FetchLike = fetch): Promise<XProfile> {
  const url = new URL(X_ME_URL);
  url.searchParams.set("user.fields", "description,profile_image_url");
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : "X did not return your profile.";
    throw new XAuthError(detail);
  }
  const profile = xProfileFromPayload(payload);
  if (!profile) throw new XAuthError("X returned a profile BotDate could not read.");
  return profile;
}
