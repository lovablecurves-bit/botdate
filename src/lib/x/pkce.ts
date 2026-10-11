import { createHash, randomBytes } from "node:crypto";

export function randomVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function randomState(): string {
  return randomBytes(16).toString("base64url");
}

/** S256 code challenge from RFC 7636. */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export const X_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_ME_URL = "https://api.x.com/2/users/me";
export const X_SCOPES = "users.read tweet.read";

export function authorizeUrl(input: { clientId: string; redirectUri: string; state: string; verifier: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: X_SCOPES,
    state: input.state,
    code_challenge: codeChallenge(input.verifier),
    code_challenge_method: "S256",
  });
  return `${X_AUTHORIZE_URL}?${params.toString()}`;
}
