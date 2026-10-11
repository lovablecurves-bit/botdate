import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { posterAuthorized } from "@/lib/x/admin-auth";
import { BotPosterError } from "@/lib/x/bot-credentials";
import { parsePostBody, postBotTweet } from "@/lib/x/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!posterAuthorized(request.headers.get("authorization"))) return jsonError("unauthorized", 401);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON.", 400);
  }
  const parsed = parsePostBody(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);
  try {
    const result = await withDb((db) => postBotTweet(db, parsed.value));
    return NextResponse.json({ id: result.id }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof BotPosterError) return jsonError(error.message, error.status);
    console.error(`BotDateApp post failed: ${error instanceof Error ? error.name : "Error"}`);
    return jsonError("X did not create the post.", 502);
  }
}
