import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { posterAuthorized } from "@/lib/x/admin-auth";
import { BotPosterError } from "@/lib/x/bot-credentials";
import { listBotMentions, parseSinceId } from "@/lib/x/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  if (!posterAuthorized(request.headers.get("authorization"))) return jsonError("unauthorized", 401);
  const since = parseSinceId(new URL(request.url).searchParams.get("since_id"));
  if (!since.ok) return jsonError("since_id must be a post id.", 400);
  try {
    const result = await withDb((db) => listBotMentions(db, since.sinceId));
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof BotPosterError) return jsonError(error.message, error.status);
    console.error(`BotDateApp mentions failed: ${error instanceof Error ? error.name : "Error"}`);
    return jsonError("X did not return mentions.", 502);
  }
}
