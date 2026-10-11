import { createHmac, timingSafeEqual } from "node:crypto";
import { voiceForPronouns, type Member } from "./types";

/** Signed session. The value is an HMAC JWT, not a bare user id. */
export const SESSION_COOKIE = "botdate_session";
export const LEGACY_SESSION_COOKIE = "botdate_uid";
export const OAUTH_STATE_COOKIE = "botdate_x_state";
export const OAUTH_VERIFIER_COOKIE = "botdate_x_verifier";
/** Set only while the member is opting in to learn from their own posts. */
export const OAUTH_LEARN_COOKIE = "botdate_x_learn";
/** Separate from member sign-in so connecting @BotDateApp does not clobber a login in progress. */
export const BOT_OAUTH_STATE_COOKIE = "botdate_x_bot_state";
export const BOT_OAUTH_VERIFIER_COOKIE = "botdate_x_bot_verifier";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const DEMO_SECRET = "botdate-demo-session-v1";

export type SessionClaims = {
  /** BotDate member id, for example `x_42`. */
  id: string;
  xUserId: string;
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  connectSeen: boolean;
  locked: boolean;
  founder: boolean;
  memberNumber: number | null;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  exp: number;
};

type SessionEnv = {
  SESSION_SECRET?: string;
  X_CLIENT_SECRET?: string;
  VERCEL?: string;
  [key: string]: string | undefined;
};

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function b64url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64url");
}

/**
 * SESSION_SECRET wins. Otherwise the key is derived from X_CLIENT_SECRET so a
 * deploy that already has X OAuth can sign sessions without a new variable.
 * The demo login uses a fixed key only when both are unset.
 */
export function sessionSecret(env: SessionEnv = process.env): string {
  const explicit = env.SESSION_SECRET?.trim() ?? "";
  if (explicit) return explicit;
  const clientSecret = env.X_CLIENT_SECRET?.trim() ?? "";
  if (clientSecret) return createHmac("sha256", "botdate-session-v1").update(clientSecret).digest("base64url");
  return DEMO_SECRET;
}

function defaultExp(now = Date.now()): number {
  return Math.floor(now / 1000) + MAX_AGE_SECONDS;
}

export function claimsFromMember(member: Member, exp = defaultExp()): SessionClaims {
  return {
    id: member.id,
    xUserId: member.xAccount?.userId ?? "",
    handle: clip(member.xAccount?.handle ?? "", 15),
    name: clip(member.displayName, 80),
    avatar: clip(member.xAccount?.avatarUrl ?? "", 500),
    bio: clip(member.profile.bio, 500),
    connectSeen: member.connectSeen,
    locked: member.prefs.locked,
    founder: member.founder,
    memberNumber: member.memberNumber,
    subscriptionStatus: member.subscriptionStatus,
    stripeCustomerId: member.stripeCustomerId,
    exp,
  };
}

export function signSession(claims: SessionClaims, secret = sessionSecret()): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export function verifySession(token: string, secret = sessionSecret(), now = Date.now()): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  if (!header || !body || !signature) return null;
  const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString()) as { alg?: string };
    if (parsedHeader.alg !== "HS256") return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<SessionClaims>;
    if (!safeId(parsed.id)) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= now) return null;
    if (typeof parsed.handle !== "string" || typeof parsed.name !== "string") return null;
    if (typeof parsed.avatar !== "string" || typeof parsed.bio !== "string") return null;
    return {
      id: parsed.id,
      xUserId: typeof parsed.xUserId === "string" ? parsed.xUserId : "",
      handle: parsed.handle,
      name: parsed.name,
      avatar: parsed.avatar,
      bio: parsed.bio,
      connectSeen: parsed.connectSeen === true,
      locked: parsed.locked === true,
      founder: parsed.founder === true,
      memberNumber: typeof parsed.memberNumber === "number" ? parsed.memberNumber : null,
      subscriptionStatus: typeof parsed.subscriptionStatus === "string" ? parsed.subscriptionStatus : null,
      stripeCustomerId: typeof parsed.stripeCustomerId === "string" ? parsed.stripeCustomerId : null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

const ACCENTS = ["#ff2d92", "#ff3d6e", "#ff4db8", "#ff1744", "#ff5c8a"];

function accentFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % ACCENTS.length;
  return ACCENTS[hash] ?? ACCENTS[0];
}

/** A member the app can render when this instance has no database row. */
export function memberFromClaims(claims: SessionClaims): Member {
  const handle = claims.handle.replace(/^@/, "").trim();
  const pronouns = "they/them";
  const name = claims.name.trim() || handle || "Member";
  return {
    id: claims.id,
    email: `${claims.id}@x.botdate`,
    displayName: name,
    botPaused: false,
    profile: {
      age: 30,
      city: "San Francisco",
      occupation: "New here",
      bio: claims.bio.trim() || "Signed in with X.",
      pronouns,
      smoking: false,
      kids: "open",
      intent: "serious",
      interests: [],
      accent: accentFor(claims.id),
      voice: voiceForPronouns(pronouns),
    },
    prefs: {
      ageMin: 25,
      ageMax: 45,
      cities: ["San Francisco"],
      smoking: "no",
      kids: "any",
      intent: "any",
      niceToHaves: "",
      locked: claims.locked,
    },
    xAccount: handle
      ? { userId: claims.xUserId || claims.id.replace(/^x_/, ""), handle, avatarUrl: claims.avatar }
      : null,
    founder: claims.founder,
    memberNumber: claims.memberNumber,
    connectSeen: claims.connectSeen,
    stripeCustomerId: claims.stripeCustomerId,
    stripeSubscriptionId: null,
    subscriptionStatus: claims.subscriptionStatus,
  };
}

export function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true as const, secure, sameSite: "lax" as const, path: "/", maxAge: MAX_AGE_SECONDS };
}

/** PKCE state and verifier must be sent on the top-level return from X. */
export function oauthCookieOptions(secure: boolean) {
  return { httpOnly: true as const, secure, sameSite: "lax" as const, path: "/", maxAge: 600 };
}

export function requestIsSecureSync(url: string, forwardedProto?: string | null): boolean {
  const forwarded = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") return true;
  try {
    if (new URL(url).protocol === "https:") return true;
  } catch {
    // Ignore a malformed URL and fall through.
  }
  return Boolean(process.env.VERCEL);
}

export function readRequestCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie");
  if (!header) return "";
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return "";
}
