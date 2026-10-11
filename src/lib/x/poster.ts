import type { BotDateDb } from "../db/open";
import { BotPosterError, ensureBotAccessToken } from "./bot-credentials";

type FetchLike = typeof fetch;

export const X_TWEETS_URL = "https://api.x.com/2/tweets";
const TWEET_ID = /^\d{1,32}$/;

export type PostInput = { text: string; replyToId: string | null };

export function parsePostBody(body: unknown): { ok: true; value: PostInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const record = body as Record<string, unknown>;
  if (typeof record.text !== "string" || !record.text.trim() || record.text.length > 25000) {
    return { ok: false, error: "text is required." };
  }
  if (record.reply_to_id == null || record.reply_to_id === "") {
    return { ok: true, value: { text: record.text, replyToId: null } };
  }
  if (typeof record.reply_to_id !== "string" || !TWEET_ID.test(record.reply_to_id)) {
    return { ok: false, error: "reply_to_id must be a post id." };
  }
  return { ok: true, value: { text: record.text, replyToId: record.reply_to_id } };
}

export function parseSinceId(value: string | null): { ok: true; sinceId: string | null } | { ok: false } {
  if (value == null || value === "") return { ok: true, sinceId: null };
  if (!TWEET_ID.test(value)) return { ok: false };
  return { ok: true, sinceId: value };
}

export function xUserMentionsUrl(userId: string, sinceId: string | null): string {
  const url = new URL(`https://api.x.com/2/users/${encodeURIComponent(userId)}/mentions`);
  if (sinceId) url.searchParams.set("since_id", sinceId);
  return url.toString();
}

async function xFetch(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new BotPosterError("X did not respond.", 502);
  }
}

export async function postBotTweet(ctx: BotDateDb, input: PostInput, fetchImpl: FetchLike = fetch): Promise<{ id: string }> {
  const { accessToken } = await ensureBotAccessToken(ctx, { fetchImpl });
  const payload: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text: input.text };
  if (input.replyToId) payload.reply = { in_reply_to_tweet_id: input.replyToId };
  const response = await xFetch(fetchImpl, X_TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await response.json().catch(() => null)) as { data?: { id?: unknown } } | null;
  const id = json?.data && typeof json.data.id === "string" ? json.data.id : "";
  if (!response.ok || !TWEET_ID.test(id)) throw new BotPosterError("X did not create the post.", 502);
  return { id };
}

export type MentionsResult = { data: unknown[]; meta: Record<string, unknown> };

export async function listBotMentions(ctx: BotDateDb, sinceId: string | null, fetchImpl: FetchLike = fetch): Promise<MentionsResult> {
  const { accessToken, xUserId } = await ensureBotAccessToken(ctx, { fetchImpl });
  const response = await xFetch(fetchImpl, xUserMentionsUrl(xUserId, sinceId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await response.json().catch(() => null)) as { data?: unknown; meta?: unknown } | null;
  if (!response.ok || !json || typeof json !== "object") throw new BotPosterError("X did not return mentions.", 502);
  const data = Array.isArray(json.data) ? json.data : [];
  const meta =
    json.meta && typeof json.meta === "object" ? (json.meta as Record<string, unknown>) : { result_count: data.length };
  return { data, meta };
}
