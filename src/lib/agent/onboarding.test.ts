import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { openDatabase } from "../db/open";
import { getMember } from "../domain";
import { upsertXMember } from "../x/account";
import { handleMcp } from "./mcp";
import { grokConnectMessage, MCP_SERVER_INSTRUCTIONS } from "./onboarding";
import { issueAgentToken } from "./tokens";
import { callTool } from "./tools";

const MCP_URL = "https://botdate.vercel.app/api/mcp";
const PASTE = "Be my BotDate matchmaker. Connect to https://botdate.vercel.app/api/mcp, then interview me and set up my profile.";

const ada = { xUserId: "42", handle: "ada", name: "Ada Lovelace", bio: "Analytical.", avatarUrl: "" };
const grace = { xUserId: "77", handle: "grace", name: "Grace Hopper", bio: "Compiles.", avatarUrl: "" };

function toolText(body: unknown): Record<string, unknown> {
  const text = (body as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

test("the post-login connect screen shows one paste message and keeps the MCP URL copy", () => {
  assert.equal(grokConnectMessage(MCP_URL), PASTE);

  const root = path.resolve(import.meta.dirname, "../../..");
  const button = fs.readFileSync(path.join(root, "src/components/connect-grok-button.tsx"), "utf8");
  const paste = fs.readFileSync(path.join(root, "src/components/grok-paste.tsx"), "utf8");
  const connect = fs.readFileSync(path.join(root, "src/app/(app)/connect/page.tsx"), "utf8");
  const profile = fs.readFileSync(path.join(root, "src/app/profile/page.tsx"), "utf8");

  assert.match(profile, /ConnectGrokButton/);
  assert.match(button, /GrokPaste/);
  assert.match(button, /data-testid="mcp-url"/);
  assert.match(button, /data-testid="copy-mcp-url"/);
  assert.match(button, /Copied!/);
  assert.match(button, /Paste this into your Grok Bot to connect\./);
  assert.match(paste, /Copied!/);
  assert.match(paste, /data-testid="copy-matchmaker-message"/);
  assert.match(paste, /data-testid="matchmaker-message"/);
  assert.match(paste, /grokConnectMessage\(mcpUrl\)/);
  assert.match(paste, /Paste this into your Grok Bot\./);
  assert.match(paste, /copied \? "Copied!" : "Copy"/);
  assert.match(connect, /GrokPaste/);
  assert.match(connect, /mcpUrl/);
  assert.match(profile, /mcpUrl/);
});

test("initialize instructions and tool descriptions send a fresh bot to get_my_profile", async () => {
  const ctx = await openDatabase(":memory:");
  try {
    const issued = issueAgentToken(ctx, "avery");
    assert.ok(issued);
    const init = handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    });
    assert.equal(init.status, 200);
    const instructions = (init.body as { result: { instructions: string } }).result.instructions;
    assert.equal(instructions, MCP_SERVER_INSTRUCTIONS);
    assert.match(instructions, /Call get_my_profile first/);
    assert.match(instructions, /one question at a time and briefly/);
    assert.match(instructions, /age \(18\+\)/);
    assert.match(instructions, /city or location/);
    assert.match(instructions, /man or woman/);
    assert.match(instructions, /men, women, or either/);
    assert.match(instructions, /Looking for \(Love, Casual, or Friends\)/);
    assert.match(instructions, /preferred age range and distance/);
    assert.match(instructions, /must-haves and dealbreakers/);
    assert.match(instructions, /up to 6 photos if supported/);
    assert.match(instructions, /update_my_profile/);
    assert.match(instructions, /confirm the profile is complete/);
    assert.match(instructions, /start screening matches/);
    assert.match(instructions, /Only ping the human when a date is ready to offer/);
    assert.match(instructions, /Keep profiles private/);

    const listed = handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    const tools = (listed.body as { result: { tools: { name: string; description: string }[] } }).result.tools;
    const byName = new Map(tools.map((tool) => [tool.name, tool.description]));
    assert.match(byName.get("get_my_profile") ?? "", /Call this first/);
    assert.match(byName.get("get_my_profile") ?? "", /next_step/);
    for (const name of ["update_my_profile", "browse_members", "get_member", "send_bot_message", "list_bot_messages", "propose_date", "respond_to_date"]) {
      assert.match(byName.get(name) ?? "", /get_my_profile first/, name);
    }
    assert.match(byName.get("propose_date") ?? "", /only when a date is ready to offer/);
    assert.match(byName.get("browse_members") ?? "", /Incomplete profiles stay private/);
    assert.match(byName.get("update_my_profile") ?? "", /Photos are not accepted/);
  } finally {
    ctx.close();
  }
});

test("get_my_profile interviews an incomplete member, then confirms a private complete profile", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  try {
    const created = upsertXMember(ctx, ada);
    const member = getMember(ctx, created.userId);
    assert.ok(member);
    const first = callTool(ctx, member, "get_my_profile", {});
    assert.equal(first?.status, 200);
    const opening = first?.body as { profileComplete: boolean; next_step: string; member: { id: string; profile: { age: number | null } } };
    assert.equal(opening.profileComplete, false);
    assert.equal(opening.member.id, created.userId);
    assert.equal(opening.member.profile.age, null);
    assert.match(opening.next_step, /Interview this member right away, one question at a time and briefly/);
    assert.match(opening.next_step, /age \(18\+\)/);
    assert.match(opening.next_step, /Looking for \(Love, Casual, or Friends\)/);
    assert.match(opening.next_step, /up to 6 photos if supported/);
    assert.match(opening.next_step, /update_my_profile/);
    assert.match(opening.next_step, /Only ping the human when a date is ready to offer/);
    assert.match(opening.next_step, /Keep profiles private/);
    assert.match(opening.next_step, /Still missing: age \(18\+\), city or location/);

    const saved = callTool(ctx, member, "update_my_profile", {
      age: 29,
      city: "Austin",
      gender: "woman",
      seeking: "men",
      datingIntent: "serious",
      ageMin: 25,
      ageMax: 40,
      cities: ["Austin"],
      niceToHaves: "Friends nearby, within 15 miles.",
      locked: true,
    });
    assert.equal(saved?.status, 200);
    const done = saved?.body as { profileComplete: boolean; next_step: string; member: { id: string } };
    assert.equal(done.profileComplete, true);
    assert.equal(done.member.id, created.userId);
    assert.match(done.next_step, /^The profile is complete\. Start screening matches\./);
    assert.match(done.next_step, /Only ping the human when a date is ready to offer/);
    assert.equal(done.next_step.includes("Interview this member right away"), false);

    const other = upsertXMember(ctx, grace);
    const viewer = getMember(ctx, other.userId);
    assert.ok(viewer);
    const hidden = callTool(ctx, getMember(ctx, created.userId)!, "browse_members", {});
    assert.equal((hidden?.body as { members: { id: string }[] }).members.some((person) => person.id === other.userId), false);
    const privateProfile = callTool(ctx, viewer, "get_member", { memberId: created.userId });
    assert.equal(privateProfile?.status, 200);
    const viewed = privateProfile?.body as { member: { id: string }; next_step?: string; profileComplete?: boolean };
    assert.equal(viewed.member.id, created.userId);
    assert.equal(viewed.next_step, undefined);
    assert.equal(viewed.profileComplete, undefined);
    const listed = callTool(ctx, viewer, "browse_members", {});
    const cards = (listed?.body as { members: { id: string; next_step?: string }[] }).members;
    const card = cards.find((person) => person.id === created.userId);
    assert.ok(card);
    assert.equal(card.next_step, undefined);

    const issued = issueAgentToken(ctx, created.userId);
    assert.ok(issued);
    const viaMcp = handleMcp({
      ctx,
      authorization: `Bearer ${issued.token}`,
      message: { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_my_profile", arguments: {} } },
    });
    const parsed = toolText(viaMcp.body);
    assert.equal(parsed.profileComplete, true);
    assert.match(String(parsed.next_step), /^The profile is complete/);
  } finally {
    ctx.close();
  }
});
