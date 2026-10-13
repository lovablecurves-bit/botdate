import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two secrets without leaking the expected value through an early length check.
 * An unset expected secret never matches, including an empty provided value.
 */
export function secretMatches(expected: string | undefined, provided: string): boolean {
  const secret = expected?.trim() ?? "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(provided).digest();
  const equal = timingSafeEqual(a, b);
  return secret.length > 0 && provided.length > 0 && equal;
}

export function bearerToken(header: string | null): string {
  if (!header) return "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? "";
}

export function adminKeyAuthorized(key: string | null): boolean {
  return secretMatches(process.env.ADMIN_SECRET, key ?? "");
}

export function posterAuthorized(authorization: string | null): boolean {
  return secretMatches(process.env.POSTER_SECRET, bearerToken(authorization));
}

/** GET /api/admin/signups. Unset ADMIN_TOKEN never authorizes. */
export function adminTokenAuthorized(authorization: string | null): boolean {
  return secretMatches(process.env.ADMIN_TOKEN, bearerToken(authorization));
}
