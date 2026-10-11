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

function basicAuth(credentials: XCredentials): string {
  return `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`;
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
  const response = await fetchImpl(X_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(credentials),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string; error_description?: string; error?: string } | null;
  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description || payload?.error || "X did not return an access token.";
    throw new XAuthError(detail);
  }
  return payload.access_token;
}

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
