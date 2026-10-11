export type XProfile = {
  xUserId: string;
  handle: string;
  name: string;
  bio: string;
  avatarUrl: string;
  /** ISO time from X. Empty when the payload omitted created_at. */
  createdAt?: string;
  followers?: number;
  verified?: boolean;
};

const AVATAR_HOSTS = new Set(["pbs.twimg.com", "abs.twimg.com"]);

export function largerAvatar(url: string): string {
  return url.replace("_normal.", "_400x400.");
}

/** Keep only https avatars hosted by X. Anything else is dropped. */
export function safeAvatarUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(largerAvatar(value));
    if (url.protocol !== "https:") return "";
    if (!AVATAR_HOSTS.has(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function xProfileFromPayload(payload: unknown): XProfile | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const xUserId = typeof row.id === "string" ? row.id.trim() : "";
  const handle = typeof row.username === "string" ? row.username.replace(/^@/, "").trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const bio = typeof row.description === "string" ? row.description.trim() : "";
  if (!/^\d{1,32}$/.test(xUserId)) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  const metrics = row.public_metrics;
  const followers =
    metrics && typeof metrics === "object" && typeof (metrics as { followers_count?: unknown }).followers_count === "number"
      ? (metrics as { followers_count: number }).followers_count
      : 0;
  const verifiedType = typeof row.verified_type === "string" ? row.verified_type : "";
  const verified = row.verified === true || verifiedType === "blue" || verifiedType === "business" || verifiedType === "government";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  return {
    xUserId,
    handle,
    name: name || handle,
    bio,
    avatarUrl: safeAvatarUrl(row.profile_image_url),
    createdAt,
    followers,
    verified,
  };
}
