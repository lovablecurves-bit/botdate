import type { BotDateDb } from "../db/open";
import { BotPosterError, ensureBotAccessToken } from "./bot-credentials";

type FetchLike = typeof fetch;

export const X_TWEETS_URL = "https://api.x.com/2/tweets";
const TWEET_ID = /^\d{1,32}$/;
const MEDIA_ID = /^\d{1,19}$/;

export type PostInput = { text: string; replyToId: string | null; mediaIds: string[] | null };

export function parsePostBody(body: unknown): { ok: true; value: PostInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Expected a JSON object." };
  const record = body as Record<string, unknown>;
  if (typeof record.text !== "string" || !record.text.trim() || record.text.length > 25000) {
    return { ok: false, error: "text is required." };
  }
  const mediaIds = parseMediaIds(record.media_ids);
  if (!mediaIds.ok) return mediaIds;
  if (record.reply_to_id == null || record.reply_to_id === "") {
    return { ok: true, value: { text: record.text, replyToId: null, mediaIds: mediaIds.value } };
  }
  if (typeof record.reply_to_id !== "string" || !TWEET_ID.test(record.reply_to_id)) {
    return { ok: false, error: "reply_to_id must be a post id." };
  }
  return { ok: true, value: { text: record.text, replyToId: record.reply_to_id, mediaIds: mediaIds.value } };
}

function parseMediaIds(value: unknown): { ok: true; value: string[] | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, value: null };
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    return { ok: false, error: "media_ids must be 1 to 4 media ids." };
  }
  if (value.some((id) => typeof id !== "string" || !MEDIA_ID.test(id))) {
    return { ok: false, error: "media_ids must be 1 to 4 media ids." };
  }
  return { ok: true, value: value };
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
  const payload: { text: string; reply?: { in_reply_to_tweet_id: string }; media?: { media_ids: string[] } } = {
    text: input.text,
  };
  if (input.replyToId) payload.reply = { in_reply_to_tweet_id: input.replyToId };
  if (input.mediaIds?.length) payload.media = { media_ids: input.mediaIds };
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
  if (!response.ok || !TWEET_ID.test(id)) throw new XPostError(response.status, redact(describeXError(json), accessToken));
  return { id };
}

/** X refused the post. Carries X's own status code and error text so callers can see why. */
export class XPostError extends BotPosterError {
  readonly xStatus: number;
  readonly xError: string;

  constructor(xStatus: number, xError: string) {
    super(`X did not create the post (X status ${xStatus}): ${xError}`, 502);
    this.name = "XPostError";
    this.xStatus = xStatus;
    this.xError = xError;
  }
}

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

/** Pull the human-readable reason out of an X API v2 error body. */
export function describeXError(json: unknown): string {
  if (!json || typeof json !== "object") return "X returned no error details.";
  const record = json as Record<string, unknown>;
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim() && !parts.includes(value.trim())) parts.push(value.trim());
  };
  add(record.title);
  add(record.detail);
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (item && typeof item === "object") {
        const err = item as Record<string, unknown>;
        add(err.title);
        add(err.detail);
        add(err.message);
      }
    }
  }
  if (!parts.length) {
    const raw = JSON.stringify(json);
    return raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
  }
  return parts.join(" | ").slice(0, 1000);
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
