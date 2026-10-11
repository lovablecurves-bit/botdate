import type { BotDateDb } from "../db/open";
import { dispatchAgent } from "./dispatch";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

const PROTOCOL = "2025-03-26";

const TOOLS = [
  {
    name: "get_member",
    description: "Read this member's profile, preferences, and dealbreakers.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_preferences",
    description: "Update dealbreakers and nice-to-haves. Omitted fields stay as they are. Lock them when the shortlist should go live.",
    inputSchema: {
      type: "object",
      properties: {
        age: { type: "integer" },
        city: { type: "string" },
        occupation: { type: "string" },
        bio: { type: "string" },
        pronouns: { type: "string", enum: ["she/her", "he/him", "they/them"] },
        smokes: { type: "boolean" },
        kidsStance: { type: "string", enum: ["wants", "open", "doesnt"] },
        datingIntent: { type: "string", enum: ["serious", "casual"] },
        interests: { type: "array", items: { type: "string" } },
        ageMin: { type: "integer" },
        ageMax: { type: "integer" },
        cities: { type: "array", items: { type: "string" } },
        smoking: { type: "string", enum: ["no", "any"] },
        kids: { type: "string", enum: ["wants", "doesnt", "any"] },
        intent: { type: "string", enum: ["serious", "casual", "any"] },
        niceToHaves: { type: "string" },
        locked: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_shortlist",
    description: "Fetch people who clear both sets of dealbreakers, plus any date offer waiting on this member.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_desks",
    description: "List bot-to-bot desks on the shortlist.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_desk_messages",
    description: "Read bot-to-bot notes on one desk. Human chat is not included.",
    inputSchema: {
      type: "object",
      properties: { matchId: { type: "string" } },
      required: ["matchId"],
      additionalProperties: false,
    },
  },
  {
    name: "send_desk_message",
    description: "Send a bot-to-bot note. It is delivered without a human approval. Refuses while the matchmaker is paused.",
    inputSchema: {
      type: "object",
      properties: { matchId: { type: "string" }, body: { type: "string" } },
      required: ["matchId", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_date",
    description: "Draft a date offer. It stays with this member until they approve it in BotDate. It does not go to the other person before that yes.",
    inputSchema: {
      type: "object",
      properties: {
        matchId: { type: "string" },
        local: { type: "string", description: "Pacific local time, YYYY-MM-DDTHH:mm" },
        place: { type: "string" },
        note: { type: "string" },
      },
      required: ["matchId", "local", "place"],
      additionalProperties: false,
    },
  },
] as const;

function rpcError(id: JsonRpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolCall(ctx: BotDateDb, authorization: string | null, name: string, args: Record<string, unknown>) {
  if (name === "get_member") return dispatchAgent({ ctx, authorization, method: "GET", pathname: "/api/agent/v1/me", body: null });
  if (name === "update_preferences") return dispatchAgent({ ctx, authorization, method: "PATCH", pathname: "/api/agent/v1/preferences", body: args });
  if (name === "get_shortlist") return dispatchAgent({ ctx, authorization, method: "GET", pathname: "/api/agent/v1/shortlist", body: null });
  if (name === "list_desks") return dispatchAgent({ ctx, authorization, method: "GET", pathname: "/api/agent/v1/desks", body: null });
  if (name === "get_desk_messages") {
    const matchId = typeof args.matchId === "string" ? args.matchId : "";
    return dispatchAgent({ ctx, authorization, method: "GET", pathname: `/api/agent/v1/desks/${encodeURIComponent(matchId)}/messages`, body: null });
  }
  if (name === "send_desk_message") {
    const matchId = typeof args.matchId === "string" ? args.matchId : "";
    return dispatchAgent({
      ctx,
      authorization,
      method: "POST",
      pathname: `/api/agent/v1/desks/${encodeURIComponent(matchId)}/messages`,
      body: { body: args.body },
    });
  }
  if (name === "propose_date") {
    return dispatchAgent({ ctx, authorization, method: "POST", pathname: "/api/agent/v1/dates", body: args });
  }
  return null;
}

export type McpResult = { status: number; body: unknown | null };

export function handleMcp(input: { ctx: BotDateDb; authorization: string | null; message: unknown }): McpResult {
  const message = input.message as JsonRpc;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { status: 400, body: rpcError(null, -32600, "Expected a JSON-RPC object.") };
  }
  const id = message.id ?? null;
  const method = message.method ?? "";
  if (method.startsWith("notifications/")) return { status: 202, body: null };
  if (method === "initialize") {
    const params = message.params && typeof message.params === "object" ? (message.params as { protocolVersion?: string }) : {};
    const requested = params.protocolVersion;
    const protocolVersion = requested === "2024-11-05" || requested === "2025-03-26" || requested === "2025-06-18" ? requested : PROTOCOL;
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "botdate", version: "0.1.0" },
        },
      },
    };
  }
  if (method === "tools/list") {
    return { status: 200, body: { jsonrpc: "2.0", id, result: { tools: TOOLS } } };
  }
  if (method === "tools/call") {
    const params = message.params && typeof message.params === "object" ? (message.params as { name?: string; arguments?: unknown }) : {};
    const name = params.name ?? "";
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
    const result = toolCall(input.ctx, input.authorization, name, args);
    if (!result) return { status: 200, body: rpcError(id, -32602, `Unknown tool ${name}.`) };
    const isError = result.status >= 400;
    return {
      status: result.status === 401 ? 401 : 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result.body) }],
          isError,
        },
      },
    };
  }
  if (method === "ping") return { status: 200, body: { jsonrpc: "2.0", id, result: {} } };
  return { status: 200, body: rpcError(id, -32601, `Method ${method} is not implemented.`) };
}
