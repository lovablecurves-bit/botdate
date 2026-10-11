import type { BotDateDb } from "../db/open";
import { BotPosterError, ensureBotAccessToken } from "./bot-credentials";

type FetchLike = typeof fetch;

const TWEET_ID = /^\d{1,32}$/;

/**
 * Pin a post on the authenticated account.
 * This follows the v2 pinned-lists shape (POST /2/users/:id/pinned_tweets).
 * The call uses tweet.write and users.read. Those scopes are already on the bot token.
 */
export function xPinTweetUrl(userId: string): string {
  return `https://api.x.com/2/users/${encodeURIComponent(userId)}/pinned_tweets`;
}

export function parsePinBody(body: unknown): { ok: true; tweetId: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const tweetId = (body as { tweet_id?: unknown }).tweet_id;
  if (typeof tweetId !== "string" || !TWEET_ID.test(tweetId)) return { ok: false, error: "tweet_id must be a post id." };
  return { ok: true, tweetId };
}

export async function pinBotTweet(
  ctx: BotDateDb,
  tweetId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ tweetId: string }> {
  const { accessToken, xUserId } = await ensureBotAccessToken(ctx, { fetchImpl });
  let response: Response;
  try {
    response = await fetchImpl(xPinTweetUrl(xUserId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tweet_id: tweetId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new BotPosterError("X did not respond.", 502);
  }
  const json = (await response.json().catch(() => null)) as { data?: { pinned?: unknown } } | null;
  if (!response.ok || json?.data?.pinned === false) throw new BotPosterError("X did not pin the post.", 502);
  return { tweetId };
}
