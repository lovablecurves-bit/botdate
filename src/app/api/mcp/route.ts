import { encodeMcpHttp, handleMcp } from "@/lib/agent/mcp";
import { withDb } from "@/lib/db/open";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET() {
  return Response.json(
    {
      name: "botdate",
      protocol: "mcp",
      transport: "streamable-http",
      authentication: "Authorization: Bearer <member bot key>",
      methods: ["initialize", "tools/list", "tools/call", "ping"],
      tools: ["get_my_profile", "update_my_profile", "browse_members", "get_shortlist", "get_member", "send_bot_message", "list_bot_messages", "propose_date", "respond_to_date"],
    },
    { headers: corsHeaders },
  );
}

export async function POST(request: Request) {
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
    headers: { ...corsHeaders, "Content-Type": encoded.contentType },
  });
}
