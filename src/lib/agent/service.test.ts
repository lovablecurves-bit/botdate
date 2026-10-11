import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { openDatabase } from "../db/open";
import { messages } from "../db/schema";
import { approveOffer, getDesk, getMember, listShortlist } from "../domain";
import { isOpenPath } from "../http/public";
import { upcomingSaturdayLocal } from "../time";
import { dispatchAgent } from "./dispatch";
import { handleMcp } from "./mcp";
import { grokMatchmakerPrompt } from "./prompt";
import { browseMembers, callTool } from "./tools";
import { agentTokenStatus, issueAgentToken, memberForAgentToken, revokeAgentTokens } from "./tokens";

async function fresh() {
  return openDatabase(":memory:");
}

function auth(token: string) {
  return `Bearer ${token}`;
}

test("agent routes, the X callback, and the legal pages are outside the demo session gate", () => {
  assert.equal(isOpenPath("/api/agent/v1/me"), true);
  assert.equal(isOpenPath("/api/mcp"), true);
  assert.equal(isOpenPath("/api/me/private-prefs"), true);
  assert.equal(isOpenPath("/api/me/private-prefs/"), true);
  assert.equal(isOpenPath("/api/match/check"), true);
  assert.equal(isOpenPath("/api/match/check/"), true);
  assert.equal(isOpenPath("/api/me/profile"), false);
  assert.equal(isOpenPath("/api/auth/x/callback"), true);
  assert.equal(isOpenPath("/api/stripe/webhook"), true);
  assert.equal(isOpenPath("/api/stripe/portal"), false);
  assert.equal(isOpenPath("/privacy"), true);
  assert.equal(isOpenPath("/privacy/"), true);
  assert.equal(isOpenPath("/terms"), true);
  assert.equal(isOpenPath("/terms/"), true);
  assert.equal(isOpenPath("/api/waitlist/count"), true);
  assert.equal(isOpenPath("/api/waitlist/count/"), true);
  assert.equal(isOpenPath("/api/health"), true);
  assert.equal(isOpenPath("/api/health/"), true);
  assert.equal(isOpenPath("/api/waitlist"), false);
  assert.equal(isOpenPath("/admin/waitlist"), false);
  assert.equal(isOpenPath("/privacy-policy"), false);
  assert.equal(isOpenPath("/members"), false);
  assert.equal(isOpenPath("/shortlist"), false);
  assert.equal(isOpenPath("/login"), false);
});

test("a token reads and updates dealbreakers, exchanges desk notes, and holds a date until the human says yes", async () => {
  const ctx = await fresh();
  const issued = issueAgentToken(ctx, "avery");
  assert.ok(issued);
  assert.equal(agentTokenStatus(ctx, "avery").active, true);
  assert.equal(memberForAgentToken(ctx, issued.token)?.id, "avery");

  const me = dispatchAgent({ ctx, authorization: auth(issued.token), method: "GET", pathname: "/api/agent/v1/me", body: null });
  assert.equal(me.status, 200);
  assert.equal((me.body as { member: { displayName: string } }).member.displayName, "Avery Chen");

  const prefs = dispatchAgent({
    ctx,
    authorization: auth(issued.token),
    method: "PATCH",
    pathname: "/api/agent/v1/preferences",
    body: { niceToHaves: "Saturday mornings", ageMax: 40 },
  });
  assert.equal(prefs.status, 200);
  assert.equal((prefs.body as { preferences: { niceToHaves: string } }).preferences.niceToHaves, "Saturday mornings");

  const shortlist = dispatchAgent({ ctx, authorization: auth(issued.token), method: "GET", pathname: "/api/agent/v1/shortlist", body: null });
  assert.equal(shortlist.status, 200);
  const cards = (shortlist.body as { cards: { displayName: string }[] }).cards.map((card) => card.displayName);
  assert.equal(cards.some((name) => name.startsWith("Morgan")), false);
  assert.equal(cards.some((name) => name.startsWith("Sam")), true);

  const sent = dispatchAgent({
    ctx,
    authorization: auth(issued.token),
    method: "POST",
    pathname: "/api/agent/v1/desks/match_avery_sam/messages",
    body: { body: "Avery is free Saturday if the table is quiet." },
  });
  assert.equal(sent.status, 201);
  const thread = dispatchAgent({
    ctx,
    authorization: auth(issued.token),
    method: "GET",
    pathname: "/api/agent/v1/desks/match_avery_sam/messages",
    body: null,
  });
  const bodies = (thread.body as { messages: { body: string }[] }).messages.map((item) => item.body);
  assert.equal(bodies.includes("Avery is free Saturday if the table is quiet."), true);

  ctx.db
    .insert(messages)
    .values({
      id: "msg_private",
      matchId: "match_avery_sam",
      channel: "human",
      authorUserId: "avery",
      authorKind: "human",
      body: "This human note must stay off the agent API.",
      approvalStatus: "sent",
      scriptStep: null,
      edited: false,
      createdAt: new Date().toISOString(),
    })
    .run();
  const hidden = dispatchAgent({
    ctx,
    authorization: auth(issued.token),
    method: "GET",
    pathname: "/api/agent/v1/desks/match_avery_sam/messages",
    body: null,
  });
  assert.equal(
    (hidden.body as { messages: { body: string }[] }).messages.some((item) => item.body.includes("human note")),
    false,
  );

  const local = upcomingSaturdayLocal();
  const offer = dispatchAgent({
    ctx,
    authorization: auth(issued.token),
    method: "POST",
    pathname: "/api/agent/v1/dates",
    body: { matchId: "match_avery_sam", local, place: "Tartine Manufactory", note: "One hour." },
  });
  assert.equal(offer.status, 201);
  const offerBody = offer.body as { id: string; released: boolean; memberDecision: string };
  assert.equal(offerBody.released, false);
  assert.equal(offerBody.memberDecision, "pending");
  assert.equal(listShortlist(ctx, "avery").cards.find((card) => card.person.id === "sam")?.offerWaiting, true);
  assert.equal(listShortlist(ctx, "sam").cards.find((card) => card.person.id === "avery")?.offer?.id, undefined);

  assert.equal(approveOffer(ctx, "avery", offerBody.id).ok, true);
  assert.equal(listShortlist(ctx, "sam").cards.find((card) => card.person.id === "avery")?.offerWaiting, true);
  assert.equal(listShortlist(ctx, "avery").cards.find((card) => card.person.id === "sam")?.offerWaiting, false);

  const sam = getDesk(ctx, "sam", "match_avery_sam");
  assert.equal(sam?.items.some((item) => item.body.includes("Saturday")), true);
  ctx.close();
});

test("revoking a token stops the bot, and a paused matchmaker cannot send", async () => {
  const ctx = await fresh();
  const first = issueAgentToken(ctx, "avery");
  assert.ok(first);
  const second = issueAgentToken(ctx, "avery");
  assert.ok(second);
  assert.equal(memberForAgentToken(ctx, first.token), null);
  assert.equal(revokeAgentTokens(ctx, "avery"), true);
  const denied = dispatchAgent({ ctx, authorization: auth(second.token), method: "GET", pathname: "/api/agent/v1/me", body: null });
  assert.equal(denied.status, 401);
  const missing = dispatchAgent({ ctx, authorization: null, method: "GET", pathname: "/api/agent/v1/me", body: null });
  assert.equal(missing.status, 401);

  const live = issueAgentToken(ctx, "avery");
  assert.ok(live);
  const { setPaused } = await import("../domain");
  assert.equal(setPaused(ctx, "avery", true).ok, true);
  const blocked = dispatchAgent({
    ctx,
    authorization: auth(live.token),
    method: "POST",
    pathname: "/api/agent/v1/desks/match_avery_sam/messages",
    body: { body: "Should not send." },
  });
  assert.equal(blocked.status, 400);
  ctx.close();
});

test("MCP tools/call uses the same token and will not release a date", async () => {
  const ctx = await fresh();
  const issued = issueAgentToken(ctx, "avery");
  assert.ok(issued);
  const listed = handleMcp({
    ctx,
    authorization: auth(issued.token),
    message: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  const tools = ((listed.body as { result: { tools: { name: string }[] } }).result.tools).map((tool) => tool.name);
  assert.equal(tools.includes("get_onboarding"), true);
  assert.equal(tools.includes("submit_onboarding_answers"), true);
  assert.equal(tools.includes("get_my_profile"), true);
  assert.equal(tools.includes("update_my_profile"), true);
  assert.equal(tools.includes("browse_members"), true);
  assert.equal(tools.includes("send_bot_message"), true);
  assert.equal(tools.includes("list_bot_messages"), true);
  assert.equal(tools.includes("respond_to_date"), true);
  assert.equal(tools.includes("propose_date"), true);

  const called = handleMcp({
    ctx,
    authorization: auth(issued.token),
    message: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "propose_date",
        arguments: { matchId: "match_avery_riley", local: upcomingSaturdayLocal(), place: "The interval", note: "After the walk." },
      },
    },
  });
  assert.equal(called.status, 200);
  const text = (called.body as { result: { content: { text: string }[]; isError: boolean } }).result.content[0]?.text ?? "";
  const parsed = JSON.parse(text) as { released: boolean; message: string };
  assert.equal(parsed.released, false);
  assert.match(parsed.message, /until they accept/);
  assert.equal(listShortlist(ctx, "avery").cards.find((card) => card.person.id === "riley")?.offerWaiting, true);
  assert.equal(listShortlist(ctx, "riley").cards.find((card) => card.person.id === "avery")?.offerWaiting, false);
  ctx.close();
});

test("the Grok prompt and the integration doc describe the agent API", () => {
  const prompt = grokMatchmakerPrompt("https://botdate.example/api/agent/v1");
  assert.match(prompt, /BOTDATE_AGENT_TOKEN/);
  assert.match(prompt, /https:\/\/botdate\.example\/api\/mcp/);
  assert.match(prompt, /until they tap yes/);
  const doc = fs.readFileSync(new URL("../../../docs/GROK_BOT_INTEGRATION.md", import.meta.url), "utf8");
  assert.match(doc, /users\.read/);
  assert.match(doc, /tweet\.read/);
  assert.match(doc, /X_CLIENT_ID/);
  assert.match(doc, /propose_date/);
  assert.match(doc, /get_my_profile/);
  assert.match(doc, /list_bot_messages/);
  assert.match(doc, /FOUNDER_X_IDS/);
  assert.match(doc, /subscription inactive/);
  assert.match(doc, /BOTDATE_AGENT_TOKEN/);
  assert.equal(isOpenPath("/api/stripe/webhook"), true);
});

test("the connect card is one copy box and hides the MCP URL under technical details", () => {
  const card = fs.readFileSync(new URL("../../components/connect-card.tsx", import.meta.url), "utf8");
  const line = fs.readFileSync(new URL("../../components/connector-line.tsx", import.meta.url), "utf8");
  assert.match(card, /<h2>Copy connector line<\/h2>/);
  assert.match(card, /Show technical details/);
  assert.match(card, /MCP URL/);
  assert.equal(card.includes("token-box"), true);
  assert.match(card, /Generate a new key|Generate key/);
  assert.match(card, /Disconnect my bot/);
  assert.match(line, /Copied!/);
  assert.match(line, /connector-box/);
  const technical = card.slice(card.indexOf("Show technical details"));
  assert.match(technical, /MCP URL/);
  assert.equal(card.slice(0, card.indexOf("Show technical details")).includes("MCP URL"), false);
});

test("lookingFor is on the profile, filters browse_members, and can be updated", async () => {
  const previousKey = process.env.PREFS_KEY;
  process.env.PREFS_KEY = "ab".repeat(32);
  const ctx = await fresh();
  const avery = getMember(ctx, "avery");
  assert.ok(avery);
  const love = browseMembers(ctx, avery.id, { lookingFor: ["love"] });
  const friends = browseMembers(ctx, avery.id, { lookingFor: ["friends"] });
  assert.equal(love.some((person) => person.displayName === "Jordan Hale"), true);
  assert.equal(love.some((person) => person.displayName === "Morgan Ellis"), false);
  assert.equal(friends.length, 0);
  assert.deepEqual(love.find((person) => person.displayName === "Jordan Hale")?.profile.lookingFor, ["love"]);

  const updated = callTool(ctx, avery, "update_my_profile", { lookingFor: ["love", "friends"] });
  assert.equal(updated?.status, 200);
  const member = (updated?.body as { member: { profile: { lookingFor: string[] } } }).member;
  assert.deepEqual(member.profile.lookingFor, ["love", "friends"]);
  const rejected = callTool(ctx, avery, "browse_members", { lookingFor: "penpals" });
  assert.equal(rejected?.status, 400);
  ctx.close();
  if (previousKey === undefined) delete process.env.PREFS_KEY;
  else process.env.PREFS_KEY = previousKey;
});

test("update_my_profile accepts free-text fields and the inbox stays bot-only", async () => {
  const ctx = await fresh();
  const issued = issueAgentToken(ctx, "avery");
  assert.ok(issued);
  const updated = handleMcp({
    ctx,
    authorization: auth(issued.token),
    message: {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "update_my_profile",
        arguments: { city: "Lisbon", bio: "Ferry mornings.", interests: ["ferries", "soup"] },
      },
    },
  });
  assert.equal(updated.status, 200);
  const body = JSON.parse((updated.body as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "{}") as {
    member: { profile: { city: string; bio: string; interests: string[] } };
  };
  assert.equal(body.member.profile.city, "Lisbon");
  assert.equal(body.member.profile.bio, "Ferry mornings.");
  assert.deepEqual(body.member.profile.interests, ["ferries", "soup"]);

  ctx.db
    .insert(messages)
    .values({
      id: "msg_human_hidden",
      matchId: "match_avery_sam",
      channel: "human",
      authorUserId: "avery",
      authorKind: "human",
      body: "A private human line.",
      approvalStatus: "sent",
      scriptStep: null,
      edited: false,
      createdAt: new Date().toISOString(),
    })
    .run();
  const inbox = handleMcp({
    ctx,
    authorization: auth(issued.token),
    message: {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "list_bot_messages", arguments: { matchId: "match_avery_sam" } },
    },
  });
  assert.equal(inbox.status, 200);
  const inboxText = (inbox.body as { result: { content: { text: string }[] } }).result.content[0]?.text ?? "";
  assert.equal(inboxText.includes("A private human line."), false);
  ctx.close();
});
