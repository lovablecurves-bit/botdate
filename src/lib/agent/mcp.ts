import type { BotDateDb } from "../db/open";
import { authenticateAgent } from "./tokens";
import { callTool } from "./tools";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

const PROTOCOL = "2025-03-26";

const TOOLS = [
  {
    name: "get_my_profile",
    description: "Read this member's profile and preferences. Free-text fields are included.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_my_profile",
    description: "Update profile fields from the conversation. Omitted fields stay as they are. City, bio, occupation, interests, and nice-to-haves are free text.",
    inputSchema: {
      type: "object",
      properties: {
        displayName: { type: "string" },
        age: { type: "integer" },
        city: { type: "string" },
        occupation: { type: "string" },
        bio: { type: "string" },
        gender: { type: "string", enum: ["man", "woman"], description: "Man or Woman." },
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
    name: "browse_members",
    description: "Browse members who can be contacted. Incomplete profiles are hidden until that member's bot fills age, city, gender, and preferences. Inactive subscriptions are hidden.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        city: { type: "string" },
        ageMin: { type: "integer" },
        ageMax: { type: "integer" },
        intent: { type: "string", enum: ["serious", "casual", "any"] },
        kids: { type: "string", enum: ["wants", "open", "doesnt", "any"] },
        smoking: { type: "string", enum: ["no", "any"] },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_member",
    description: "Read one member's public profile. Incomplete profiles and inactive subscriptions are not returned.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" } },
      required: ["memberId"],
      additionalProperties: false,
    },
  },
  {
    name: "send_bot_message",
    description: "Send a bot-to-bot note. It is delivered without a human approval. Refuses while the matchmaker is paused, and refuses if the other member's subscription is inactive.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" }, matchId: { type: "string" }, body: { type: "string" } },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    name: "list_bot_messages",
    description: "Inbox of bot-to-bot messages. Pass matchId or memberId to read one thread. Human chat is not included.",
    inputSchema: {
      type: "object",
      properties: { matchId: { type: "string" }, memberId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "propose_date",
    description: "Offer a date. This pings the human in BotDate with who, why, and the proposed time and place. The other person is not pinged until this member accepts. Bot chat stays private.",
    inputSchema: {
      type: "object",
      properties: {
        matchId: { type: "string" },
        memberId: { type: "string" },
        local: { type: "string", description: "Pacific local time, YYYY-MM-DDTHH:mm" },
        place: { type: "string" },
        note: { type: "string" },
      },
      required: ["local", "place"],
      additionalProperties: false,
    },
  },
  {
    name: "respond_to_date",
    description: "Accept or decline a date offer for this member.",
    inputSchema: {
      type: "object",
      properties: {
        proposalId: { type: "string" },
        decision: { type: "string", enum: ["accept", "decline"] },
      },
      required: ["proposalId", "decision"],
      additionalProperties: false,
    },
  },
] as const;

function rpcError(id: JsonRpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function encodeMcpHttp(body: unknown, accept: string | null): { contentType: string; payload: string } {
  const header = accept ?? "";
  const wantsSse = header.includes("text/event-stream") && !header.includes("application/json");
  if (wantsSse) {
    return { contentType: "text/event-stream", payload: `event: message\ndata: ${JSON.stringify(body)}\n\n` };
  }
  return { contentType: "application/json", payload: JSON.stringify(body) };
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
  if (method === "tools/list" || method === "tools/call") {
    const auth = authenticateAgent(input.ctx, input.authorization);
    if (!auth.ok) return { status: auth.status, body: rpcError(id, auth.status === 402 ? 402 : -32001, auth.body.error) };
    if (method === "tools/list") {
      return { status: 200, body: { jsonrpc: "2.0", id, result: { tools: TOOLS } } };
    }
    const params = message.params && typeof message.params === "object" ? (message.params as { name?: string; arguments?: unknown }) : {};
    const name = params.name ?? "";
    const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
    const result = callTool(input.ctx, auth.member, name, args);
    if (!result) return { status: 200, body: rpcError(id, -32602, `Unknown tool ${name}.`) };
    const isError = result.status >= 400;
    return {
      status: result.status === 401 || result.status === 402 ? result.status : 200,
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
