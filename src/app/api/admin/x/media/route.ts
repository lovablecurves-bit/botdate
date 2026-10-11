import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { posterAuthorized } from "@/lib/x/admin-auth";
import { BotPosterError } from "@/lib/x/bot-credentials";
import { uploadBotVideo } from "@/lib/x/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

function isMp4Request(contentType: string | null): boolean {
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  return type === "video/mp4" || type === "application/octet-stream";
}

export async function POST(request: Request) {
  if (!posterAuthorized(request.headers.get("authorization"))) return jsonError("unauthorized", 401);
  if (!isMp4Request(request.headers.get("content-type"))) return jsonError("Expected an MP4 body.", 400);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return jsonError("Expected an MP4 body.", 400);
  }
  if (bytes.byteLength < 1) return jsonError("Expected an MP4 body.", 400);
  try {
    const result = await withDb((db) => uploadBotVideo(db, bytes));
    return NextResponse.json({ media_id: result.mediaId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof BotPosterError) return jsonError(error.message, error.status);
    console.error(`BotDateApp media upload failed: ${error instanceof Error ? error.name : "Error"}`);
    return jsonError("X did not accept the video.", 502);
  }
}
