import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const BOT_OAUTH_MODE = "bot";
const STATE_TTL_SECONDS = 600;

export type BotStateRead = { trusted: false } | { trusted: true; fresh: false } | { trusted: true; fresh: true; nonce: string; exp: number };

function macEqual(actual: string, expected: string): boolean {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Signed OAuth state. The payload includes mode=bot so the shared callback can branch. */
export function signBotOAuthState(secret: string, now = Date.now()): string {
  if (!secret) throw new Error("SESSION_SECRET is required to sign the BotDateApp connection.");
  const payload = {
    mode: BOT_OAUTH_MODE,
    nonce: randomBytes(16).toString("base64url"),
    exp: Math.floor(now / 1000) + STATE_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readBotOAuthState(state: string, secret: string, now = Date.now()): BotStateRead {
  if (!secret || !state || state.length > 512) return { trusted: false };
  const dot = state.indexOf(".");
  if (dot <= 0 || dot !== state.lastIndexOf(".")) return { trusted: false };
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!macEqual(sig, expected)) return { trusted: false };
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as { mode?: unknown; nonce?: unknown; exp?: unknown };
    if (parsed.mode !== BOT_OAUTH_MODE) return { trusted: false };
    if (typeof parsed.nonce !== "string" || !parsed.nonce) return { trusted: false };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp)) return { trusted: false };
    if (parsed.exp * 1000 <= now) return { trusted: true, fresh: false };
    return { trusted: true, fresh: true, nonce: parsed.nonce, exp: parsed.exp };
  } catch {
    return { trusted: false };
  }
}
