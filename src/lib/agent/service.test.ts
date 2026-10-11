import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { openDatabase } from "../db/open";
import { messages } from "../db/schema";
import { approveOffer, getDesk, listShortlist } from "../domain";
import { isOpenPath } from "../http/public";
import { upcomingSaturdayLocal } from "../time";
import { dispatchAgent } from "./dispatch";
import { handleMcp } from "./mcp";
import { grokMatchmakerPrompt } from "./prompt";
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
  assert.equal(isOpenPath("/api/auth/x/callback"), true);
  assert.equal(isOpenPath("/api/stripe/webhook"), true);
  assert.equal(isOpenPath("/api/stripe/portal"), false);
  assert.equal(isOpenPath("/privacy"), true);
  assert.equal(isOpenPath("/privacy/"), true);
  assert.equal(isOpenPath("/terms"), true);
  assert.equal(isOpenPath("/terms/"), true);
  assert.equal(isOpenPath("/api/waitlist/count"), true);
  assert.equal(isOpenPath("/api/waitlist/count/"), true);
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
  assert.equal(tools.includes("propose_date"), true);
  assert.equal(tools.includes("send_desk_message"), true);

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
  assert.match(parsed.message, /until they approve/);
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
  assert.match(doc, /BOTDATE_AGENT_TOKEN/);
});
