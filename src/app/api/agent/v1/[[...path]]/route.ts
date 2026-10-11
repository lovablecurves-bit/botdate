import { dispatchAgent } from "@/lib/agent/dispatch";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function handle(request: Request): Promise<Response> {
  let body: unknown = null;
  if (request.method === "POST" || request.method === "PATCH") {
    const text = await request.text();
    if (text.length > 20_000) return json(400, { error: "That body is too large." });
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: "Send JSON." });
      }
    }
  }
  const url = new URL(request.url);
  const result = await withDb((ctx) =>
    dispatchAgent({
      ctx,
      authorization: request.headers.get("authorization"),
      method: request.method,
      pathname: url.pathname,
      body,
    }),
  );
  return json(result.status, result.body);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
