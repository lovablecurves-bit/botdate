import { metadataJson, protectedResourceMetadata, requestOrigin } from "@/lib/agent/oauth";
import { corsHeaders } from "@/lib/http/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function GET(request: Request) {
  return metadataJson(protectedResourceMetadata(requestOrigin(request)));
}
