import { oauthJson, registerMcpClient } from "@/lib/agent/oauth";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 16_000) return oauthJson({ error: "invalid_client_metadata", error_description: "That body is too large." }, 400);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return oauthJson({ error: "invalid_client_metadata", error_description: "Send JSON." }, 400);
  }
  const result = await withDb((ctx) => registerMcpClient(ctx, payload));
  return oauthJson(result.body, result.status);
}
