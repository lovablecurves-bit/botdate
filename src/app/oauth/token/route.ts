import { grantMcpToken, oauthJson, readOauthBody } from "@/lib/agent/oauth";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const form = await readOauthBody(request);
  if (!form) return oauthJson({ error: "invalid_request", error_description: "Send the token request as a form or JSON object." }, 400);
  const result = await withDb((ctx) => grantMcpToken(ctx, form));
  if (result.status !== 200 || result.reason) {
    const client = (form.client_id ?? "").slice(0, 40);
    const error = typeof result.body.error === "string" ? result.body.error : "ok";
    console.warn(
      `[botdate] MCP token ${form.grant_type ?? "?"} for ${client || "no client"}: ${result.status} ${error} (${result.reason ?? "no reason"})`,
    );
  }
  return oauthJson(result.body, result.status);
}
