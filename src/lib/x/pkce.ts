import { createHash, randomBytes } from "node:crypto";

const VERIFIER_MIN = 43;
const VERIFIER_MAX = 128;

/** RFC 4648 §5 base64url with the trailing '=' padding removed. */
function base64UrlEncode(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function assertVerifierLength(verifier: string): void {
  if (verifier.length < VERIFIER_MIN || verifier.length > VERIFIER_MAX) {
    throw new Error(`PKCE code_verifier must be ${VERIFIER_MIN}-${VERIFIER_MAX} characters.`);
  }
}

export function randomVerifier(): string {
  // 32 bytes is 43 unpadded base64url characters, the RFC 7636 minimum.
  const verifier = base64UrlEncode(randomBytes(32));
  assertVerifierLength(verifier);
  return verifier;
}

export function randomState(): string {
  return randomBytes(16).toString("base64url");
}

/** S256 code challenge from RFC 7636: unpadded base64url(SHA-256(verifier)). */
export function codeChallenge(verifier: string): string {
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  if (challenge.includes("=") || challenge.includes("+") || challenge.includes("/")) {
    throw new Error("PKCE code_challenge must be unpadded base64url.");
  }
  return challenge;
}

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_ME_URL = "https://api.x.com/2/users/me";
/** Member sign-in. Learning from posts adds offline.access. BotDateApp auto-posting uses X_BOT_SCOPES. */
export const X_SCOPES = "users.read tweet.read";
export const X_LEARN_SCOPES = "users.read tweet.read offline.access";
export const X_BOT_SCOPES = "tweet.read tweet.write users.read offline.access";

export function authorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
  scopes?: string;
}): string {
  assertVerifierLength(input.verifier);
  const params: Array<[string, string]> = [
    ["response_type", "code"],
    ["client_id", input.clientId],
    ["redirect_uri", input.redirectUri],
    ["scope", input.scopes ?? X_SCOPES],
    ["state", input.state],
    ["code_challenge", codeChallenge(input.verifier)],
    ["code_challenge_method", "S256"],
  ];
  // URLSearchParams encodes a space as '+'. X rejects that on the authorize page, so every
  // parameter is percent-encoded and the scope space stays %20.
  const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return `${X_AUTHORIZE_URL}?${query}`;
}
