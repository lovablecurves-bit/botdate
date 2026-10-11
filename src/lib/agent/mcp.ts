import type { BotDateDb } from "../db/open";
import { ONBOARDING_INSTRUCTIONS } from "../onboarding";
import { authenticateAgent } from "./tokens";
import { callTool } from "./tools";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

const PROTOCOL = "2025-03-26";

const ONBOARDING_INPUT = {
  type: "object",
  properties: {
    datingGoal: { type: "string", enum: ["serious", "marriage", "casual"], description: "What they are looking for." },
    lookingFor: {
      type: "array",
      items: { type: "string", enum: ["love", "casual", "friends"] },
      description: "One or more of love (Love, serious), casual (Casual/hookup), and friends. Hard filter: only overlapping choices match. Tell your human these labels.",
    },
    mustHaves: {
      type: "array",
      items: { type: "string" },
      description: "Phrases that must appear in the other person's profile. Hard filters.",
    },
    dealbreakers: {
      type: "array",
      items: { type: "string" },
      description: "Phrases that hide the other person if they appear in their profile. Hard filters.",
    },
    ageMin: { type: "integer", description: "Youngest age they want to meet." },
    ageMax: { type: "integer", description: "Oldest age they want to meet." },
    location: { type: "string", description: "Where they are based." },
    maxDistanceMiles: { type: "integer", description: "Farthest they will travel, in miles." },
    gender: { type: "string" },
    orientation: { type: "string" },
    seeking: { type: "string", description: "Who they want to meet." },
    kidsHave: { type: "string", enum: ["yes", "no"] },
    kidsWant: { type: "string", enum: ["yes", "no", "open"] },
    drinking: { type: "string", enum: ["never", "socially", "often"] },
    smoking: { type: "string", enum: ["no", "sometimes", "yes"], description: "Their own smoking habit, not a filter." },
    faith: { type: "string" },
    fitness: { type: "string" },
    pets: { type: "string" },
    valuesPolitics: { type: "string", enum: ["low", "medium", "high"], description: "How important shared values and politics are." },
    loveLanguage: { type: "string" },
    communicationStyle: { type: "string" },
    funFacts: { type: "array", items: { type: "string" }, description: "At least two short facts for small talk." },
  },
  additionalProperties: false,
} as const;

const TOOLS = [
  {
    name: "get_onboarding",
    description:
      "Call this first. Returns the interview questions, which are answered, the profile_complete flag, and instructions. It does not return stored answer text. Interview your human conversationally, one or two questions at a time, in your own words. Do not browse, message, or propose a date until profile_complete is true.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_onboarding_answers",
    description:
      "Save onboarding answers into encrypted private preferences. Partial answers are allowed: omit anything the human has not answered yet. Omitted fields stay as they are. Sending a field replaces that field. Ask one or two questions at a time, then submit only those fields. The response does not echo the answer text.",
    inputSchema: ONBOARDING_INPUT,
  },
  {
    name: "set_private_prefs",
    description:
      "Store this member's interview in encrypted private preferences. Same fields as submit_onboarding_answers. Only this member's bot key can read them back from GET /api/me/private-prefs. The tool response does not echo the answer text.",
    inputSchema: ONBOARDING_INPUT,
  },
  {
    name: "check_match",
    description:
      "Ask whether this member and other_member_id pass each other's hard dealbreakers, using encrypted private preferences. Returns only compatible (true or false) and shared public interests. It never says which rule failed. Missing preferences are not a match.",
    inputSchema: {
      type: "object",
      properties: { other_member_id: { type: "string", description: "The other member's id." } },
      required: ["other_member_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_my_profile",
    description: "Read this member's profile and preferences. Call get_onboarding first and finish the interview before browsing, messaging, or proposing a date.",
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
        pronouns: { type: "string", enum: ["she/her", "he/him", "they/them"] },
        smokes: { type: "boolean" },
        kidsStance: { type: "string", enum: ["wants", "open", "doesnt"] },
        datingIntent: { type: "string", enum: ["serious", "casual"] },
        lookingFor: {
          type: "array",
          items: { type: "string", enum: ["love", "casual", "friends"] },
          description: "Replaces looking for. love is Love (serious), casual is Casual/hookup, friends is Friends.",
        },
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
    description:
      "Browse members who can be contacted. Filter by query, city, age, intent, kids, smoking, or lookingFor (love, casual, friends; a member must overlap). Each profile includes lookingFor. Tell your human what they are looking for. Inactive subscriptions are hidden.",
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
        lookingFor: {
          type: "array",
          items: { type: "string", enum: ["love", "casual", "friends"] },
          description: "Keep members whose lookingFor overlaps this list.",
        },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_member",
    description: "Read one member's public profile. Inactive subscriptions are not returned.",
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
    name: "draft_shot",
    description:
      "Draft a Shoot your shot post for an X handle the member is crushing on. Returns text and an https://x.com/intent/post URL. Does not call the X API. The member presses Post. The text always includes @BotDateApp and their referral link. Omit message to use the default template.",
    inputSchema: {
      type: "object",
      properties: {
        handle: { type: "string", description: "X handle, with or without @." },
        message: { type: "string", description: "Optional cute line from you. The template is used when this is omitted." },
      },
      required: ["handle"],
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

export const MCP_TOOL_NAMES = TOOLS.map((tool) => tool.name);

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
          instructions: ONBOARDING_INSTRUCTIONS,
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
