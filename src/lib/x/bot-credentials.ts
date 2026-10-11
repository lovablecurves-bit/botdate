import { eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { xBotCredentials } from "../db/schema";
import { xCredentials } from "./config";
import { XAuthError, refreshBotAccessToken } from "./oauth";
import { openSecret, requireSessionSecret, sealSecret } from "./seal";

type FetchLike = typeof fetch;

export const BOT_CREDENTIAL_ID = "botdateapp";
export const BOTDATE_APP_USERNAME = "BotDateApp";
/** Refresh when fewer than five minutes remain on the two-hour access token. */
export const REFRESH_IF_REMAINING_LT_MS = 5 * 60 * 1000;

export class BotPosterError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BotPosterError";
    this.status = status;
  }
}

export function isBotDateAppUsername(username: string): boolean {
  return username.replace(/^@/, "").trim().toLowerCase() === BOTDATE_APP_USERNAME.toLowerCase();
}

export function shouldRefreshAccessToken(expiresAtMs: number, now = Date.now()): boolean {
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs - now < REFRESH_IF_REMAINING_LT_MS;
}

export type BotCredentialInput = {
  xUserId: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  secret: string;
  now?: number;
};

export function saveBotCredentials(ctx: BotDateDb, input: BotCredentialInput): void {
  if (!/^\d{1,32}$/.test(input.xUserId)) throw new BotPosterError("X did not return the BotDateApp account.", 502);
  if (!isBotDateAppUsername(input.username)) throw new BotPosterError("The X account must be @BotDateApp.", 403);
  if (!input.accessToken || !input.refreshToken) throw new BotPosterError("X did not return BotDateApp tokens.", 502);
  if (!input.secret) throw new BotPosterError("SESSION_SECRET is required.", 503);
  const values = {
    xUserId: input.xUserId,
    username: input.username.replace(/^@/, "").trim(),
    accessTokenCiphertext: sealSecret(input.accessToken, input.secret),
    refreshTokenCiphertext: sealSecret(input.refreshToken, input.secret),
    expiresAt: input.expiresAt,
    updatedAt: new Date(input.now ?? Date.now()).toISOString(),
  };
  const existing = ctx.db.select().from(xBotCredentials).where(eq(xBotCredentials.id, BOT_CREDENTIAL_ID)).get();
  if (existing) {
    ctx.db.update(xBotCredentials).set(values).where(eq(xBotCredentials.id, BOT_CREDENTIAL_ID)).run();
    return;
  }
  ctx.db.insert(xBotCredentials).values({ id: BOT_CREDENTIAL_ID, ...values }).run();
}

export type BotAccess = { accessToken: string; xUserId: string };

/**
 * Return a usable BotDateApp access token, refreshing it when under five minutes remain.
 * The rotated refresh token from X is saved on every refresh.
 */
export async function ensureBotAccessToken(
  ctx: BotDateDb,
  options: { fetchImpl?: FetchLike; now?: number } = {},
): Promise<BotAccess> {
  const secret = readRequiredSecret();
  const row = ctx.db.select().from(xBotCredentials).where(eq(xBotCredentials.id, BOT_CREDENTIAL_ID)).get();
  if (!row) throw new BotPosterError("BotDateApp is not connected.", 503);
  if (!/^\d{1,32}$/.test(row.xUserId)) throw new BotPosterError("Stored BotDateApp account could not be read.", 503);

  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = openSecret(row.accessTokenCiphertext, secret);
    refreshToken = openSecret(row.refreshTokenCiphertext, secret);
  } catch {
    throw new BotPosterError("Stored BotDateApp tokens could not be read.", 503);
  }

  const now = options.now ?? Date.now();
  if (!shouldRefreshAccessToken(Date.parse(row.expiresAt), now)) {
    return { accessToken, xUserId: row.xUserId };
  }

  const credentials = xCredentials();
  if (!credentials) throw new BotPosterError("Sign in with X is not configured.", 503);
  const fetchImpl = options.fetchImpl ?? fetch;
  let grant: { accessToken: string; refreshToken: string; expiresIn: number };
  try {
    grant = await refreshBotAccessToken(credentials, refreshToken, fetchImpl);
  } catch (error) {
    if (error instanceof XAuthError) {
      console.error("BotDateApp token refresh failed.");
      throw new BotPosterError("X did not refresh the BotDateApp token.", 502);
    }
    throw error;
  }

  const expiresAt = new Date(now + grant.expiresIn * 1000).toISOString();
  saveBotCredentials(ctx, {
    xUserId: row.xUserId,
    username: row.username,
    accessToken: grant.accessToken,
    refreshToken: grant.refreshToken,
    expiresAt,
    secret,
    now,
  });
  return { accessToken: grant.accessToken, xUserId: row.xUserId };
}

function readRequiredSecret(): string {
  try {
    return requireSessionSecret();
  } catch {
    throw new BotPosterError("SESSION_SECRET is required.", 503);
  }
}
