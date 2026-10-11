import type { BotDateDb } from "../db/open";
import { BotPosterError, ensureBotAccessToken } from "./bot-credentials";

type FetchLike = typeof fetch;

export const X_MEDIA_INIT_URL = "https://api.x.com/2/media/upload/initialize";
/** X asks for segments at or below 5 MB. The server maximum is 8 MB. */
export const MEDIA_CHUNK_BYTES = 5 * 1024 * 1024;
const MEDIA_ID = /^\d{1,19}$/;
const MAX_POLLS = 15;
const MAX_POLL_WAIT_MS = 5_000;

export function xMediaAppendUrl(mediaId: string): string {
  return `https://api.x.com/2/media/upload/${mediaId}/append`;
}

export function xMediaFinalizeUrl(mediaId: string): string {
  return `https://api.x.com/2/media/upload/${mediaId}/finalize`;
}

export function xMediaStatusUrl(mediaId: string): string {
  const url = new URL("https://api.x.com/2/media/upload");
  url.searchParams.set("command", "STATUS");
  url.searchParams.set("media_id", mediaId);
  return url.toString();
}

type Processing = { state: string; checkAfterSecs: number | null };

export type UploadOptions = {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  chunkBytes?: number;
};

export async function uploadBotVideo(
  ctx: BotDateDb,
  bytes: Uint8Array,
  options: UploadOptions = {},
): Promise<{ mediaId: string }> {
  if (bytes.byteLength < 1) throw new BotPosterError("Expected an MP4 body.", 400);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? delay;
  const chunkBytes = options.chunkBytes ?? MEDIA_CHUNK_BYTES;
  if (!Number.isInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MEDIA_CHUNK_BYTES) {
    throw new BotPosterError("Expected an MP4 body.", 400);
  }

  const { accessToken } = await ensureBotAccessToken(ctx, { fetchImpl });
  const mediaId = await initializeUpload(fetchImpl, accessToken, bytes.byteLength);
  let segment = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.byteLength));
    await appendChunk(fetchImpl, accessToken, mediaId, segment, chunk);
    segment += 1;
  }
  const processing = await finalizeUpload(fetchImpl, accessToken, mediaId);
  if (processing && processing.state !== "succeeded") {
    await waitUntilSucceeded(fetchImpl, accessToken, mediaId, sleep);
  }
  return { mediaId };
}

async function initializeUpload(fetchImpl: FetchLike, accessToken: string, totalBytes: number): Promise<string> {
  const response = await xFetch(fetchImpl, X_MEDIA_INIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "video/mp4",
      total_bytes: totalBytes,
      media_category: "tweet_video",
    }),
  });
  const json = await response.json().catch(() => null);
  const id = readId(json);
  if (!response.ok || !id) throw new BotPosterError("X did not accept the video.", 502);
  return id;
}

async function appendChunk(
  fetchImpl: FetchLike,
  accessToken: string,
  mediaId: string,
  segmentIndex: number,
  chunk: Uint8Array,
): Promise<void> {
  const form = new FormData();
  form.set("segment_index", String(segmentIndex));
  const copy = new ArrayBuffer(chunk.byteLength);
  new Uint8Array(copy).set(chunk);
  form.set("media", new Blob([copy], { type: "video/mp4" }), "chunk.mp4");
  const response = await xFetch(fetchImpl, xMediaAppendUrl(mediaId), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!response.ok) throw new BotPosterError("X did not accept the video.", 502);
  await response.arrayBuffer().catch(() => null);
}

async function finalizeUpload(fetchImpl: FetchLike, accessToken: string, mediaId: string): Promise<Processing | null> {
  const response = await xFetch(fetchImpl, xMediaFinalizeUrl(mediaId), {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new BotPosterError("X did not accept the video.", 502);
  const processing = readProcessing(json);
  if (processing?.state === "failed") throw new BotPosterError("X did not finish processing the video.", 502);
  return processing;
}

async function waitUntilSucceeded(
  fetchImpl: FetchLike,
  accessToken: string,
  mediaId: string,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    const response = await xFetch(fetchImpl, xMediaStatusUrl(mediaId), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new BotPosterError("X did not finish processing the video.", 502);
    const processing = readProcessing(json);
    if (!processing || processing.state === "succeeded") return;
    if (processing.state === "failed") throw new BotPosterError("X did not finish processing the video.", 502);
    const seconds = processing.checkAfterSecs ?? 1;
    await sleep(Math.min(Math.max(seconds, 0), MAX_POLL_WAIT_MS / 1000) * 1000);
  }
  throw new BotPosterError("X did not finish processing the video.", 502);
}

function readId(json: unknown): string {
  const data = json && typeof json === "object" ? (json as { data?: { id?: unknown } }).data : undefined;
  return data && typeof data.id === "string" && MEDIA_ID.test(data.id) ? data.id : "";
}

function readProcessing(json: unknown): Processing | null {
  const data = json && typeof json === "object" ? (json as { data?: { processing_info?: unknown } }).data : undefined;
  const info = data?.processing_info;
  if (!info || typeof info !== "object") return null;
  const record = info as { state?: unknown; check_after_secs?: unknown };
  const state = typeof record.state === "string" ? record.state : "";
  const checkAfterSecs =
    typeof record.check_after_secs === "number" && Number.isFinite(record.check_after_secs) ? record.check_after_secs : null;
  return { state, checkAfterSecs };
}

async function xFetch(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new BotPosterError("X did not respond.", 502);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
