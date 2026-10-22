import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { posterAuthorized } from "@/lib/x/admin-auth";
import { BotPosterError } from "@/lib/x/bot-credentials";
import { XPostError, deleteBotTweet } from "@/lib/x/poster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST {"id": "<post id>"} with Authorization: Bearer <POSTER_SECRET>. Deletes one of the bot's own posts. */
export async function POST(request: Request) {
  if (!posterAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^\d{1,32}$/.test(id)) return NextResponse.json({ error: "id must be a post id." }, { status: 400, headers: NO_STORE });
  try {
    const result = await withDb((db) => deleteBotTweet(db, id));
    console.log(`[botdate] admin x delete ${id}`);
    return NextResponse.json({ id, ...result }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof XPostError) {
      console.error(`BotDateApp delete rejected by X: status ${error.xStatus}: ${error.xError}`);
      return NextResponse.json({ error: error.message, x_status: error.xStatus, x_error: error.xError }, { status: 502, headers: NO_STORE });
    }
    if (error instanceof BotPosterError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return NextResponse.json({ error: "X did not delete the post." }, { status: 502, headers: NO_STORE });
  }
}
