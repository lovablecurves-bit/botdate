import type { BotDateDb } from "../db/open";
import { MCP_SERVER_INSTRUCTIONS } from "./onboarding";
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
    description:
      "Call this first, before any other tool. Read this member's private profile. The result includes profileComplete and next_step. If the profile is incomplete, follow next_step and interview in this order: age and city first; then their gender and who they're seeking; then the age range and areas they'd date in; then what they want (Love, Casual, or Friends); then kids and smoking; last, nice-to-haves and dealbreakers. Anything intimate stays private with the member's own bot and never goes on the profile. Do not browse, message, or reveal other profiles until it is complete.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "update_my_profile",
    description:
      "Call get_my_profile first. Save answers in interview order: age and city, then gender and who they're seeking, then age range and areas they'd date in, then what they want (Love is datingIntent serious, Casual is datingIntent casual, Friends in niceToHaves), then kids and smoking, last nice-to-haves and dealbreakers. Anything intimate stays private with the member's own bot and never goes on the profile. Do not write intimate details into bio, occupation, interests, or niceToHaves. Age is a whole number from 18 to 99. Gender is man or woman. Seeking is men, women, or either. Age range is ageMin and ageMax. Areas they'd date in go in cities. Set locked true when dealbreakers are saved. Photos are not accepted; ask for up to 6 photos if supported by another tool. Omitted fields stay as they are. City, bio, occupation, interests, and nice-to-haves are free text.",
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
        datingIntent: {
          type: "string",
          enum: ["serious", "casual"],
          description: "Looking for Love (serious) or Casual. Record Friends in niceToHaves.",
        },
        interests: { type: "array", items: { type: "string" } },
        ageMin: { type: "integer" },
        ageMax: { type: "integer" },
        cities: { type: "array", items: { type: "string" } },
        smoking: { type: "string", enum: ["no", "any"] },
        kids: { type: "string", enum: ["wants", "doesnt", "any"] },
        intent: { type: "string", enum: ["serious", "casual", "any"] },
        seeking: { type: "string", enum: ["men", "women", "either"], description: "Seeking men, women, or either." },
        niceToHaves: {
          type: "string",
          description: "Must-haves, Friends, and a distance limit.",
        },
        locked: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "browse_members",
    description:
      "Call get_my_profile first and finish onboarding when the profile is incomplete. Then browse members who can be contacted. Incomplete profiles stay private and are hidden until that member's bot fills age, city, gender, who they are seeking, and preferences. Inactive subscriptions are hidden.",
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
    description:
      "Call get_my_profile first. Read one other member's public profile. Incomplete profiles stay private and are not returned. Inactive subscriptions are not returned.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" } },
      required: ["memberId"],
      additionalProperties: false,
    },
  },
  {
    name: "send_bot_message",
    description:
      "Call get_my_profile first and finish onboarding when the profile is incomplete. Send a bot-to-bot note. It is delivered without a human approval. Do not ping the human. Refuses while the matchmaker is paused, and refuses if the other member's subscription is inactive.",
    inputSchema: {
      type: "object",
      properties: { memberId: { type: "string" }, matchId: { type: "string" }, body: { type: "string" } },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    name: "list_bot_messages",
    description:
      "Call get_my_profile first. Inbox of bot-to-bot messages. Pass matchId or memberId to read one thread. Human chat is not included. Keep profiles private.",
    inputSchema: {
      type: "object",
      properties: { matchId: { type: "string" }, memberId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "propose_date",
    description:
      "Call get_my_profile first and finish onboarding when the profile is incomplete. Offer a date. This is the only time to ping the human, and only when a date is ready to offer. They see who, why, and the proposed time and place. The other person is not pinged until this member accepts. Bot chat stays private.",
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
    description: "Call get_my_profile first. Accept or decline a date offer for this member.",
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
          instructions: MCP_SERVER_INSTRUCTIONS,
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
