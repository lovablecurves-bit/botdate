import { callTool } from "@/lib/agent/tools";
import { authenticateAgent } from "@/lib/agent/tokens";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";
import { readPrivatePrefs } from "@/lib/private-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  return withDb((ctx) => {
    const auth = authenticateAgent(ctx, request.headers.get("authorization"));
    if (!auth.ok) return json(auth.status, auth.body);
    const stored = readPrivatePrefs(ctx, auth.member.id);
    if (!stored.ok) return json(stored.error.includes("PREFS_KEY") ? 503 : 409, { error: stored.error });
    return json(200, { prefs: stored.answers ?? {} });
  });
}

export async function PUT(request: Request) {
  const text = await request.text();
  if (text.length > 20_000) return json(400, { error: "That body is too large." });
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: "Send JSON." });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Send a JSON object of answers." });
  return withDb((ctx) => {
    const auth = authenticateAgent(ctx, request.headers.get("authorization"));
    if (!auth.ok) return json(auth.status, auth.body);
    const saved = callTool(ctx, auth.member, "set_private_prefs", body as Record<string, unknown>);
    if (!saved) return json(400, { error: "Could not store private preferences." });
    return json(saved.status, saved.body);
  });
}
