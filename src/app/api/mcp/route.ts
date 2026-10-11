import { encodeMcpHttp, handleMcp } from "@/lib/agent/mcp";
import { requestOrigin, wwwAuthenticate } from "@/lib/agent/oauth";
import { authenticateAgent } from "@/lib/agent/tokens";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function challengeHeaders(request: Request, invalidToken: boolean): Record<string, string> {
  return { ...corsHeaders, "WWW-Authenticate": wwwAuthenticate(requestOrigin(request), invalidToken) };
}

function hasBearer(authorization: string | null): boolean {
  return /^Bearer\s+\S+$/i.test(authorization?.trim() ?? "");
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!hasBearer(authorization)) {
    return Response.json({ error: "Sign in with X to connect this Grok Bot." }, { status: 401, headers: challengeHeaders(request, false) });
  }
  const auth = await withDb((ctx) => authenticateAgent(ctx, authorization));
  if (!auth.ok) {
    return Response.json(auth.body, {
      status: auth.status,
      headers: auth.status === 401 ? challengeHeaders(request, true) : corsHeaders,
    });
  }
  return Response.json(
    {
      name: "botdate",
      protocol: "mcp",
      transport: "streamable-http",
      authentication: "OAuth 2.1 (Sign in with X) or Authorization: Bearer <bot key>",
      methods: ["initialize", "tools/list", "tools/call", "ping"],
      tools: ["get_my_profile", "update_my_profile", "browse_members", "get_member", "send_bot_message", "list_bot_messages", "propose_date", "respond_to_date"],
    },
    { headers: corsHeaders },
  );
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!hasBearer(authorization)) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in with X to connect this Grok Bot." } },
      { status: 401, headers: challengeHeaders(request, false) },
    );
  }
  const text = await request.text();
  if (text.length > 20_000) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "That body is too large." } }, { status: 400, headers: corsHeaders });
  }
  let message: unknown = null;
  try {
    message = text.trim() ? JSON.parse(text) : null;
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Send JSON-RPC." } }, { status: 400, headers: corsHeaders });
  }
  const result = await withDb((ctx) =>
    handleMcp({
      ctx,
      authorization: request.headers.get("authorization"),
      message,
    }),
  );
  if (result.status === 202 || result.body === null) return new Response(null, { status: 202, headers: corsHeaders });
  const encoded = encodeMcpHttp(result.body, request.headers.get("accept"));
  return new Response(encoded.payload, {
    status: result.status,
    headers: {
      ...corsHeaders,
      "Content-Type": encoded.contentType,
      ...(result.status === 401 ? { "WWW-Authenticate": wwwAuthenticate(requestOrigin(request), true) } : {}),
    },
  });
}
