import { authenticateAgent } from "@/lib/agent/tokens";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";
import { checkMatch } from "@/lib/match-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 4_000) return json(400, { error: "That body is too large." });
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: "Send JSON." });
    }
  }
  const other = body && typeof body === "object" && !Array.isArray(body) ? (body as { other_member_id?: unknown }).other_member_id : undefined;
  if (typeof other !== "string") return json(400, { error: "Send other_member_id." });
  return withDb((ctx) => {
    const auth = authenticateAgent(ctx, request.headers.get("authorization"));
    if (!auth.ok) return json(auth.status, auth.body);
    const result = checkMatch(ctx, auth.member.id, other);
    return json(result.status, result.body);
  });
}
